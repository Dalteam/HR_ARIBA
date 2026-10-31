# Notification e-mails

Every bell entry (`workflow_notifications`) is also mailed once, with the full details of the request
and — when a letter or template was sent with a PDF — that PDF attached. This is our port of the
client's `ariba-notify-email` Edge Function (and the PDF half of `ariba-send-email`) onto the
normalized schema and the FastAPI backend.

Code: `backend/app/services/notify_email.py` (the sender), `backend/app/routers/canonical.py`
(`send_letter` stores the PDF, `GET /me/notifications/{id}/file` serves it),
`docs/db-migrations/002_notif_email_pool.sql` (tables, pool, template RPC, cut-off).

## How a mail leaves

1. `POST /letters`, a request, a decision … insert a `workflow_notifications` row (that is the bell).
2. The sender polls the rows with `emailed_at IS NULL AND email_tries < NOTIFY_EMAIL_MAX_TRIES` **and**
   `created_at >= cut-off` (see Safety), oldest first.
3. It builds the message (subject, bilingual body, action box, "open the app" button, attachments) and
   hands it to SMTP.
4. Success stamps `emailed_at`; a failure records `email_error` and one more try. Nothing is ever
   sent twice, and a recipient with no address in `employee_directory.data` is left for HR to fill in.

## Aligned with the client

| Client (`ariba-notify-email` / `ariba-send-email`) | Ours |
|---|---|
| recipient e-mail = first of `email, workEmail, work_email, emailAddress, email_address, personalEmail, personal_email, mail, ml` that looks like an address | same field order, same regex (`notify_email.ADDRESS_FIELDS`, `recipient_address()`) |
| subject `[الحدث] نوع الطلب — الموظف` (`decision` → `قرار: معتمد`, templates → their title) | same shape (`subject()`, `event_label()`, `type_label()`) |
| staff → HR portal link, employee → employee-app link, HR deep-links `#/lv`, `#/dash` | same (`link_for()`, `STAFF_ROLES`, `DEEP_LINKS`) |
| links come from `ariba_app_settings['app_links']`, company name from `company_names.coAr` | same, with `PUBLIC_APP_URL` / `Ariba HR` as fallbacks |
| attachments: `ariba_notif_files` first, else the request's `ariba_documents` (≤ 6 MiB each, 14 MiB total, max 5) | same budget and fallback (`attachments()`) |
| skip if already sent (`emailed_at` / `email_status`) | `emailed_at IS NULL` in the queue query |
| `x-notify-key` + service role, called by a DB trigger | no trigger and no key: the API is the only writer and the queue is internal |
| mailbox `ariba_mail_accounts` (owner `company`), plaintext password, Resend fallback, Graph for M365 | routing fields read from the same table as a **fallback**; password only from `SMTP_PASSWORD`; no Resend/Graph (see gaps) |

Subject example: `[طلب جديد] إجازة سنوية — محمد فرج`.

## Safety (all of it is enforced in the code, not only in the docs)

1. **Off by default.** `NOTIFY_EMAIL_ENABLED=false` and empty `SMTP_*`. Both the switch and a usable
   server are required (`notify_email.enabled()`), and the loop in `app.main` also needs
   `NOTIFY_EMAIL_INTERVAL_SECONDS > 0`.
2. **Old notifications are never mailed.** Migration 002 writes `ariba_app_settings['notify_email_since']`
   = the moment it ran (plus how many rows that silences). The queue only reads rows created at or after
   it; `NOTIFY_EMAIL_SINCE` overrides it. No stamp at all → `flush()` sends nothing (`reason=no-cutoff`).
3. **Local/test runs cannot reach a real inbox.** Outside production the message only goes to
   `NOTIFY_EMAIL_REDIRECT_TO` (the subject gets a `[test] ` prefix and the real address is kept in the
   `X-Ariba-Intended-To` header). Without a sink the row is refused and `email_error` says why
   (`notify_email.BLOCKED_REASON`); `NOTIFY_EMAIL_ALLOW_REAL_RECIPIENTS=true` is the explicit override.

Proof: `backend/tests_canonical/test_notify_email.py` (unit) and a pass on a copy of the migrated
database (`ariba_t004` from `ariba_src`) that checks all three rules against the real 13 notifications.

## Known gaps / fix later

The client's feature lived in Supabase Edge Functions; what needs Supabase (or a decision) is listed
here rather than half-built. Nothing below is wired in a way that could send mail by accident.

1. **Password of the mailbox in the database.** The client stores it in clear text in
   `ariba_mail_accounts.password` and reads it there. Our table has `password_enc bytea` and no reader,
   deliberately: a secret in the database ends up in every dump. Today the password comes from
   `SMTP_PASSWORD`. *To fix:* decide on a key (Railway secret + Fernet/AES-GCM) and add
   encrypt/decrypt + a way to change it from Settings → Mail.
2. **Settings → Mail writes a row we only half-read.** `ariba_mail_accounts` (owner `company`) is read
   for host/port/secure/username/from_name/from_email when the `SMTP_*` variables are empty; the
   password field is ignored, so a mailbox saved only in the UI cannot send. *To fix:* same as (1).
3. **Per-user sending address.** `ariba-send-email` can send from the signed-in HR person's own mailbox
   (`pickAccount(acc.employee_id)`), and the Mail card has a "my mailbox" scope. We always send from the
   company address. *To fix:* link `ariba_mail_accounts.owner` to an auth account and pick the row per
   sender; needs (1) first.
4. **Microsoft 365 through Graph.** The client falls back to Graph (`M365_TENANT_ID`, `M365_CLIENT_ID`,
   `M365_CLIENT_SECRET`, scope `Mail.Send`) when SMTP to 587/25 is blocked. We only speak SMTP. *To fix:*
   an app registration + the three secrets, then a Graph transport in `_deliver`.
5. **Resend/HTTP fallback.** The client falls back to `RESEND_API_KEY` + `EMAIL_FROM`. Not ported: it
   leaks employee names and request details to a third party, which is the customer's decision.
6. **The client's exact HTML.** The formal template (letterhead, ordered Arabic sections, REF number,
   Riyadh-formatted timestamps, override labels in the approval chain) is not reproduced; ours keeps the
   client's structure — subject shape, action box, deep link, details table, PDF — with our own wording,
   in `_html_body()` / `_text_body()` in one place each.
7. **The per-request-type sentence.** The client's `describe()` writes a full Arabic sentence per request
   type ("تقدّم الموظف/ة … بطلب إجازة سنوية لمدة ٣ أيام من … إلى …"). We print the payload rows and an
   action hint instead; the sentence generator is not ported.
8. **`email_status`.** The client's function writes `email_status = sent|failed`. Our table has no such
   column, so `emailed_at` / `email_error` / `email_tries` are the state. *To fix:* add the column (and a
   view) only if something needs it.
9. **`ariba_mail_log`.** The sender does not write the mail log; the per-row `email_error`/`email_tries`
   and the audit log are the trail. *To fix:* write one row per attempt once the columns are agreed.
10. **Bounces and delivery events.** Nothing reads them back; a bad address simply fails at SMTP and is
    retried `NOTIFY_EMAIL_MAX_TRIES` times. Needs a bounce mailbox or a provider webhook.
11. **One language.** The body is Arabic + English for everybody; the client had no per-recipient
    preference either, but a language setting per employee would be easy to add here.
12. **`p_token` RPCs** (`ariba_hr_send_template`, the bell RPCs) still resolve sessions through
    `ariba_session_row()`, which reads the Supabase `auth` schema. That predates this feature and is
    unchanged; the app talks to the FastAPI routes instead.
13. **The PDF inside the employee app.** `GET /me/notifications/{notification_id}/file` serves it (and
    mail carries it), but `frontend/employee-app` has no button and no viewer — the client's own UI did not
    show it either. *To fix:* `expo-file-system` + `expo-sharing` (download with the Bearer token, hand
    the file to the OS), a button on the letter/bell row, and a phone to prove it. Local steps and the
    checklist live in [LOCAL_TESTING.md](LOCAL_TESTING.md) §6.
14. **The bell title of a sent letter is English** — "A letter is waiting for your response" — while the
    e-mail subject uses the letter's Arabic title. Pre-dates this feature (the line is only extended with
    the notification id here). *To fix:* one string in `send_letter`.
