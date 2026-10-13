"""Saudization % = Saudis / current (non-terminated) employees x 100.

Count-based, per the business decision (no Nitaqat weighting yet). Rounded to one decimal.
"""

from decimal import ROUND_HALF_UP, Decimal


def saudization_pct(saudis: int, current: int) -> Decimal:
    if current <= 0:
        return Decimal("0.0")
    return (Decimal(saudis) * 100 / Decimal(current)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
