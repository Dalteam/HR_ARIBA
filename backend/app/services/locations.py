"""Punch locations (مواقع البصمة): CRUD with the V38 radius rule and remote handling.

V38 forces every non-remote location to a 1000 m geofence on save/read; a remote location has no
coordinates and an effectively unlimited radius.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models import Location, LocationType, Workplace
from app.schemas import LocationCreate, LocationOut, LocationUpdate

REMOTE_RADIUS = 999999
FORCED_RADIUS = 1000


def list_all(db: Session) -> list[Location]:
    return list(
        db.scalars(
            select(Location)
            .where(Location.deleted_at.is_(None))
            .order_by(Location.created_at)
        )
    )


def get(db: Session, location_id: uuid.UUID) -> Location:
    loc = db.get(Location, location_id)
    if loc is None or loc.deleted_at is not None:
        raise not_found("Location")
    return loc


def _normalize(values: dict) -> dict:
    if values.get("type") == LocationType.remote:
        values["radius_m"] = REMOTE_RADIUS
        values["latitude"] = Decimal("0")
        values["longitude"] = Decimal("0")
    elif "radius_m" in values or "type" in values:
        # V38: the UI allows 50–5000, but every non-remote location is stored as 1000 m.
        values["radius_m"] = FORCED_RADIUS
    return values


def create(db: Session, data: LocationCreate) -> Location:
    loc = Location(**_normalize(data.model_dump()))
    db.add(loc)
    db.flush()
    return loc


def update(loc: Location, data: LocationUpdate) -> list[str]:
    values = _normalize(data.model_dump(exclude_unset=True))
    changed = [k for k, v in values.items() if getattr(loc, k) != v]
    for k, v in values.items():
        setattr(loc, k, v)
    return changed


def remove(loc: Location) -> None:
    loc.deleted_at = datetime.now(UTC)


def to_out(loc: Location, workplace: Workplace | None) -> LocationOut:
    return LocationOut(
        id=loc.id,
        name=loc.name,
        name_en=loc.name_en,
        workplace_id=loc.workplace_id,
        workplace=workplace.name_ar if workplace else None,
        type=loc.type,
        radius_m=loc.radius_m,
        latitude=loc.latitude,
        longitude=loc.longitude,
        is_active=loc.is_active,
    )


def workplaces_by_id(db: Session, ids: set[uuid.UUID]) -> dict[uuid.UUID, Workplace]:
    if not ids:
        return {}
    return {w.id: w for w in db.scalars(select(Workplace).where(Workplace.id.in_(ids)))}
