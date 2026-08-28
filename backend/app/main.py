from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, map_api, suppliers
from app.core.config import get_settings
from app.db import Base, SessionLocal, engine
from app.seed import seed_demo_data


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.app_seed_demo:
        with SessionLocal() as db:
            seed_demo_data(db)
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(suppliers.router, prefix="/api")
app.include_router(map_api.router, prefix="/api")
app.include_router(ai.router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "wenzhou-material-map"}


@app.get("/api/config")
def public_config() -> dict[str, str | bool]:
    # 高德 JS Key 在浏览器地图 SDK 中必然是公开标识；敏感的 DeepSeek Token 永不返回。
    return {
        "amap_key": settings.vite_amap_js_key,
        "amap_security_key": settings.vite_amap_security_code,
        "amap_configured": bool(settings.vite_amap_js_key),
    }
