from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PriceHistory, Product, Supplier
from app.schemas import AIParseRequest, SupplierCreate
from app.services.deepseek import parse_supplier_batch, parse_supplier_text
from app.services.map import AMapService, get_map_service


router = APIRouter(prefix="/ai", tags=["AI录入"])


@router.post("/parse")
async def parse_text(payload: AIParseRequest) -> dict:
    # 此接口只解析并返回预览；保存必须由用户在前端确认后另行调用供应商创建接口。
    return await parse_supplier_text(payload.text)


def _infer_supplier_type(item: dict[str, Any]) -> str:
    supplier_type = str(item.get("supplier_type") or "")
    if supplier_type and supplier_type != "mixed":
        return supplier_type
    name = str(item.get("supplier_name") or "")
    for keyword, inferred in (("混凝土", "concrete"), ("工地", "project"), ("项目", "project"), ("码头", "terminal"), ("中转", "warehouse"), ("仓库", "warehouse")):
        if keyword in name:
            return inferred
    categories = {product.get("category") for product in item.get("products") or []}
    if categories == {"水泥"}:
        return "cement"
    if categories == {"矿粉"}:
        return "slag"
    if categories == {"粉煤灰"}:
        return "flyash"
    return "mixed"


@router.post("/batch-import")
async def batch_import(
    payload: AIParseRequest,
    db: Session = Depends(get_db),
    map_service: AMapService = Depends(get_map_service),
) -> dict[str, Any]:
    parsed_items = await parse_supplier_batch(payload.text)
    existing_names = set(db.scalars(select(Supplier.name)).all())

    async def locate(row_number: int, item: dict[str, Any]) -> tuple[int, dict[str, Any], dict[str, Any] | None, str | None]:
        name = str(item.get("supplier_name") or "").strip()
        if not name:
            return row_number, item, None, "AI 未识别出企业名称"
        if name in existing_names:
            return row_number, item, None, "数据库中已存在同名企业"
        try:
            place = await map_service.best_place_match(
                name,
                threshold=0.7,
                address_hint=str(item.get("address") or ""),
                district_hint=str(item.get("district") or ""),
            )
        except HTTPException as exc:
            detail = str(exc.detail)
            reason = detail if detail == "高德搜索请求过快，系统稍后自动重试" else f"高德搜索失败：{detail}"
            return row_number, item, None, reason
        if place is None:
            return row_number, item, None, "高德未找到名称相似度达到 70% 的点位"
        return row_number, item, place, None

    located_items = [await locate(index + 1, item) for index, item in enumerate(parsed_items)]
    imported: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for row_number, item, place, error in located_items:
        name = str(item.get("supplier_name") or "").strip() or f"第 {row_number} 行"
        if place is None:
            failed.append({"row_number": row_number, "name": name, "reason": error or "无法定位"})
            continue
        if name in existing_names:
            failed.append({"row_number": row_number, "name": name, "reason": "本次批量数据中存在重复企业名称"})
            continue
        responsible_person = str(item.get("responsible_person") or "").strip()
        source_remark = str(item.get("remark") or "").strip()
        remark = "；".join(part for part in (f"负责人：{responsible_person}" if responsible_person else "", source_remark) if part)
        try:
            supplier_payload = SupplierCreate.model_validate(
                {
                    "name": name,
                    "supplier_type": _infer_supplier_type(item),
                    "province": place["province"] or "浙江省",
                    "city": place["city"] or "温州市",
                    "district": place["district"],
                    "address": place["formatted_address"],
                    "longitude": place["longitude"],
                    "latitude": place["latitude"],
                    "location_accuracy": "geocoded",
                    "contact": item.get("contact") or responsible_person or None,
                    "phone": item.get("phone") or None,
                    "remark": remark or None,
                    "products": item.get("products") or [],
                }
            )
            supplier = Supplier(**supplier_payload.model_dump(exclude={"products"}))
            db.add(supplier)
            db.flush()
            for product_data in supplier_payload.products:
                product = Product(supplier_id=supplier.id, **product_data.model_dump())
                db.add(product)
                db.flush()
                db.add(PriceHistory(product_id=product.id, price=product.price, date=date.today(), remark="AI 批量导入初始报价"))
            db.commit()
            existing_names.add(name)
            imported.append(
                {
                    "supplier_id": supplier.id,
                    "name": name,
                    "matched_name": place["name"],
                    "match_score": place["match_score"],
                    "address": place["formatted_address"],
                    "longitude": place["longitude"],
                    "latitude": place["latitude"],
                    "coordinate_system": "GCJ-02",
                }
            )
        except (ValidationError, ValueError) as exc:
            db.rollback()
            failed.append({"row_number": row_number, "name": name, "reason": f"数据校验失败：{exc}"})
        except Exception:
            db.rollback()
            failed.append({"row_number": row_number, "name": name, "reason": "数据库保存失败"})

    return {
        "total": len(parsed_items),
        "imported_count": len(imported),
        "failed_count": len(failed),
        "match_threshold": 0.7,
        "imported": imported,
        "failed": failed,
    }
