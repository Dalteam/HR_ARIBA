# Backend — FastAPI

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000     # migrations run on startup in development
.venv/bin/pytest -q                                     # SQLite; set TEST_DATABASE_URL for the Postgres test
```

| Command | What |
|---|---|
| `.venv/bin/alembic upgrade head` | apply migrations to `DATABASE_URL` |
| `.venv/bin/alembic revision --autogenerate -m "…"` | draft a migration (review it by hand) |
| `.venv/bin/python -m app.services.seeds create-user --username emp084 --name-ar "…" --role admin` | first admin |

Layout: `app/main.py` (setup) · `config.py` · `database.py` · `models.py` · `schemas.py` · `migrations.py` ·
`core/` (auth, identity, permissions, security, errors, audit, storage, scheduling, language, pagination) ·
`routers/` (thin HTTP) · `services/` (business logic). Tests: one file per feature in `tests/`.

Environment variables are documented in `.env.example`. Deployment: `docs/DEPLOY_RAILWAY.md` (`railway.json`
runs `alembic upgrade head` before each deploy).

`import_from_v114.py` (one-time import from the old V114 Supabase project) is planned for a later phase; see
docs/PROJECT_STATUS.md.
