import json
import re
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings


SYSTEM_PROMPT = """你是建材供应商资料结构化助手。只返回合法 JSON，不要 Markdown。
格式：{"supplier_name":"", "supplier_type":"cement|slag|flyash|mixed|terminal|warehouse|concrete|project", "address":"", "district":"", "responsible_person":"", "contact":"", "phone":"", "remark":"", "products":[{"category":"水泥|矿粉|粉煤灰","brand":"","spec":"","price":0,"unit":"元/吨"}]}。

必须识别表格、制表符文本、Excel 粘贴内容和自然语言中的以下表头同义词：
- 企业名称、公司名称、供应商名称 -> supplier_name
- 企业地址、公司地址、详细地址 -> address
- 负责人 -> responsible_person
- 联系人 -> contact；若只有负责人没有联系人，可同时用负责人作为 contact
- 电话、联系电话、手机、手机号 -> phone
- 说明、备注 -> remark
- 水泥 -> category=水泥
- 矿粉 -> category=矿粉
- 煤灰、粉煤灰、飞灰 -> category=粉煤灰
- 空白表头或全角空格表头必须忽略

材料列中的单个数字表示该材料当前价格，单位默认元/吨；单元格为空、-、无、未报价或价格为 0 时，不要生成对应 product。
不得把电话号码、序号、日期识别为材料价格。纠正常见规格写法（如 PO425 -> P.O42.5、二级灰 -> II级），未知字段使用空字符串，不得编造地址、联系人、价格或联系方式。"""

BATCH_SYSTEM_PROMPT = f"""{SYSTEM_PROMPT}

当前任务是批量识别。输入可能包含多行 Excel/表格数据，每一行代表一家企业。
必须返回：{{"suppliers":[上述格式的企业对象, ...]}}。
不得合并不同行，不得遗漏有企业名称的行；表头行不能作为企业数据。"""


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _positive_price(value: Any) -> float | None:
    if isinstance(value, dict):
        value = value.get("price")
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    text = _text(value)
    if not text or text in {"-", "—", "无", "未报价", "暂无"}:
        return None
    matches = re.findall(r"(?<!\d)(\d+(?:\.\d+)?)(?!\d)", text.replace(",", ""))
    if not matches:
        return None
    price = float(matches[-1])
    return price if price > 0 else None


def normalize_supplier_data(data: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "supplier_name": ("supplier_name", "企业名称", "公司名称", "供应商名称"),
        "address": ("address", "企业地址", "公司地址", "详细地址"),
        "responsible_person": ("responsible_person", "负责人"),
        "contact": ("contact", "联系人"),
        "phone": ("phone", "电话", "联系电话", "手机", "手机号"),
        "remark": ("remark", "说明", "备注"),
    }

    def alias_value(field: str) -> str:
        return next((_text(data.get(key)) for key in aliases[field] if _text(data.get(key))), "")

    responsible_person = alias_value("responsible_person")
    contact = alias_value("contact") or responsible_person
    normalized_products: list[dict[str, Any]] = []
    category_aliases = {"水泥": "水泥", "矿粉": "矿粉", "煤灰": "粉煤灰", "粉煤灰": "粉煤灰", "飞灰": "粉煤灰"}

    for product in data.get("products") or []:
        if not isinstance(product, dict):
            continue
        category = category_aliases.get(_text(product.get("category")))
        price = _positive_price(product.get("price"))
        if not category or price is None:
            continue
        spec = _text(product.get("spec"))
        compact_spec = spec.upper().replace(" ", "")
        if compact_spec in {"PO425", "PO42.5", "P.O425", "P.O42.5"}:
            spec = "P.O42.5"
        elif spec in {"二级灰", "二级", "Ⅱ级"}:
            spec = "II级"
        normalized_products.append(
            {
                "category": category,
                "brand": _text(product.get("brand")),
                "spec": spec,
                "price": price,
                "unit": _text(product.get("unit")) or "元/吨",
            }
        )

    existing_categories = {product["category"] for product in normalized_products}
    for header, category in category_aliases.items():
        if header not in data or category in existing_categories:
            continue
        price = _positive_price(data.get(header))
        if price is not None:
            normalized_products.append({"category": category, "brand": "", "spec": "", "price": price, "unit": "元/吨"})
            existing_categories.add(category)

    supplier_type = _text(data.get("supplier_type"))
    valid_types = {"cement", "slag", "flyash", "mixed", "terminal", "warehouse", "concrete", "project"}
    return {
        "supplier_name": alias_value("supplier_name"),
        "supplier_type": supplier_type if supplier_type in valid_types else "mixed",
        "address": alias_value("address"),
        "district": _text(data.get("district")),
        "responsible_person": responsible_person,
        "contact": contact,
        "phone": alias_value("phone"),
        "remark": alias_value("remark"),
        "products": normalized_products,
    }


async def _request_deepseek(system_prompt: str, text: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise HTTPException(status_code=503, detail="尚未配置 DEEPSEEK_API_KEY")
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": text}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
                json=payload,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                raise json.JSONDecodeError("AI 返回内容不是对象", content, 0)
            return parsed
    except (httpx.HTTPError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="AI 解析失败，请稍后重试") from exc


async def parse_supplier_text(text: str) -> dict[str, Any]:
    return normalize_supplier_data(await _request_deepseek(SYSTEM_PROMPT, text))


async def parse_supplier_batch(text: str) -> list[dict[str, Any]]:
    parsed = await _request_deepseek(BATCH_SYSTEM_PROMPT, text)
    items = parsed.get("suppliers")
    if not isinstance(items, list):
        items = [parsed]
    return [normalize_supplier_data(item) for item in items if isinstance(item, dict)]
