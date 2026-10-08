"""File storage on disk (a Railway Volume in production, a local folder in development).

Only the relative storage path is kept in the database (never base64). Files are always streamed
back through the backend after a permission check, so the browser never gets a direct file URL.
"""

from pathlib import Path
from typing import Protocol

from app.config import get_settings
from app.core.errors import ApiError


class Storage(Protocol):
    def put(self, path: str, data: bytes, content_type: str) -> None: ...
    def get(self, path: str) -> bytes: ...
    def delete(self, path: str) -> None: ...


class DiskStorage:
    def __init__(self, root: str | None = None) -> None:
        self.root = Path(root or get_settings().storage_dir).resolve()

    def _path(self, path: str) -> Path:
        full = (self.root / path).resolve()
        if self.root not in full.parents:
            raise ApiError(400, "bad_request", "Invalid storage path")
        return full

    def put(self, path: str, data: bytes, content_type: str) -> None:
        full = self._path(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        tmp = full.with_suffix(full.suffix + ".part")
        tmp.write_bytes(data)
        tmp.replace(full)

    def get(self, path: str) -> bytes:
        full = self._path(path)
        if not full.is_file():
            raise ApiError(404, "not_found", "File not found")
        return full.read_bytes()

    def delete(self, path: str) -> None:
        self._path(path).unlink(missing_ok=True)


_override: Storage | None = None


def set_storage(storage: Storage | None) -> None:
    """Tests use this to point storage at a temporary folder."""
    global _override
    _override = storage


def get_storage() -> Storage:
    return _override if _override is not None else DiskStorage()
