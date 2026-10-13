"""Server-side geofence check (haversine distance vs location radius), legacy V118/V122b rules.

A location with coordinates (0, 0) counts as "coordinates not set" and is never matched.
"""

import math
from dataclasses import dataclass

from app.models import Location, LocationType

EARTH_RADIUS_M = 6_371_000
DEFAULT_RADIUS_M = 200


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = math.pi / 180
    x = math.sin((lat2 - lat1) * r / 2)
    y = math.sin((lng2 - lng1) * r / 2)
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(x * x + math.cos(lat1 * r) * math.cos(lat2 * r) * y * y))


def has_coords(loc: Location) -> bool:
    return loc.type != LocationType.remote and not (float(loc.latitude) == 0 and float(loc.longitude) == 0)


@dataclass
class Nearest:
    location: Location
    distance_m: float
    inside: bool


def nearest(locations: list[Location], lat: float, lng: float) -> Nearest | None:
    """Closest location that has coordinates; inside = distance <= radius_m."""
    best: Nearest | None = None
    for loc in locations:
        if not has_coords(loc):
            continue
        d = haversine_m(lat, lng, float(loc.latitude), float(loc.longitude))
        if best is None or d < best.distance_m:
            best = Nearest(loc, d, d <= (loc.radius_m or DEFAULT_RADIUS_M))
    return best
