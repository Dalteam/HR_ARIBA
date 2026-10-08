"""Request language (Arabic first)."""

from typing import Literal

from fastapi import Request

Lang = Literal["ar", "en"]


def get_lang(request: Request) -> Lang:
    header = request.headers.get("accept-language", "")
    return "en" if header.lower().startswith("en") else "ar"


def pick(lang: Lang, ar: str | None, en: str | None) -> str | None:
    """Pick the localized value, falling back to the other language."""
    return (en or ar) if lang == "en" else (ar or en)
