"""Application settings, loaded from the environment / .env and validated at startup."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    # SQLite for quick local work; Railway's Postgres in production (DATABASE_URL is injected by Railway).
    database_url: str = "sqlite:///./dev.db"
    run_migrations_on_startup: bool = True

    # Our own sign-in: passwords hashed with Argon2 in Postgres, sessions as HS256 JWTs.
    jwt_secret: str = ""
    jwt_issuer: str = "ariba-hr"
    jwt_audience: str = "ariba-hr-api"
    access_token_minutes: int = 60
    refresh_token_days: int = 7

    # Uploaded files (photos, documents). On Railway this is the mount path of a Volume, e.g. /data.
    storage_dir: str = ".storage"

    # Comma-separated list of allowed origins (the frontend's URL).
    cors_origins: str = "http://localhost:3000"

    # Login rate limits (attempts per window).
    login_window_seconds: int = 300
    login_max_per_username: int = 5
    login_max_per_ip: int = 20

    max_upload_bytes: int = Field(default=12 * 1024 * 1024)

    # First deploy only: create this admin if there are no users yet (must change the password at
    # first sign-in). Remove both variables after the first successful login.
    bootstrap_admin_username: str = ""
    bootstrap_admin_password: str = ""

    @model_validator(mode="after")
    def _check(self) -> "Settings":
        if self.env == "production":
            if len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be set to a random string of at least 32 characters in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("SQLite is not allowed in production; set DATABASE_URL to Postgres")
        elif not self.jwt_secret:
            # Development/test convenience only: a fixed, clearly-labelled secret.
            self.jwt_secret = "dev-only-insecure-secret-change-me-0123456789"
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.env == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
