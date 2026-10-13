"""Alembic environment. Uses the app's DATABASE_URL unless a connection is passed in
(tests pass one through `config.attributes["connection"]`)."""

from alembic import context

from app.config import get_settings
from app.database import make_engine
from app.models import Base

config = context.config
target_metadata = Base.metadata


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    url = config.attributes.get("url") or get_settings().database_url
    engine = make_engine(url)
    with engine.connect() as conn:
        _run(conn)
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline mode is not supported; run against a database.")
run_migrations_online()
