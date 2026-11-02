"""The company's identity, answered before anybody signs in (Stage 6 of the employee-app port).

`GET /public/brand` is the one route in this API that answers **without a token**: the login screen,
the splash and every screen's palette are painted from it, so a signed-out phone has no other way to
get it. `frontend/employee-app/src/lib/port.ts` calls it as `brandInfo()`; `theme.tsx` re-pulls it
when the app comes to the foreground, and `login.tsx` / `salary.tsx` / `payslip-pdf.ts` read the logo
out of the same answer. The envelope is exactly `docs/BUSINESS_RULES.md` § Public brand (B1):

    {"brand": {"p","s","a","hero","heroImage","reset","punch"}, "names": {"coAr","coEn"},
     "logo": <data URI> | null, "appLogo": <data URI> | null}

What this module owns:

* **Five keys, named one by one** (`KEYS`): `company_names`, `brand_colors`, `company_logo`,
  `app_logo`, `punch_watermark`. `ariba_app_settings` also holds the HR signer's signature and stamp
  (`hr_signer`, 234 KB), the letterhead page, the medical form, the GOSI rules, `doc_sign_cfg`,
  `workflow_config`, `app_links` and `push_config` — none of them is ever selected here, because the
  route reads by key and this is the whole list (B2). A test pins the five names against a fake
  database that answers every key.
* **A closed field list inside each key.** The stored rows carry more than the app may see
  (`company_logo` has `{data, name, updated}`, `brand_colors` has `{p, s, a, updated}`); only `data`
  of an image and the four colours + `reset` leave the server. A value of the wrong type, a colour
  that is not hex, or an image that is not a raster `data:` URI is *absent* from the answer, never
  passed through: `theme.tsx` decides with `/^data:image\\//` and `h2r()`, and the payslip's own
  guard is `^data:image/(png|jpe?g|webp|gif);base64,` — the same allow-list used here.
* **A cap and a cache** (B3). The stored logo is ~46 KB today and the punch watermark ~44 KB; a
  setting row is unbounded, so each image field is capped at `MAX_IMAGE_CHARS` (512 KiB) and a bigger
  one is treated as absent instead of turning an unauthenticated route into a file server. The answer
  is the same for every caller, so it is sent `public, max-age=300` with an `ETag` and answers `304`
  to a matching `If-None-Match`; `core/security.py` keeps the `Cache-Control` a route set (every
  other answer stays `no-store`).
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

#: The only settings rows this module ever names (B2).
KEYS = ("company_names", "brand_colors", "company_logo", "app_logo", "punch_watermark")

SETTING_SQL = "SELECT value FROM public.ariba_app_settings WHERE key=:key"

#: `#rgb` or `#rrggbb`. `theme.tsx`'s `h2r()` accepts nothing else, and a colour that does not parse
#: would paint the whole app black, so it is dropped rather than guessed.
COLOUR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
#: An embedded raster image — the same shapes `services/html_safety.py` allows in a letter, so the
#: payslip's `payslip-pdf.ts` regex and this route cannot drift apart.
IMAGE = re.compile(r"^data:image/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$")
#: Per image field, in characters of base64 (~393 KB of picture). The stored logo is 46,706 and the
#: punch watermark 44,646, so this is a ceiling, not a target; anything above it is `null`.
MAX_IMAGE_CHARS = 512 * 1024
#: A company name is a label, not a paragraph.
MAX_NAME_CHARS = 200
#: How long a phone may keep the answer (the app also re-pulls on foreground and every 90 s).
CACHE_SECONDS = 300

#: The four colour fields `theme.tsx` reads out of `brand`, and the picture it reads the same way.
BRAND_COLOURS = ("p", "s", "a", "hero")
BRAND_IMAGES = ("heroImage",)


def _settings(db: Session, key: str) -> dict[str, Any]:
    """One `ariba_app_settings` row as an object; a missing or non-object row is empty."""
    row = db.execute(text(SETTING_SQL), {"key": key}).mappings().first()
    value = dict(row).get("value") if row else None
    return value if isinstance(value, dict) else {}


def _name(value: Any) -> str:
    return value.strip()[:MAX_NAME_CHARS] if isinstance(value, str) else ""


def _colour(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and COLOUR.match(value.strip()) else None


def _image(value: Any) -> str | None:
    """A raster `data:` URI at or under the cap; everything else is nothing at all."""
    if not isinstance(value, str) or len(value) > MAX_IMAGE_CHARS:
        return None
    return value.strip() if IMAGE.match(value.strip()) else None


def payload(db: Session) -> dict[str, Any]:
    """The whole envelope of B1, built from the five keys and nothing else."""
    names = _settings(db, "company_names")
    colours = _settings(db, "brand_colors")
    logo = _image(_settings(db, "company_logo").get("data"))
    # The app logo is HR's own picture when they uploaded one (`app_logo`); until then the company
    # logo is the app's identity, which is what the login screen renders.
    app_logo = _image(_settings(db, "app_logo").get("data")) or logo
    # The punch picture has lived in two places: `brand_colors.punch` (the legacy colour row) and its
    # own `punch_watermark` setting. The colour row wins, because that is the one HR edits.
    punch = _image(colours.get("punch")) or _image(_settings(db, "punch_watermark").get("data"))

    brand: dict[str, Any] = {}
    for field in BRAND_COLOURS:
        colour = _colour(colours.get(field))
        if colour:
            brand[field] = colour
    for field in BRAND_IMAGES:
        picture = _image(colours.get(field))
        if picture:
            brand[field] = picture
    if colours.get("reset") is True:  # their "reset to the stock palette" flag, never a truthy string
        brand["reset"] = True
    if punch:
        brand["punch"] = punch

    return {
        "brand": brand,
        "names": {"coAr": _name(names.get("coAr")), "coEn": _name(names.get("coEn"))},
        "logo": logo,
        "appLogo": app_logo,
    }


def etag(body: dict[str, Any]) -> str:
    """A strong ETag over the answer itself: two databases with the same brand share it."""
    canonical = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def matches(if_none_match: str | None, tag: str) -> bool:
    """`If-None-Match` against our tag: a list, a `W/` prefix and `*` all count (RFC 9110 §13.1.2)."""
    if not if_none_match:
        return False
    if if_none_match.strip() == "*":
        return True
    wanted = {part.strip().removeprefix("W/").strip('"') for part in if_none_match.split(",")}
    return tag.strip('"') in wanted
