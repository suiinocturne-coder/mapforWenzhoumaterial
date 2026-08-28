import asyncio
import os
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

os.environ["DATABASE_URL"] = f"sqlite:///{(Path(__file__).parent / 'test.db').as_posix()}"
os.environ["APP_SEED_DEMO"] = "false"

from fastapi.testclient import TestClient

from app.main import app
import app.api.ai as ai_api
from app.services.map import get_map_service


class FakeMapService:
    def __init__(self) -> None:
        self.last_origin: tuple[float, float] | None = None
        self.last_destination: tuple[float, float] | None = None
        self.active_place_searches = 0
        self.max_active_place_searches = 0

    async def geocode(self, address: str, city: str = "温州") -> dict:
        return {
            "formatted_address": "浙江省温州市龙湾区滨海二十五路测试号",
            "longitude": 120.8123,
            "latitude": 27.8234,
            "province": "浙江省",
            "city": "温州市",
            "district": "龙湾区",
            "level": "门牌号",
            "uncertain": False,
            "location_accuracy": "geocoded",
            "coordinate_system": "GCJ-02",
        }

    async def place_search(self, keyword: str, city: str = "温州市", limit: int = 10) -> list[dict]:
        assert keyword == "温州南站"
        assert city == "温州市"
        assert limit == 12
        return [
            {
                "id": "B0TEST001",
                "name": "温州南站",
                "address": "潘桥街道",
                "formatted_address": "浙江省温州市瓯海区潘桥街道温州南站",
                "province": "浙江省",
                "city": "温州市",
                "district": "瓯海区",
                "longitude": 120.5858,
                "latitude": 27.9671,
                "type": "交通设施服务",
                "typecode": "150200",
                "location_accuracy": "geocoded",
                "coordinate_system": "GCJ-02",
            }
        ]

    async def reverse_geocode(self, longitude: float, latitude: float) -> dict:
        return {
            "address": "浙江省温州市鹿城区测试路1号",
            "formatted_address": "浙江省温州市鹿城区测试路1号",
            "province": "浙江省",
            "city": "温州市",
            "district": "鹿城区",
            "township": "南汇街道",
            "location_accuracy": "geocoded",
            "coordinate_system": "GCJ-02",
        }

    async def driving_route(self, origin: tuple[float, float], destination: tuple[float, float]) -> dict:
        self.last_origin = origin
        self.last_destination = destination
        return {
            "distance_meters": 38600,
            "distance_km": 38.6,
            "duration_seconds": 3120,
            "duration_minutes": 52,
            "route_steps": [{"instruction": "沿测试道路行驶", "road_name": "测试道路", "distance_meters": 38600, "duration_seconds": 3120, "polyline": [[120.632, 27.764], [120.63, 27.966]]}],
            "polyline": [[120.632, 27.764], [120.63, 27.966]],
            "coordinate_system": "GCJ-02",
            "route_source": "amap_driving_v5",
        }

    async def best_place_match(
        self,
        enterprise_name: str,
        threshold: float = 0.7,
        address_hint: str = "",
        district_hint: str = "",
    ) -> dict | None:
        self.active_place_searches += 1
        self.max_active_place_searches = max(self.max_active_place_searches, self.active_place_searches)
        try:
            await asyncio.sleep(0.01)
            if "无法定位" in enterprise_name:
                return None
            return {
                "id": "B0BATCH001",
                "name": enterprise_name.replace("有限公司", ""),
                "address": "滨海大道1号",
                "formatted_address": f"浙江省温州市龙湾区滨海大道1号{enterprise_name}",
                "province": "浙江省",
                "city": "温州市",
                "district": "龙湾区",
                "longitude": 120.8123,
                "latitude": 27.8234,
                "type": "公司企业",
                "typecode": "170000",
                "location_accuracy": "geocoded",
                "coordinate_system": "GCJ-02",
                "match_score": 0.88,
            }
        finally:
            self.active_place_searches -= 1


def test_health_and_supplier_crud() -> None:
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        payload = {
            "name": "测试建材供应商",
            "supplier_type": "cement",
            "address": "温州市鹿城区测试路1号",
            "district": "鹿城区",
            "longitude": 120.69,
            "latitude": 28.0,
            "location_accuracy": "verified",
            "products": [{"category": "水泥", "brand": "测试品牌", "spec": "P.O42.5", "price": 310, "unit": "元/吨"}],
        }
        created = client.post("/api/suppliers", json=payload)
        assert created.status_code == 201
        supplier = created.json()
        assert Decimal(supplier["products"][0]["price"]) == Decimal("310")
        assert {"id", "name", "short_name", "supplier_type", "address", "longitude", "latitude", "products"}.issubset(supplier)
        assert "updated_at" in supplier["products"][0]
        updated = client.patch(f"/api/suppliers/{supplier['id']}/products/{supplier['products'][0]['id']}", json={"price": 305})
        assert updated.status_code == 200
        assert len(updated.json()["price_history"]) == 2
        assert client.get("/api/suppliers?brand=测试品牌").status_code == 200


def test_geocode_contract_does_not_save_supplier() -> None:
    fake_service = FakeMapService()
    app.dependency_overrides[get_map_service] = lambda: fake_service
    try:
        with TestClient(app) as client:
            before = len(client.get("/api/suppliers").json())
            response = client.post("/api/map/geocode", json={"address": "温州市龙湾区滨海二十五路测试号"})
            assert response.status_code == 200
            result = response.json()
            assert result["province"] == "浙江省"
            assert result["city"] == "温州市"
            assert result["district"] == "龙湾区"
            assert result["longitude"] == 120.8123
            search = client.post(
                "/api/map/place-search",
                json={"keyword": "温州南站", "city": "温州市", "limit": 12},
            )
            assert search.status_code == 200
            place = search.json()[0]
            assert place["name"] == "温州南站"
            assert place["longitude"] == 120.5858
            assert place["coordinate_system"] == "GCJ-02"
            assert len(client.get("/api/suppliers").json()) == before
    finally:
        app.dependency_overrides.pop(get_map_service, None)


def test_driving_route_contract_uses_coordinate_service() -> None:
    fake_service = FakeMapService()
    app.dependency_overrides[get_map_service] = lambda: fake_service
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/map/driving-route",
                json={
                    "origin": {"longitude": 120.632, "latitude": 27.764},
                    "destination": {"longitude": 120.63, "latitude": 27.966},
                },
            )
            assert response.status_code == 200
            result = response.json()
            assert result["distance_meters"] == 38600
            assert result["distance_km"] == 38.6
            assert result["duration_seconds"] == 3120
            assert result["duration_minutes"] == 52
            assert result["route_steps"][0]["road_name"] == "测试道路"
            assert len(result["polyline"]) == 2
            assert result["route_source"] == "amap_driving_v5"
            assert fake_service.last_origin == (120.632, 27.764)
            assert fake_service.last_destination == (120.63, 27.966)
    finally:
        app.dependency_overrides.pop(get_map_service, None)


def test_reverse_geocode_and_compare_use_real_route_contract() -> None:
    fake_service = FakeMapService()
    app.dependency_overrides[get_map_service] = lambda: fake_service
    try:
        with TestClient(app) as client:
            reverse = client.post("/api/map/reverse-geocode", json={"longitude": 120.6994, "latitude": 27.9943})
            assert reverse.status_code == 200
            assert reverse.json()["formatted_address"] == "浙江省温州市鹿城区测试路1号"
            assert reverse.json()["coordinate_system"] == "GCJ-02"

            supplier = client.post(
                "/api/suppliers",
                json={
                    "name": "比价测试供应商",
                    "supplier_type": "cement",
                    "address": "温州市龙湾区测试供应商路1号",
                    "longitude": 120.632,
                    "latitude": 27.764,
                    "location_accuracy": "verified",
                    "products": [{"category": "水泥", "brand": "海螺", "spec": "P.O42.5", "price": 310, "unit": "元/吨"}],
                },
            ).json()
            project = client.post(
                "/api/suppliers",
                json={
                    "name": "比价测试工地",
                    "supplier_type": "project",
                    "address": "温州市瓯海区测试工地路1号",
                    "longitude": 120.63,
                    "latitude": 27.966,
                    "location_accuracy": "verified",
                    "products": [],
                },
            ).json()
            response = client.post(
                "/api/map/compare",
                json={"destination_id": project["id"], "category": "水泥", "freight_rate": 0.65},
            )
            assert response.status_code == 200
            body = response.json()
            row = next(item for item in body["items"] if item["supplier_id"] == supplier["id"])
            assert row["distance_meters"] == 38600
            assert row["distance_km"] == 38.6
            assert row["freight"] == 25.09
            assert row["landed_price"] == 335.09
            assert body["route_source"] == "amap_driving_v5"
            assert body["coordinate_system"] == "GCJ-02"
    finally:
        app.dependency_overrides.pop(get_map_service, None)


def test_ai_batch_import_saves_matches_and_reports_unmatched(monkeypatch) -> None:
    suffix = uuid4().hex[:8]
    matched_name = f"批量测试建材{suffix}有限公司"
    unmatched_name = f"无法定位企业{suffix}"

    async def fake_parse_supplier_batch(_: str) -> list[dict]:
        return [
            {
                "supplier_name": matched_name,
                "supplier_type": "cement",
                "address": "原始地址",
                "district": "",
                "responsible_person": "王总",
                "contact": "陈经理",
                "phone": "13800138000",
                "remark": "含税",
                "products": [{"category": "水泥", "brand": "海螺", "spec": "P.O42.5", "price": 315, "unit": "元/吨"}],
            },
            {"supplier_name": unmatched_name, "supplier_type": "mixed", "products": []},
        ]

    monkeypatch.setattr(ai_api, "parse_supplier_batch", fake_parse_supplier_batch)
    fake_service = FakeMapService()
    app.dependency_overrides[get_map_service] = lambda: fake_service
    try:
        with TestClient(app) as client:
            response = client.post("/api/ai/batch-import", json={"text": "测试批量导入数据"})
            assert response.status_code == 200
            body = response.json()
            assert body["total"] == 2
            assert body["imported_count"] == 1
            assert body["failed_count"] == 1
            assert body["imported"][0]["match_score"] == 0.88
            assert body["failed"][0]["name"] == unmatched_name
            saved = client.get(f"/api/suppliers?search={matched_name}").json()
            assert len(saved) == 1
            assert saved[0]["location_accuracy"] == "geocoded"
            assert saved[0]["longitude"] == 120.8123
            assert saved[0]["address"].startswith("浙江省温州市龙湾区")
            assert fake_service.max_active_place_searches == 1
    finally:
        app.dependency_overrides.pop(get_map_service, None)
