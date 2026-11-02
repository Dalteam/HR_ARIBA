"""The company's identity, answered before anybody signs in (Stage 6 of the employee-app port).

One route, and it is the only one in this API without a token:

    GET /public/brand    port.ts's brandInfo()    the palette, the two names and the two pictures

Why it has to be public: the login screen paints itself from it before a session exists, and an app
whose colours are wrong on the first screen looks like somebody else's app. What it must therefore
never do is become a window into `ariba_app_settings` — that table holds the HR signer's signature
and stamp, the letterhead, the medical form, the GOSI rules and every switch. `services/brand.py`
reads five keys by name and copies named fields out of them (B2), and this route only turns that
into an answer with a cache policy (B3): the same answer for every caller, `public, max-age=300`,
an `ETag`, and `304` when the phone already has it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import brand

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/brand")
def public_brand(request: Request, db: Session = Depends(get_db)):
    """`{brand, names, logo, appLogo}` — the closed envelope of B1, cached (B3).

    No `Depends(current_actor)`: this is the one answer a signed-out phone needs. A caller that does
    send a token is answered the same way, which is what makes the `Cache-Control: public` honest.
    """
    body = brand.payload(db)
    tag = '"' + brand.etag(body) + '"'
    headers = {"ETag": tag, "Cache-Control": f"public, max-age={brand.CACHE_SECONDS}, must-revalidate"}
    if brand.matches(request.headers.get("if-none-match"), tag):
        return Response(status_code=304, headers=headers)
    return JSONResponse(body, headers=headers)
