import asyncio

from fastapi import HTTPException
import pytest

import app.services.map.amap as amap_module
from app.services.deepseek import normalize_supplier_data
from app.services.map import AMapService


def test_enterprise_table_headers_and_material_aliases_are_normalized() -> None:
    result = normalize_supplier_data(
        {
            "企业名称": "温州测试建材有限公司",
            "企业地址": "温州市龙湾区滨海大道1号",
            "负责人": "王总",
            "电话": "13800138000",
            "联系人": "陈经理",
            "水泥": "315元/吨",
            "矿粉": "0",
            "煤灰": "138",
            "说明": "含税出厂价",
            "　": "应忽略",
        }
    )

    assert result["supplier_name"] == "温州测试建材有限公司"
    assert result["address"] == "温州市龙湾区滨海大道1号"
    assert result["responsible_person"] == "王总"
    assert result["contact"] == "陈经理"
    assert result["phone"] == "13800138000"
    assert result["remark"] == "含税出厂价"
    assert result["products"] == [
        {"category": "水泥", "brand": "", "spec": "", "price": 315.0, "unit": "元/吨"},
        {"category": "粉煤灰", "brand": "", "spec": "", "price": 138.0, "unit": "元/吨"},
    ]


def test_responsible_person_falls_back_to_contact_and_zero_products_are_removed() -> None:
    result = normalize_supplier_data(
        {
            "supplier_name": "测试企业",
            "responsible_person": "李总",
            "products": [
                {"category": "煤灰", "spec": "二级灰", "price": "142", "unit": ""},
                {"category": "矿粉", "spec": "S95", "price": 0},
            ],
        }
    )

    assert result["contact"] == "李总"
    assert result["products"] == [
        {"category": "粉煤灰", "brand": "", "spec": "II级", "price": 142.0, "unit": "元/吨"}
    ]


def test_company_name_similarity_ignores_region_and_company_suffix() -> None:
    score = AMapService.place_name_similarity("温州市宏达建材有限公司", "宏达建材")
    assert score >= 0.7


def test_amap_qps_retries_use_one_two_four_second_backoff(monkeypatch) -> None:
    responses = [
        {"status": "0", "info": "CUQPS_HAS_EXCEEDED_THE_LIMIT"},
        {"status": "0", "info": "CUQPS_HAS_EXCEEDED_THE_LIMIT"},
        {"status": "0", "info": "CUQPS_HAS_EXCEEDED_THE_LIMIT"},
        {"status": "1", "pois": []},
    ]
    delays: list[float] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return responses.pop(0)

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def get(self, *_args, **_kwargs) -> FakeResponse:
            return FakeResponse()

    async def fake_sleep(delay: float) -> None:
        delays.append(delay)

    monkeypatch.setattr(amap_module.httpx, "AsyncClient", lambda **_kwargs: FakeClient())
    monkeypatch.setattr(amap_module.asyncio, "sleep", fake_sleep)
    service = AMapService("test-key")
    result = asyncio.run(service._get_url("https://example.test", {}))
    assert result["status"] == "1"
    assert delays == [1, 2, 4]


def test_amap_place_search_cache_avoids_duplicate_requests() -> None:
    service = AMapService("test-key")
    call_count = 0

    async def fake_get_url(*_args, **_kwargs) -> dict:
        nonlocal call_count
        call_count += 1
        return {
            "status": "1",
            "pois": [
                {
                    "id": "B0CACHE",
                    "name": "温州南站",
                    "address": "宁波路",
                    "pname": "浙江省",
                    "cityname": "温州市",
                    "adname": "瓯海区",
                    "location": "120.584357,27.966399",
                    "type": "交通设施服务",
                    "typecode": "150200",
                }
            ],
        }

    service._get_url = fake_get_url  # type: ignore[method-assign]

    async def scenario() -> None:
        first = await service.place_search("温州南站", limit=5)
        second = await service.place_search("温州南站", limit=20)
        assert first[0]["longitude"] == second[0]["longitude"]

    asyncio.run(scenario())
    assert call_count == 1


def test_amap_qps_error_is_translated() -> None:
    with pytest.raises(HTTPException) as exc:
        AMapService._raise_amap_error({"info": "CUQPS_HAS_EXCEEDED_THE_LIMIT"}, "高德地图请求失败")
    assert exc.value.status_code == 429
    assert exc.value.detail == "高德搜索请求过快，系统稍后自动重试"
