from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "温州市建材供应商地图管理系统"
    database_url: str = f"sqlite:///{(BACKEND_DIR.parent / 'data' / 'wenzhou_material_map.db').as_posix()}"
    # JS Key 会下发给浏览器加载高德地图；Web 服务 Key 仅供后端 REST API 使用。
    vite_amap_js_key: str = ""
    amap_web_service_key: str = ""
    vite_amap_security_code: str = ""
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    cors_origins: str = "http://localhost:5173"
    app_seed_demo: bool = True

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
