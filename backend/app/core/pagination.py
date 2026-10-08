"""Shared pagination, search and sort for list endpoints."""

from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError

T = TypeVar("T")


class PageParams(BaseModel):
    page: int
    page_size: int
    sort: str | None
    q: str | None


def page_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort: str | None = Query(None, max_length=40, description="Field name; prefix with '-' for descending"),
    q: str | None = Query(None, max_length=100),
) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort, q=q.strip() if q else None)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


def apply_sort(stmt: Select, sort: str | None, allowed: dict, default) -> Select:
    if not sort:
        return stmt.order_by(*default)
    desc = sort.startswith("-")
    key = sort.lstrip("-")
    col = allowed.get(key)
    if col is None:
        raise ApiError(400, "bad_request", f"Cannot sort by '{key}'", {"allowed": sorted(allowed)})
    return stmt.order_by(col.desc() if desc else col.asc(), *default)


def paginate(db: Session, stmt: Select, params: PageParams) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)).unique().all()
    return list(rows), total
