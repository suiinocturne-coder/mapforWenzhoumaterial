from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PriceHistory, Product, Supplier
from app.schemas import ProductCreate, ProductRead, ProductUpdate, SupplierCreate, SupplierRead, SupplierUpdate


router = APIRouter(prefix="/suppliers", tags=["供应商"])


def get_supplier_or_404(db: Session, supplier_id: int) -> Supplier:
    supplier = db.scalar(select(Supplier).where(Supplier.id == supplier_id))
    if supplier is None:
        raise HTTPException(status_code=404, detail="供应商不存在")
    return supplier


@router.get("", response_model=list[SupplierRead])
def list_suppliers(
    search: str | None = None,
    district: str | None = None,
    category: str | None = None,
    brand: str | None = None,
    spec: str | None = None,
    supplier_type: str | None = None,
    max_price: float | None = Query(default=None, ge=0),
    db: Session = Depends(get_db),
) -> list[Supplier]:
    query = select(Supplier).distinct()
    needs_product = any([category, brand, spec, max_price is not None])
    if needs_product or search:
        query = query.outerjoin(Product)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(Supplier.name.like(pattern), Supplier.address.like(pattern), Supplier.district.like(pattern), Product.brand.like(pattern), Product.category.like(pattern))
        )
    if district:
        query = query.where(Supplier.district == district)
    if supplier_type:
        query = query.where(Supplier.supplier_type == supplier_type)
    if category:
        query = query.where(Product.category == category)
    if brand:
        query = query.where(Product.brand.like(f"%{brand}%"))
    if spec:
        query = query.where(Product.spec.like(f"%{spec}%"))
    if max_price is not None:
        query = query.where(Product.price <= max_price)
    return list(db.scalars(query.order_by(Supplier.updated_at.desc())).unique().all())


@router.post("", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)) -> Supplier:
    data = payload.model_dump(exclude={"products"})
    supplier = Supplier(**data)
    try:
        db.add(supplier)
        db.flush()
        for product_data in payload.products:
            product = Product(supplier_id=supplier.id, **product_data.model_dump())
            db.add(product)
            db.flush()
            db.add(PriceHistory(product_id=product.id, price=product.price, date=date.today(), remark="初始报价"))
        db.commit()
        db.refresh(supplier)
    except Exception:
        db.rollback()
        raise
    return supplier


@router.get("/{supplier_id}", response_model=SupplierRead)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)) -> Supplier:
    return get_supplier_or_404(db, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierRead)
def update_supplier(payload: SupplierUpdate, supplier_id: int, db: Session = Depends(get_db)) -> Supplier:
    supplier = get_supplier_or_404(db, supplier_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)) -> Response:
    supplier = get_supplier_or_404(db, supplier_id)
    db.delete(supplier)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{supplier_id}/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, supplier_id: int, db: Session = Depends(get_db)) -> Product:
    get_supplier_or_404(db, supplier_id)
    product = Product(supplier_id=supplier_id, **payload.model_dump())
    try:
        db.add(product)
        db.flush()
        db.add(PriceHistory(product_id=product.id, price=product.price, date=date.today(), remark="初始报价"))
        db.commit()
        db.refresh(product)
    except Exception:
        db.rollback()
        raise
    return product


@router.patch("/{supplier_id}/products/{product_id}", response_model=ProductRead)
def update_product(payload: ProductUpdate, supplier_id: int, product_id: int, db: Session = Depends(get_db)) -> Product:
    product = db.scalar(select(Product).where(Product.id == product_id, Product.supplier_id == supplier_id))
    if product is None:
        raise HTTPException(status_code=404, detail="商品不存在")
    data = payload.model_dump(exclude_unset=True)
    new_price = data.get("price")
    if new_price is not None and new_price != product.price:
        db.add(PriceHistory(product_id=product.id, price=new_price, date=date.today(), remark="报价调整"))
    for key, value in data.items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{supplier_id}/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(supplier_id: int, product_id: int, db: Session = Depends(get_db)) -> Response:
    product = db.scalar(select(Product).where(Product.id == product_id, Product.supplier_id == supplier_id))
    if product is None:
        raise HTTPException(status_code=404, detail="商品不存在")
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

