# Security

## Authentication
- Passwords are stored only as **Argon2id** hashes in the `credentials` table (rehashed automatically if the
  parameters change). Unknown usernames are verified against a dummy hash so timing doesn't reveal them.
- Sessions are **HS256 JWTs** signed with `JWT_SECRET` (issuer and audience checked): a 60-minute access token
  and a 7-day refresh token. Each credential has a `token_version`; changing or resetting a password bumps it,
  which immediately invalidates every older token on every device.
- Every request: `Authorization: Bearer <access token>` → signature, expiry, type and version checked → the
  `users` row must exist and be active (401 `unauthorized` / `session_expired`, 403 `account_inactive`).
- **Password policy** (server and client): ≥ 8 characters, letters **and** digits, different from the old one.
  Changing a password re-verifies the current one.
- **Temporary passwords**: HR/admin issue them (shown once, never logged). `must_change_password` blocks every
  endpoint except `/me` and `/auth/change-password` (403 `password_change_required`).
- **Rate limit**: login allows 5 attempts per username and 20 per IP in 5 minutes (429); in-memory, so one
  backend instance only. Behind Railway's proxy the client IP comes from `X-Forwarded-For` (`--proxy-headers`).
- Production refuses to start without a 32+ character `JWT_SECRET` or with SQLite.

## Authorization
Roles: `employee`, `manager`, `finance`, `hr`, `ceo`, `admin`. Every endpoint checks on the server;
the frontend (`proxy.ts`, hidden menu items) only mirrors it.

| Rule | Where |
|---|---|
| Role gates | `require_roles(...)` in each router |
| Data scope: employee → self; manager → self + direct reports; hr/ceo/admin → all; finance → no directory | `permissions.scope_employees` |
| Out-of-scope record → **404**, not 403 | scoped lookups in services |
| Salaries: finance, hr, admin, or the employee themselves | `permissions.can_view_salary` |
| Full ID / passport / insurance card / IBAN: hr, admin, or self; otherwise masked `******1234` | `permissions.can_view_full_ids` |
| Lists always mask the national ID and never include salaries | `employees.to_list_item` |
| Only admin changes roles or creates/resets admin accounts; nobody changes their own role or disables themselves | `services/accounts.py` |

**RLS** is enabled on every table in Postgres with **no policies**: any database role other than the owner
(which the backend uses) reads nothing. It is a second layer behind the backend's own checks.

## Transport and headers
- CORS allowlist from `CORS_ORIGINS`; no credentials mode (bearer tokens only).
- API headers: `Content-Security-Policy: default-src 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, HSTS in production, `X-Request-ID`.
- Frontend headers (`next.config.ts`): CSP that allows `connect-src` to the API origin only, frame-ancestors none.
- OpenAPI docs only in development.

## Data protection (Saudi PDPL in mind)
- **Audit log** (`audit_logs`): logins (successful and failed), employee list and detail reads (noting whether
  salary or full IDs were returned), every write with the changed field **names** (not values), account changes.
  Each entry records actor, IP and request id.
- Minimum disclosure: masked IDs, salary hidden by role, notes hidden from roles without full-ID access.
- Uploads: allowlisted types checked against magic bytes (PDF, Word, JPG, PNG), 12 MB max, stored on disk
  (a Railway Volume) outside the web root and streamed only after a scope check; no base64 in the database.
- Secrets live only in `.env` files, which are git-ignored. `.env.example` files contain no values.

## Session handling in the browser
Access and refresh tokens are kept in first-party, `SameSite=Strict` cookies (`Secure` on HTTPS) so `proxy.ts`
can mirror routing. They are readable by JavaScript (the client sends the bearer token); the strict CSP limits
script injection. A possible hardening step: move tokens to httpOnly cookies behind a
Next.js backend-for-frontend.
