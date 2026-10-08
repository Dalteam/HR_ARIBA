# Deploy on Railway

One Railway project with three services: **Postgres**, **backend** (FastAPI) and **frontend** (Next.js),
all from the GitHub repo `Faisal-Alrashed1/HR_ARIBA`. No Supabase, no Docker.

## 1. Create the project
1. railway.com → sign in with GitHub → **New Project** → **Deploy from GitHub repo** → `HR_ARIBA`.
2. In the project: **+ Create → Database → PostgreSQL**.

## 2. Backend service
Service **Settings**:
- **Root Directory**: `backend` (Railway then reads `backend/railway.json`: migrations run before each deploy,
  health check `/health`).
- **Networking → Generate Domain** (note the URL, e.g. `https://backend-xxx.up.railway.app`).
- **Volumes → Add Volume**, mount path **`/data`** (uploaded photos and documents).

Service **Variables**:

| Variable | Value |
|---|---|
| `ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | a random string, 48+ chars (`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| `RUN_MIGRATIONS_ON_STARTUP` | `false` |
| `STORAGE_DIR` | `/data` |
| `CORS_ORIGINS` | the frontend URL from step 3 (no trailing slash) |
| `BOOTSTRAP_ADMIN_USERNAME` | `emp084` (first deploy only) |
| `BOOTSTRAP_ADMIN_PASSWORD` | a temporary password, 8+ chars with letters and digits (first deploy only) |

## 3. Frontend service
Add the same repo again (**+ Create → GitHub Repo → HR_ARIBA**), then **Settings**:
- **Root Directory**: `frontend/hr-web`
- **Networking → Generate Domain**

**Variables**: `NEXT_PUBLIC_API_URL` = `https://<backend domain>/api/v1`
(it is baked in at build time: redeploy the frontend after changing it).

Then put the frontend URL into the backend's `CORS_ORIGINS` and redeploy the backend.

## 4. First sign-in
Open the frontend URL → sign in with `emp084` and the bootstrap password → you are asked to choose a new
password. Then **delete `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD`** from the backend variables.
(The bootstrap only runs while the users table is empty, but the password should not stay in the settings.)

## Notes
- Every push to `main` redeploys both services. Migrations run automatically (`alembic upgrade head`).
- Backups: enable them on the Postgres service; the `/data` volume holds the uploaded files.
- Verified locally against PostgreSQL 16 in production mode: migrations, RLS on every table, model drift
  check, bootstrap admin, login and forced password change.
