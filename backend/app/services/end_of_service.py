"""End-of-service award (Saudi Labor Law).

As in the HTML (frontend/legacy/hr-portal/js/calculations/04-eos-page-by-law.js, `rEOS`): base = basic + housing;
service years = round2(days / 365.25).

    Arts. 84, 74, 74(3), 74(4): e84 = base/2 x min(y, 5) + base x max(0, y - 5)
    Arts. 85, 75 (resignation): < 2 y: 0 · 2–5: 1/3 · 5–10: 2/3 · >= 10: full e84
    Art. 77: e84 + max(round(2 x base), round(base/30 x 15 x y))
    Arts. 80, 53: 0

The settlement calculator is a later phase; this module already serves the employee record.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.models import TerminationArticle as A

CENT = Decimal("0.01")
_FULL = {A.art_84, A.art_74, A.art_74_death, A.art_74_retirement}
_RESIGN = {A.art_85, A.art_75}
_NONE = {A.art_80, A.art_53}


def service_years(start: date | None, end: date) -> Decimal:
    if start is None or end <= start:
        return Decimal("0")
    return (Decimal((end - start).days) / Decimal("365.25")).quantize(CENT, ROUND_HALF_UP)


def eos_award(base: Decimal, years: Decimal, article: A) -> Decimal:
    base, years = Decimal(base), Decimal(years)
    e84 = base / 2 * min(years, Decimal(5)) + base * max(Decimal(0), years - 5)
    if article in _FULL:
        amount = e84
    elif article in _RESIGN:
        if years < 2:
            amount = Decimal(0)
        elif years < 5:
            amount = e84 / 3
        elif years < 10:
            amount = e84 * 2 / 3
        else:
            amount = e84
    elif article == A.art_77:
        whole = Decimal(1)
        amount = e84.quantize(CENT, ROUND_HALF_UP) + max(
            (2 * base).quantize(whole, ROUND_HALF_UP), (base / 30 * 15 * years).quantize(whole, ROUND_HALF_UP)
        )
    elif article in _NONE:
        amount = Decimal(0)
    else:  # pragma: no cover - every enum member is handled above
        raise ValueError(article)
    return amount.quantize(CENT, ROUND_HALF_UP)
