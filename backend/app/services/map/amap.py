import asyncio
from difflib import SequenceMatcher
from functools import lru_cache
import re
from time import monotonic
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings


class AMapService:
    base_url = "https://restapi.amap.com/v3"
    qps_error_codes = {
        "ACCESS_TOO_FREQUENT",
        "QPS_HAS_EXCEEDED_THE_LIMIT",
        "CQPS_HAS_EXCEEDED_THE_LIMIT",
        "CKQPS_HAS_EXCEEDED_THE_LIMIT",
        "CUQPS_HAS_EXCEEDED_THE_LIMIT",
        "KQPS_HAS_EXCEEDED_THE_LIMIT",
        "CIQPS_HAS_EXCEEDED_THE_LIMIT",
        "CIKQPS_HAS_EXCEEDED_THE_LIMIT",
        "USER_QPS_QUERY_OVER_LIMIT",
    }
    qps_retry_delays = (1, 2, 4)
    place_search_interval_seconds = 0.65
    place_cache_ttl_seconds = 3600
    place_cache_max_entries = 500
    wenzhou_district_aliases = {
        "鹿城": "鹿城区",
        "龙湾": "龙湾区",
        "瓯海": "瓯海区",
        "洞头": "洞头区",
        "瑞安": "瑞安市",
        "乐清": "乐清市",
        "龙港": "龙港市",
        "永嘉": "永嘉县",
        "平阳": "平阳县",
        "苍南": "苍南县",
        "文成": "文成县",
        "泰顺": "泰顺县",
    }

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self._place_search_lock = asyncio.Lock()
        self._last_place_search_at = 0.0
        self._place_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}

    def _ensure_configured(self) -> None:
        if not self.api_key:
            raise HTTPException(status_code=503, detail="尚未配置 AMAP_WEB_SERVICE_KEY")

    @staticmethod
    def _raise_amap_error(data: dict[str, Any], fallback: str) -> None:
        info = str(data.get("info") or fallback)
        messages = {
            "USER_DAILY_QUERY_OVER_LIMIT": "高德 Web 服务 Key 当日调用额度已用尽，请提升配额或次日重试",
            "INVALID_USER_KEY": "高德 Web 服务 Key 无效，请检查后端环境变量",
            "INVALID_USER_SCODE": "高德 Web 服务签名校验失败，请检查 Key 配置",
        }
        if info in AMapService.qps_error_codes:
            raise HTTPException(status_code=429, detail="高德搜索请求过快，系统稍后自动重试")
        status_code = 429 if "OVER_LIMIT" in info else 400
        raise HTTPException(status_code=status_code, detail=messages.get(info, f"{fallback}：{info}"))

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        return await self._get_url(f"{self.base_url}/{path}", params)

    async def _get_url(
        self,
        url: str,
        params: dict[str, Any],
        *,
        timeout: float = 15,
        fallback: str = "高德地图请求失败",
        unavailable: str = "高德地图服务暂时不可用",
    ) -> dict[str, Any]:
        self._ensure_configured()
        for attempt in range(len(self.qps_retry_delays) + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.get(url, params={**params, "key": self.api_key})
                    response.raise_for_status()
                    data = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise HTTPException(status_code=502, detail=unavailable) from exc
            if data.get("status") == "1":
                return data
            info = str(data.get("info") or "")
            if info in self.qps_error_codes and attempt < len(self.qps_retry_delays):
                await asyncio.sleep(self.qps_retry_delays[attempt])
                continue
            self._raise_amap_error(data, fallback)
        raise HTTPException(status_code=429, detail="高德搜索请求过快，系统稍后自动重试")

    async def place_search(self, keyword: str, city: str = "温州市", limit: int = 10) -> list[dict[str, Any]]:
        cache_key = (keyword.strip().casefold(), city.strip())
        now = monotonic()
        cached = self._place_cache.get(cache_key)
        if cached and cached[0] > now:
            return [dict(place) for place in cached[1][:limit]]
        async with self._place_search_lock:
            now = monotonic()
            cached = self._place_cache.get(cache_key)
            if cached and cached[0] > now:
                return [dict(place) for place in cached[1][:limit]]
            wait_seconds = self.place_search_interval_seconds - (now - self._last_place_search_at)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
            try:
                data = await self._get_url(
                    "https://restapi.amap.com/v5/place/text",
                    {
                        "keywords": keyword,
                        "region": city,
                        "city_limit": "true",
                        "page_size": 20,
                        "page_num": 1,
                    },
                )
            finally:
                self._last_place_search_at = monotonic()
            results = self._parse_place_results(data, city)
            if len(self._place_cache) >= self.place_cache_max_entries:
                oldest_key = min(self._place_cache, key=lambda key: self._place_cache[key][0])
                self._place_cache.pop(oldest_key, None)
            self._place_cache[cache_key] = (monotonic() + self.place_cache_ttl_seconds, results)
            return [dict(place) for place in results[:limit]]

    @staticmethod
    def _parse_place_results(data: dict[str, Any], city: str) -> list[dict[str, Any]]:
        def component_text(value: Any) -> str:
            if isinstance(value, list):
                return str(value[0]) if value else ""
            return str(value or "")

        results: list[dict[str, Any]] = []
        for poi in data.get("pois", []):
            location = component_text(poi.get("location"))
            if not location or "," not in location:
                continue
            try:
                longitude, latitude = map(float, location.split(",", maxsplit=1))
            except ValueError:
                continue
            province = component_text(poi.get("pname"))
            city_name = component_text(poi.get("cityname")) or city
            district = component_text(poi.get("adname"))
            address = component_text(poi.get("address"))
            name = component_text(poi.get("name"))
            formatted_address = address
            for part in reversed((province, city_name, district)):
                if part and part not in formatted_address:
                    formatted_address = f"{part}{formatted_address}"
            if name and name not in formatted_address:
                formatted_address = f"{formatted_address}{name}"
            formatted_address = formatted_address or name
            results.append(
                {
                    "id": component_text(poi.get("id")),
                    "name": name,
                    "address": address,
                    "formatted_address": formatted_address,
                    "province": province,
                    "city": city_name,
                    "district": district,
                    "longitude": longitude,
                    "latitude": latitude,
                    "type": component_text(poi.get("type")),
                    "typecode": component_text(poi.get("typecode")),
                    "location_accuracy": "geocoded",
                    "coordinate_system": "GCJ-02",
                }
            )
        return results

    @staticmethod
    def place_name_similarity(enterprise_name: str, poi_name: str) -> float:
        def variants(value: str) -> set[str]:
            normalized = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]", "", value).lower()
            values = {normalized}
            for prefix in ("浙江省温州市", "浙江温州", "温州市", "温州"):
                if normalized.startswith(prefix) and len(normalized) > len(prefix) + 2:
                    values.add(normalized[len(prefix):])
            suffixes = ("有限责任公司", "股份有限公司", "有限公司", "公司", "供应站", "经营部", "建材厂", "水泥厂")
            for current in tuple(values):
                for suffix in suffixes:
                    if current.endswith(suffix) and len(current) > len(suffix) + 2:
                        values.add(current[:-len(suffix)])
            return {value for value in values if value}

        enterprise_variants = variants(enterprise_name)
        poi_variants = variants(poi_name)
        if not enterprise_variants or not poi_variants:
            return 0.0
        return max(SequenceMatcher(None, left, right).ratio() for left in enterprise_variants for right in poi_variants)

    @classmethod
    def expected_wenzhou_district(cls, *values: str) -> str | None:
        for value in values:
            compact = re.sub(r"\s+", "", value or "")
            for keyword, district in cls.wenzhou_district_aliases.items():
                if keyword in compact:
                    return district
        return None

    @staticmethod
    def districts_compatible(expected: str, actual: str) -> bool:
        if expected == actual:
            return True
        # 龙港曾属苍南，企业名称中的旧行政区写法仍然很常见。
        return {expected, actual} == {"苍南县", "龙港市"}

    async def best_place_match(
        self,
        enterprise_name: str,
        threshold: float = 0.7,
        address_hint: str = "",
        district_hint: str = "",
    ) -> dict[str, Any] | None:
        places = await self.place_search(enterprise_name, city="温州市", limit=20)
        if not places:
            return None
        expected_district = self.expected_wenzhou_district(district_hint, address_hint, enterprise_name)
        if expected_district:
            places = [
                place for place in places
                if self.districts_compatible(expected_district, str(place.get("district") or ""))
            ]
            if not places:
                return None
        best = max(places, key=lambda place: self.place_name_similarity(enterprise_name, place["name"]))
        score = self.place_name_similarity(enterprise_name, best["name"])
        if score < threshold:
            return None
        return {**best, "match_score": round(score, 4)}

    async def geocode(self, address: str, city: str = "温州") -> dict[str, Any]:
        data = await self._get("geocode/geo", {"address": address, "city": city})
        if not data.get("geocodes"):
            raise HTTPException(status_code=404, detail="未找到该地址")
        geocodes = data["geocodes"]
        item = geocodes[0]
        longitude, latitude = map(float, item["location"].split(","))
        level = str(item.get("level", ""))
        approximate_levels = {"省", "市", "区县", "乡镇", "村庄", "热点商圈", "道路"}
        is_uncertain = len(geocodes) > 1 or level in approximate_levels

        def component_text(value: Any) -> str:
            if isinstance(value, list):
                return str(value[0]) if value else ""
            return str(value or "")

        return {
            "longitude": longitude,
            "latitude": latitude,
            "formatted_address": item.get("formatted_address", address),
            "province": component_text(item.get("province")),
            "city": component_text(item.get("city")) or "温州市",
            "district": component_text(item.get("district")),
            "level": level,
            "uncertain": is_uncertain,
            "location_accuracy": "approximate" if is_uncertain else "geocoded",
            "coordinate_system": "GCJ-02",
        }

    async def reverse_geocode(self, longitude: float, latitude: float) -> dict[str, Any]:
        data = await self._get("geocode/regeo", {"location": f"{longitude},{latitude}", "extensions": "base"})
        regeocode = data.get("regeocode", {})
        component = regeocode.get("addressComponent", {})

        def component_text(value: Any) -> str:
            if isinstance(value, list):
                return str(value[0]) if value else ""
            return str(value or "")

        formatted_address = component_text(regeocode.get("formatted_address"))
        if not formatted_address:
            raise HTTPException(status_code=404, detail="未找到该坐标对应的地址")
        return {
            "address": formatted_address,
            "formatted_address": formatted_address,
            "province": component_text(component.get("province")),
            "city": component_text(component.get("city")) or "温州市",
            "district": component_text(component.get("district")),
            "township": component_text(component.get("township")),
            "location_accuracy": "geocoded",
            "coordinate_system": "GCJ-02",
        }

    async def driving_route(self, origin: tuple[float, float], destination: tuple[float, float]) -> dict[str, Any]:
        params = {
            "origin": f"{origin[0]:.6f},{origin[1]:.6f}",
            "destination": f"{destination[0]:.6f},{destination[1]:.6f}",
            "strategy": 32,
            "show_fields": "cost,polyline",
        }
        data = await self._get_url(
            "https://restapi.amap.com/v5/direction/driving",
            params,
            timeout=20,
            fallback="高德驾车路径规划失败",
            unavailable="高德驾车路径规划服务暂时不可用",
        )
        paths = data.get("route", {}).get("paths", [])
        if not paths:
            raise HTTPException(status_code=404, detail="未找到可用驾车路线")
        path = paths[0]
        polyline: list[list[float]] = []
        route_steps: list[dict[str, Any]] = []
        for step in path.get("steps", []):
            step_polyline: list[list[float]] = []
            for point in step.get("polyline", "").split(";"):
                if point:
                    lng, lat = map(float, point.split(","))
                    coordinate = [lng, lat]
                    step_polyline.append(coordinate)
                    if not polyline or polyline[-1] != coordinate:
                        polyline.append(coordinate)
            step_cost = step.get("cost") or {}
            route_steps.append(
                {
                    "instruction": step.get("instruction", ""),
                    "road_name": step.get("road_name", ""),
                    "distance_meters": int(float(step.get("step_distance") or 0)),
                    "duration_seconds": int(float(step_cost.get("duration") or 0)),
                    "polyline": step_polyline,
                }
            )
        distance_meters = int(float(path["distance"]))
        duration_seconds = int(float((path.get("cost") or {}).get("duration") or 0))
        if duration_seconds <= 0:
            duration_seconds = sum(step["duration_seconds"] for step in route_steps)
        return {
            "distance_meters": distance_meters,
            "distance_km": round(distance_meters / 1000, 1),
            "duration_seconds": duration_seconds,
            "duration_minutes": round(duration_seconds / 60),
            "route_steps": route_steps,
            "polyline": polyline,
            "coordinate_system": "GCJ-02",
            "route_source": "amap_driving_v5",
        }


@lru_cache
def get_map_service() -> AMapService:
    return AMapService(get_settings().amap_web_service_key)
