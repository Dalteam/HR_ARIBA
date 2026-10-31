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

    # Notification e-mails. The bell entry (workflow_notifications) also goes out as a full-detail
    # mail whenever the sender is switched on; with it off the API only fills the bell.
    # Credentials come from the environment — never from the database — so nothing secret is stored in
    # ariba_app_settings or ariba_mail_accounts.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Ariba HR"
    smtp_encryption: Literal["starttls", "ssl", "none"] = "starttls"

    # Two switches on purpose: a stray SMTP_HOST in a copied .env must not start mailing employees.
    # NOTIFY_EMAIL_ENABLED=true *and* SMTP_HOST + SMTP_FROM_EMAIL are both needed before a single mail
    # leaves the machine; the loop started by app.main also needs NOTIFY_EMAIL_INTERVAL_SECONDS > 0.
    notify_email_enabled: bool = False
    notify_email_interval_seconds: int = 60     # 0 turns the background loop off (manual flush only)
    notify_email_batch: int = 25
    notify_email_max_tries: int = 5

    # Never mail a notification created before this instant (ISO 8601, e.g. 2026-10-29T00:00:00Z).
    # Empty = the stamp migration 002 wrote into ariba_app_settings['notify_email_since'], which is the
    # moment the migration ran — so the 13 notifications that came with the migrated data are never
    # sent. If neither exists the sender refuses to send anything (fails closed, result.reason).
    notify_email_since: str = ""

    # Comma-separated sink address(es). When set, every message goes there instead of to the employee,
    # with the real address kept in the X-Ariba-Intended-To header — a local or test run can then never
    # reach a real inbox. Outside production the sender refuses real addresses unless they are listed
    # here or NOTIFY_EMAIL_ALLOW_REAL_RECIPIENTS=true.
    notify_email_redirect_to: str = ""
    notify_email_allow_real_recipients: bool = False

    # Used inside the e-mails when ariba_app_settings['app_links'] is empty (the client's migration 39
    # setting). Settings → app links writes that row; this is only the fallback.
    public_app_url: str = "http://localhost:3000"

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
    def notify_email_redirect_list(self) -> list[str]:
        """NOTIFY_EMAIL_REDIRECT_TO split on commas or semicolons, empty entries dropped."""
        raw = self.notify_email_redirect_to.replace(";", ",")
        return [address.strip() for address in raw.split(",") if address.strip()]

    @property
    def is_dev(self) -> bool:
        return self.env == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
