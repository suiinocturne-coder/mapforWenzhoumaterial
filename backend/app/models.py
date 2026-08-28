from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    short_name: Mapped[str | None] = mapped_column(String(60))
    supplier_type: Mapped[str] = mapped_column(String(30), index=True)
    province: Mapped[str] = mapped_column(String(30), default="浙江省")
    city: Mapped[str] = mapped_column(String(30), default="温州市")
    district: Mapped[str | None] = mapped_column(String(30), index=True)
    address: Mapped[str] = mapped_column(String(255))
    longitude: Mapped[float] = mapped_column()
    latitude: Mapped[float] = mapped_column()
    location_accuracy: Mapped[str] = mapped_column(String(20), default="unknown")
    contact: Mapped[str | None] = mapped_column(String(60))
    phone: Mapped[str | None] = mapped_column(String(40))
    remark: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    products: Mapped[list["Product"]] = relationship(
        back_populates="supplier", cascade="all, delete-orphan", lazy="selectin"
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(30), index=True)
    brand: Mapped[str | None] = mapped_column(String(60), index=True)
    spec: Mapped[str | None] = mapped_column(String(60), index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    unit: Mapped[str] = mapped_column(String(20), default="元/吨")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    remark: Mapped[str | None] = mapped_column(Text)

    supplier: Mapped[Supplier] = relationship(back_populates="products")
    price_history: Mapped[list["PriceHistory"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin"
    )


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    date: Mapped[date] = mapped_column(Date, default=date.today)
    remark: Mapped[str | None] = mapped_column(Text)

    product: Mapped[Product] = relationship(back_populates="price_history")


class RouteHistory(Base):
    __tablename__ = "route_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    origin_supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"))
    destination_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"))
    distance: Mapped[float] = mapped_column()
    duration: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

