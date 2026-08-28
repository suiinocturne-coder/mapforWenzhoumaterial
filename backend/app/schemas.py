from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


SupplierType = Literal["cement", "slag", "flyash", "mixed", "terminal", "warehouse", "concrete", "project"]
LocationAccuracy = Literal["verified", "geocoded", "approximate", "unknown"]
ProductCategory = Literal["水泥", "矿粉", "粉煤灰"]


class ProductCreate(BaseModel):
    category: ProductCategory
    brand: str | None = None
    spec: str | None = None
    price: Decimal = Field(ge=0)
    unit: str = "元/吨"
    remark: str | None = None


class ProductUpdate(BaseModel):
    category: ProductCategory | None = None
    brand: str | None = None
    spec: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    unit: str | None = None
    remark: str | None = None


class PriceHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_id: int
    price: Decimal
    date: date
    remark: str | None


class ProductRead(ProductCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    updated_at: datetime
    price_history: list[PriceHistoryRead] = []


class SupplierBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    short_name: str | None = Field(default=None, max_length=60)
    supplier_type: SupplierType
    province: str = "浙江省"
    city: str = "温州市"
    district: str | None = None
    address: str = Field(min_length=2, max_length=255)
    longitude: float = Field(ge=118, le=122)
    latitude: float = Field(ge=26, le=30)
    location_accuracy: LocationAccuracy = "unknown"
    contact: str | None = None
    phone: str | None = None
    remark: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value and len(value.replace("-", "").replace(" ", "")) < 7:
            raise ValueError("联系电话格式不正确")
        return value


class SupplierCreate(SupplierBase):
    products: list[ProductCreate] = []


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    short_name: str | None = None
    supplier_type: SupplierType | None = None
    province: str | None = None
    city: str | None = None
    district: str | None = None
    address: str | None = None
    longitude: float | None = Field(default=None, ge=118, le=122)
    latitude: float | None = Field(default=None, ge=26, le=30)
    location_accuracy: LocationAccuracy | None = None
    contact: str | None = None
    phone: str | None = None
    remark: str | None = None


class SupplierRead(SupplierBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    products: list[ProductRead] = []


class GeocodeRequest(BaseModel):
    address: str = Field(min_length=2)
    city: str = "温州"


class PlaceSearchRequest(BaseModel):
    keyword: str = Field(min_length=2, max_length=80)
    city: str = "温州市"
    limit: int = Field(default=10, ge=1, le=20)


class CoordinateRequest(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class DrivingRouteRequest(BaseModel):
    origin: CoordinateRequest
    destination: CoordinateRequest


class RouteRequest(BaseModel):
    origin_id: int
    destination_id: int


class CompareRequest(BaseModel):
    destination_id: int
    category: ProductCategory | None = None
    freight_rate: Decimal = Field(default=Decimal("0.65"), ge=0)


class AIParseRequest(BaseModel):
    text: str = Field(min_length=5, max_length=20000)
