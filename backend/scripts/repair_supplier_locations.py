"""Audit or repair geocoded supplier positions using high-confidence AMap POIs."""

import argparse
import asyncio
from pathlib import Path
import shutil
from datetime import datetime

from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import Supplier
from app.services.map.amap import AMapService


def sqlite_database_path(database_url: str) -> Path | None:
    if not database_url.startswith("sqlite:///"):
        return None
    return Path(database_url.removeprefix("sqlite:///"))


async def run(apply_changes: bool, threshold: float, include_verified: bool, only_verified: bool) -> None:
    settings = get_settings()
    service = AMapService(settings.amap_web_service_key)
    repaired = 0
    unchanged = 0
    skipped_verified = 0
    unresolved: list[str] = []

    if apply_changes:
        database_path = sqlite_database_path(settings.database_url)
        if database_path and database_path.exists():
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup_path = database_path.with_name(f"{database_path.stem}.before-location-repair-{stamp}{database_path.suffix}")
            shutil.copy2(database_path, backup_path)
            print(f"BACKUP {backup_path.resolve()}")

    with SessionLocal() as db:
        suppliers = list(db.scalars(select(Supplier).order_by(Supplier.id)))
        for index, supplier in enumerate(suppliers, start=1):
            if only_verified and supplier.location_accuracy != "verified":
                continue
            if supplier.location_accuracy == "verified" and not include_verified:
                skipped_verified += 1
                print(f"[{index}/{len(suppliers)}] SKIP_VERIFIED {supplier.id} {supplier.name}")
                continue
            place = await service.best_place_match(supplier.name, threshold=threshold)
            if place is None:
                unresolved.append(f"{supplier.id}\t{supplier.name}")
                print(f"[{index}/{len(suppliers)}] UNRESOLVED {supplier.id} {supplier.name}")
                continue
            moved = abs(supplier.longitude - place["longitude"]) > 0.00001 or abs(supplier.latitude - place["latitude"]) > 0.00001
            if moved:
                repaired += 1
                print(
                    f"[{index}/{len(suppliers)}] REPAIR {supplier.id} {supplier.name} "
                    f"{supplier.longitude:.6f},{supplier.latitude:.6f} -> "
                    f"{place['longitude']:.6f},{place['latitude']:.6f} ({place['match_score']:.0%})"
                )
            else:
                unchanged += 1
                print(f"[{index}/{len(suppliers)}] OK {supplier.id} {supplier.name}")
            if apply_changes:
                supplier.province = place["province"] or "浙江省"
                supplier.city = place["city"] or "温州市"
                supplier.district = place["district"] or supplier.district
                supplier.address = place["formatted_address"] or supplier.address
                supplier.longitude = place["longitude"]
                supplier.latitude = place["latitude"]
                supplier.location_accuracy = "geocoded"
        if apply_changes:
            db.commit()

    print(
        f"SUMMARY repaired={repaired} unchanged={unchanged} "
        f"verified_skipped={skipped_verified} unresolved={len(unresolved)} apply={apply_changes}"
    )
    if unresolved:
        print("UNRESOLVED_LIST")
        print("\n".join(unresolved))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write high-confidence matches to the database")
    parser.add_argument("--threshold", type=float, default=0.88)
    parser.add_argument("--include-verified", action="store_true", help="also audit positions previously marked verified")
    parser.add_argument("--only-verified", action="store_true", help="limit the run to previously verified positions")
    args = parser.parse_args()
    asyncio.run(run(args.apply, args.threshold, args.include_verified, args.only_verified))


if __name__ == "__main__":
    main()
