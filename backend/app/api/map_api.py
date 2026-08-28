import asyncio
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import RouteHistory, Supplier
from app.schemas import CompareRequest, CoordinateRequest, DrivingRouteRequest, GeocodeRequest, PlaceSearchRequest, RouteRequest
from app.services.map import AMapService, get_map_service


router = APIRouter(prefix="/map", tags=["地图"])


@router.post("/geocode")
async def geocode(payload: GeocodeRequest, service: AMapService = Depends(get_map_service)) -> dict:
    return await service.geocode(payload.address, payload.city)


@router.post("/place-search")
async def place_search(payload: PlaceSearchRequest, service: AMapService = Depends(get_map_service)) -> list[dict]:
    return await service.place_search(payload.keyword, payload.city, payload.limit)


@router.post("/resolve-supplier/{supplier_id}")
async def resolve_supplier_location(
    supplier_id: int,
    db: Session = Depends(get_db),
    service: AMapService = Depends(get_map_service),
) -> dict[str, Any]:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="供应商不存在")
    place = await service.best_place_match(supplier.name, threshold=0.7)
    if place is None:
        raise HTTPException(status_code=404, detail="高德搜索未找到名称相似度达到 70% 的精确点位")
    supplier.province = place["province"] or supplier.province
    supplier.city = place["city"] or supplier.city
    supplier.district = place["district"] or supplier.district
    supplier.address = place["formatted_address"]
    supplier.longitude = place["longitude"]
    supplier.latitude = place["latitude"]
    supplier.location_accuracy = "geocoded"
    db.commit()
    return {"supplier_id": supplier.id, **place}


@router.post("/reverse-geocode")
async def reverse_geocode(payload: CoordinateRequest, service: AMapService = Depends(get_map_service)) -> dict:
    return await service.reverse_geocode(payload.longitude, payload.latitude)


@router.post("/driving-route")
async def driving_route(payload: DrivingRouteRequest, service: AMapService = Depends(get_map_service)) -> dict:
    return await service.driving_route(
        (payload.origin.longitude, payload.origin.latitude),
        (payload.destination.longitude, payload.destination.latitude),
    )


@router.post("/route")
async def route(payload: RouteRequest, db: Session = Depends(get_db), service: AMapService = Depends(get_map_service)) -> dict:
    origin = db.get(Supplier, payload.origin_id)
    destination = db.get(Supplier, payload.destination_id)
    if origin is None or destination is None:
        raise HTTPException(status_code=404, detail="起点或终点不存在")
    result = await service.driving_route((origin.longitude, origin.latitude), (destination.longitude, destination.latitude))
    db.add(RouteHistory(origin_supplier_id=origin.id, destination_id=destination.id, distance=result["distance_km"], duration=result["duration_minutes"]))
    db.commit()
    return {**result, "origin": origin.name, "destination": destination.name}


@router.post("/compare")
async def compare(payload: CompareRequest, db: Session = Depends(get_db), service: AMapService = Depends(get_map_service)) -> dict[str, Any]:
    destination = db.get(Supplier, payload.destination_id)
    if destination is None:
        raise HTTPException(status_code=404, detail="目的地不存在")
    if destination.supplier_type != "project":
        raise HTTPException(status_code=400, detail="货源比价的目的地必须是工地")
    query = select(Supplier).where(Supplier.id != destination.id, Supplier.supplier_type != "project")
    suppliers = [
        supplier
        for supplier in db.scalars(query).all()
        if any(payload.category is None or product.category == payload.category for product in supplier.products)
    ]

    semaphore = asyncio.Semaphore(4)

    async def calculate_supplier_route(supplier: Supplier) -> tuple[Supplier, dict[str, Any] | None, str | None]:
        try:
            async with semaphore:
                route = await service.driving_route(
                    (supplier.longitude, supplier.latitude),
                    (destination.longitude, destination.latitude),
                )
            return supplier, route, None
        except HTTPException as exc:
            return supplier, None, str(exc.detail)

    route_results = await asyncio.gather(*(calculate_supplier_route(supplier) for supplier in suppliers))
    rows: list[dict] = []
    failures: list[dict] = []
    for supplier, route, error in route_results:
        if route is None:
            failures.append({"supplier_id": supplier.id, "supplier": supplier.name, "error": error or "路径规划失败"})
            continue

        distance_km = (Decimal(str(route["distance_meters"])) / Decimal("1000")).quantize(Decimal("0.1"))
        freight = (distance_km * payload.freight_rate).quantize(Decimal("0.01"))
        products = [product for product in supplier.products if payload.category is None or product.category == payload.category]
        for product in products:
            landed = (product.price + freight).quantize(Decimal("0.01"))
            rows.append(
                {
                    "supplier_id": supplier.id,
                    "supplier": supplier.name,
                    "product": " ".join(filter(None, [product.brand, product.spec or product.category])),
                    "brand": product.brand or "-",
                    "spec": product.spec or product.category,
                    "category": product.category,
                    "price": float(product.price),
                    "distance_meters": route["distance_meters"],
                    "distance_km": float(distance_km),
                    "duration_minutes": route["duration_minutes"],
                    "freight_rate": float(payload.freight_rate),
                    "freight": float(freight),
                    "landed_price": float(landed),
                }
            )
        db.add(
            RouteHistory(
                origin_supplier_id=supplier.id,
                destination_id=destination.id,
                distance=float(distance_km),
                duration=route["duration_minutes"],
            )
        )

    if suppliers and not rows:
        reason = failures[0]["error"] if failures else "未知错误"
        status_code = 429 if "额度已用尽" in reason or "请求过于频繁" in reason else 502
        raise HTTPException(status_code=status_code, detail=f"全部供应商的高德驾车路径规划均失败：{reason}")
    db.commit()
    return {
        "items": sorted(rows, key=lambda item: item["landed_price"]),
        "failed_suppliers": failures,
        "route_source": "amap_driving_v5",
        "coordinate_system": "GCJ-02",
    }
