# Feature: authentication and accounts

## What it does
- Sign in with a **username** (the employee number, e.g. `emp084`) and password.
- Sessions: access token (60 min) + refresh token; the frontend refreshes once on a 401.
- First sign-in with a temporary password forces a password change before anything else.
- HR/admin create logins for employees and issue temporary passwords; admins change roles.

## Flow
1. `POST /api/v1/auth/login {username, password}` → rate limit → Argon2 check against `credentials` → active
   check → audit → `{access_token, refresh_token, expires_in, user}`.
2. The frontend keeps the tokens in cookies (`lib/session.ts`); `proxy.ts` reads the role claim to redirect
   (mirror only).
3. Every API call: `Authorization: Bearer …` → `core/auth.py` (signature, expiry, token version) → `users` row
   → role/scope checks.
4. If `must_change_password`: a blocking password dialog (as in the prototypes); the backend refuses every
   other endpoint until the change. Changing the password returns a new session and revokes all older ones.

## Code
- Backend: `core/auth.py`, `core/identity.py` (Argon2, tokens), `core/security.py` (rate limit, password policy), `services/accounts.py`, `routers/auth.py`, `routers/me.py`
- Frontend: `lib/auth.ts`, `lib/session.ts`, `lib/auth-context.tsx`, `proxy.ts`, `app/login/`, `app/me/settings/`, `components/me/change-password-form.tsx`
- Tests: `tests/test_auth.py`

## Bootstrap
`python -m app.services.seeds create-user --username emp084 --name-ar "…" --role admin` creates the employee
and login. The temporary password is written to `backend/.env.test.local` (or printed with `--print`).

## First admin
Locally: the seeds CLI above. On Railway: `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`
(see DEPLOY_RAILWAY.md).
