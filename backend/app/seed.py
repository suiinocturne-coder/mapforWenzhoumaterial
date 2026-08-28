from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PriceHistory, Product, Supplier


DEMO_SUPPLIERS = [
    {"name": "瓯江建材码头（演示）", "short_name": "瓯江码头", "supplier_type": "terminal", "district": "龙湾区", "address": "温州市龙湾区机场大道演示点", "longitude": 120.811, "latitude": 27.927, "contact": "陈经理", "phone": "13800000001", "location_accuracy": "approximate", "products": [("水泥", "海螺", "P.O42.5", "315"), ("矿粉", "", "S95", "202")]},
    {"name": "瑞安南方建材（演示）", "short_name": "瑞安南方", "supplier_type": "cement", "district": "瑞安市", "address": "瑞安市飞云街道演示点", "longitude": 120.632, "latitude": 27.764, "contact": "林经理", "phone": "13800000002", "location_accuracy": "approximate", "products": [("水泥", "南方", "P.O42.5", "309")]},
    {"name": "瓯海中心工地（演示）", "short_name": "中心工地", "supplier_type": "project", "district": "瓯海区", "address": "温州市瓯海区娄桥街道演示点", "longitude": 120.63, "latitude": 27.966, "contact": "王工", "phone": "13800000003", "location_accuracy": "approximate", "products": []},
    {"name": "乐清粉煤灰供应站（演示）", "short_name": "乐清供应站", "supplier_type": "flyash", "district": "乐清市", "address": "乐清市柳市镇演示点", "longitude": 120.895, "latitude": 28.049, "contact": "周经理", "phone": "13800000004", "location_accuracy": "approximate", "products": [("粉煤灰", "", "II级", "142")]},
]


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(Supplier.id).limit(1)) is not None:
        return
    for row in DEMO_SUPPLIERS:
        product_rows = row.pop("products")
        supplier = Supplier(**row)
        db.add(supplier)
        db.flush()
        for category, brand, spec, price in product_rows:
            product = Product(supplier_id=supplier.id, category=category, brand=brand or None, spec=spec, price=Decimal(price), unit="元/吨")
            db.add(product)
            db.flush()
            db.add(PriceHistory(product_id=product.id, price=product.price, remark="演示初始报价"))
    db.commit()
