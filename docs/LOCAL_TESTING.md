# Local testing (database + API + web app + employee app)

Everything below runs on your machine only. The database is a **copy** of the validated `ariba_src`
(called `ariba_local`), notification e-mail is **off**, and the sender refuses real employee addresses
outside production — see [NOTIFY_EMAIL.md](NOTIFY_EMAIL.md). Section 4 runs the Expo app
(`frontend/employee-app`) against that backend; section 6 is its click-through checklist.

## 0. Prerequisites

* PostgreSQL 17 running on `localhost:5432` with the superuser `postgres` (the same server that holds
  `ariba_src`), because the API needs a role with `BYPASSRLS`.
* `backend\.venv` (already in the repo folder) and Node 24.
* PowerShell blocks `npm.ps1` on this machine, so every npm command here is `npm.cmd`.

```powershell
$repo = 'C:\Users\GhadyNafisah\Downloads\HR_ARIBA-main\HR_ARIBA-main\HR_ARIBA-main'
```

## 1. Terminal 1 — the database + the test logins (once)

```powershell
cd $repo
backend\.venv\Scripts\python.exe tools\smoke\smoke_setup.py --src ariba_src --dst ariba_local
```

It drops and recreates `ariba_local` from `ariba_src` (migration 002 included), then re-sets the
password of five existing accounts to `SmokeTest!2026`. Re-run it whenever you want a clean database.

| Login | Role | Employee | Use it for |
|---|---|---|---|
| `EMP010` | admin | 10 | HR screens, employees, payroll, settings |
| `EMP040` | admin (HR approver) | 40 | the HR stage of a request; the HR bell pool |
| `EMP086` | ceo (manager of employee 2) | 86 | approving employee 2's requests (manager stage) |
| `EMP002` | employee | 2 | raising requests (has a manager) |
| `EMP102` | employee | 102 | the plain employee view (no manager) |

Password for all five: `SmokeTest!2026`.

## 2. Terminal 2 — the backend

```powershell
cd $repo\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

It reads `backend\.env` (git-ignored, already created):

```ini
ENV=development
DATABASE_URL=postgresql://postgres@localhost:5432/ariba_local
JWT_SECRET=local-dev-only-secret-please-change-0123456789abcdef
STORAGE_DIR=.storage
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
NOTIFY_EMAIL_ENABLED=false
NOTIFY_EMAIL_REDIRECT_TO=
NOTIFY_EMAIL_ALLOW_REAL_RECIPIENTS=false
PUBLIC_APP_URL=http://localhost:3000
```

Ready when it prints `Application startup complete.`; check <http://127.0.0.1:8000/health> →
`{"status":"ok", ...}` and the interactive API at <http://127.0.0.1:8000/docs>.

> Testing the phone app (section 4)? Use `--host 0.0.0.0` instead of `--host 127.0.0.1`, otherwise the
> phone cannot reach this backend.

## 3. Terminal 3 — the web app

```powershell
cd $repo\frontend\hr-web
npm.cmd run dev
```

`frontend\hr-web\.env.local` already points at the local API:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Open <http://localhost:3000> (Next.js dev on port 3000). For a production build instead:
`npm.cmd run build` then `npm.cmd start`.

## 4. Terminal 4 — the employee app (`frontend/employee-app`, Expo SDK 57)

The app is **Expo SDK 57** (`expo ~57.0.27`, React Native 0.86.3, React 19.2.3, Node 22.13+ — this PC has
Node 24). Expo Go *in the stores* is **SDK 58**, so it refuses this project with "Project is incompatible
with this version of Expo Go". Install the SDK 57 build instead:

- **Android phone:** <https://expo.dev/go?sdkVersion=57&platform=android&device=true> → the APK
  (`Expo-Go-57.0.9.apk`), sideload it (allow "install unknown apps" once).
- **iOS phone:** Apple does not keep old Expo Go builds in the App Store. Build one for your TestFlight
  team with `npx eas-cli@latest go --sdk-version 57.0.0` (needs an Expo account and an EAS project), or
  use an Android phone / the browser preview.

### 4.1 The one setting: where the API is

`src/lib/api.ts` reads `EXPO_PUBLIC_API_URL` (its default is the Railway backend). Expo inlines it when
Metro starts, so set it **before** `expo start` and restart with `--clear` after any change. This is not
cosmetic: Metro caches the transform, so without `--clear` the bundle keeps the **old** value. Checked by
exporting the Android bundle twice — the cached one still contained the Railway default, the `--clear`
one contained `http://172.20.10.2:8000`. Create `frontend\employee-app\.env` (git-ignored; on this PC it
already exists and points at `172.20.10.2`):

```powershell
$lan = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1).IPAddress
$lan                                    # e.g. 172.20.10.2 — the phone must reach THIS address
Set-Content -Path "$repo\frontend\employee-app\.env" -Value "EXPO_PUBLIC_API_URL=http://${lan}:8000"
Get-Content "$repo\frontend\employee-app\.env"
```

`localhost` / `127.0.0.1` inside the app means *the phone itself*, so it never works on a device.

### 4.2 Make the backend reachable from the phone

```powershell
cd $repo\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` listens on every interface; the `127.0.0.1` default in section 2 is unreachable from the
phone.

Windows Firewall — once, in an **elevated** PowerShell (`-Profile Private` = home/office Wi-Fi only):

```powershell
New-NetFirewallRule -DisplayName "ARIBA local API 8000" -Direction Inbound -Protocol TCP `
  -LocalPort 8000 -Action Allow -Profile Private
Get-NetFirewallRule -DisplayName "ARIBA local API 8000" | Select-Object Enabled,Profile
```

Remove it as soon as you are done:

```powershell
Remove-NetFirewallRule -DisplayName "ARIBA local API 8000"
```

> ⚠️ **This exposes the test data on your local network.** While the rule exists and uvicorn runs with
> `--host 0.0.0.0`, anyone on the same Wi-Fi can open the API, the API docs and the five test logins
> (employees, payslips, attendance, letters). Use a trusted network only, keep it on just while testing,
> and remove the rule (or stop uvicorn) afterwards. Never do this on public Wi-Fi, and never point it at
> the Railway database or at real employee data.

### 4.3 Prove the phone can reach the backend — before starting Expo

In the **phone's browser** open `http://<lan>:8000/health` (e.g. `http://172.20.10.2:8000/health`) →
`{"status":"ok"}`, and `http://<lan>:8000/docs` for the API explorer. If these do not load, the app will
fail the same way: fix Wi-Fi/firewall first.

### 4.4 Three ways to run it

| | Command | Notes |
|---|---|---|
| **Expo Go on a phone** (recommended) | `cd $repo\frontend\employee-app` · `npm.cmd ci` · `npx.cmd expo start --clear` | scan the QR **from inside Expo Go** (Development servers) — not with the camera. Phone and PC on the same Wi-Fi. Slow/failing QR? `npx.cmd expo start --tunnel --clear`; on a physical iPhone `npx.cmd expo login` and sign in to Expo Go with the same account. |
| **Android emulator** | `npx.cmd expo start --android` | needs Android Studio + an AVD (**not installed on this PC** — no `adb`, no `%LOCALAPPDATA%\Android\Sdk`). The emulator reaches the PC at **`10.0.2.2`**, so `.env` must read `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000` (not the LAN IP), and the SDK 57 Expo Go APK must be installed in the AVD. |
| **Browser** | `npx.cmd expo start --web --port 8081 --clear` | dev preview only (the web bundle builds — verified with `npx expo export --platform web`). `react-native-web` has no `react-native-webview`, so **«عرض المستند» shows "React Native WebView does not support this platform."**, and `Alert` is a no-op (the delete confirmation never opens). Its origin must be in the backend's `CORS_ORIGINS`: `http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081`. A phone (native app) is not a browser origin, so CORS does not apply there. |


## 5. Click-through checklist — web app (`hr-web`)

| # | Where | Do this | Expect |
|---|---|---|---|
| 1 | `/login` | `EMP010` / `SmokeTest!2026` | you land on the dashboard, your name in the header |
| 2 | Employees | open **الموظفون** | the counter says **106**; the list is paged (100 per page), status filters work |
| 3 | Employee | open `EMP102` (or any row) → change the mobile → **حفظ** | "saved" toast; reload shows the new number |
| 4 | Leave (employee) | sign in as `EMP002` in a second browser/incognito → **إجازة** → request **عن بعد** for one day | the request appears "قيد الاعتماد" with stage «المدير المباشر». `EMP002` has **0** annual balance in the copy, so «إجازة سنوية» is refused with «يتجاوز الرصيد المتاح» — that is the data, not a bug (`EMP102` has 3.46 days if you want a successful annual leave) |
| 5 | Approval (manager) | as `EMP086` → **الموافقات** → approve it | the request moves to stage «الموارد البشرية»; `EMP002`'s bell gets an entry |
| 6 | Approval (HR) | as `EMP040` → **الموافقات** → approve it | status «معتمد»; `EMP002`'s bell shows the decision |
| 7 | Attendance | as `EMP010` → **الحضور** (month view) and as `EMP002` → **حضوري** | the HR month grid and the employee's own punches load without errors |
| 8 | Payroll | as `EMP010` → **الرواتب** → open/create a month sheet | the sheet opens, columns and totals render; `EMP002` → **قسائم الراتب** lists their payslips |
| 9 | Bell | click the bell (top bar) as `EMP086` / `EMP002` | entries with titles; **تعليم الكل كمقروء** clears the badge |
| 10 | Settings | as `EMP010` → **الإعدادات** → card **«روابط الإشعارات»** | two fields (HR link, employee link); save `https://hr.example.com` / `https://emp.example.com` → toast; reload keeps them; `ftp://x` is rejected |
| 11 | Letters | as `EMP010` → **النماذج/الخطابات** → send a letter to `EMP102` **with a PDF** | success toast with the file name; `EMP102`'s bell shows the letter; the bell entry can download the PDF |
| 12 | E-mail | — | **nothing is sent**: e-mail is off locally, and even if it were on the sender would only talk to `NOTIFY_EMAIL_REDIRECT_TO` |

## 6. Click-through checklist — employee app (`employee-app`)

Same five logins, same API (`/api/v1`), same database copy. Every request the app makes was replayed
against this backend (`_tools\_e_app_compat.py`, 32/32 ok) — including the bell and the new
`GET /me/notifications/{id}/file` — so anything that fails below is the run step, not the API contract.

| # | Where | Do this | Expect |
|---|---|---|---|
| 1 | login screen | `EMP002` / `SmokeTest!2026` | home «الرئيسية»: the punch dial, the three tiles (رصيد الإجازة، رصيد نهاية العام، عن بعد المتبقي), **بياناتي**, «آخر راتب معتمد», «جهة العمل ومواقع العمل» |
| 2 | الراتب | open the tab | «الراتب الحالي» (basic/housing/transport/net) + «قسيمة الراتب — <month>» + «بيانات البنك» + the earlier approved sheets expand |
| 3 | الإجازات → طلباتي | open the tab as `EMP002` | «طلباتي» lists this employee's requests with their stage; nothing else |
| 4 | الإجازات → إرسال طلب جديد | pick **إجازة سنوية**, pick from/to, «إرسال الطلب» | refused with **«يتجاوز الرصيد المتاح»**: `EMP002` has 0 annual balance in the copy (server 422 `exceeds_balance`) — expected, not a bug |
| 5 | الإجازات | pick **عن بعد** for one day, «إرسال الطلب» | «تم إرسال الطلب»; the new row appears with the badge «بانتظار المدير المباشر» (server 201, `current_stage=manager`) |
| 6 | الإجازات | sign in as `EMP086` (the manager) → «فريقي» → approve it | the request moves to «بانتظار الموارد البشرية»; back as `EMP002` the bell has «تمت الموافقة…» |
| 7 | الحضور | open the tab | «حالة الحضور اليوم», «سجل آخر 31 يوم», «استعلام عن حضور بفترة محددة» (pick a range → «بحث» → rows) |
| 8 | الحضور | tap «تسجيل الحضور» away from the office | the location badge says «خارج النطاق — أقرب موقع … (…)» and the tap answers **«خارج نطاق العمل»** (server 409 `outside_geofence`). Inside a work location's radius it records «حضور»; «تسجيل الانصراف» → «رجوع للعمل» works on the same day |
| 9 | 🔔 (header) | tap the bell | the panel lists the entries: a letter = «A letter is waiting for your response» / «نموذج جديد بانتظار ردك», a decision = «تمت الموافقة…»; unread rows are tinted and counted |
| 10 | 🔔 → «تعليم الكل كمقروء» | tap it | the badge disappears (`POST /me/notifications/read` → 204) and the tint clears |
| 11 | 🔔 → tap a letter entry | tap it | the panel closes and **المستندات** opens |
| 12 | المستندات | «عرض المستند» on the letter HR sent (web step 11) | the letter's HTML renders in the WebView (`GET /letters/{id}/html`, `text/html`) — **not in the browser preview**, where `react-native-webview` prints "React Native WebView does not support this platform." |
| 13 | المستندات | «موافقة», then send a second letter and «رفض» with a reason | toasts «تمت الموافقة» / «تم إرسال الرفض»; the row shows «موافق» / «مرفوض» + the reason. In the browser preview `Alert` is a no-op, so the delete-a-request confirmation never opens |
| 14 | header ↻ | tap the refresh button | «تم التحديث والحفظ» — all tabs and the bell reload |
| 15 | PDF letter | not in the app yet | the sent PDF is attached to the **e-mail** and served by `GET /api/v1/me/notifications/{notification_id}/file` (Bearer token, `application/pdf`); the app has **no button for it** — see «Known gaps» in [NOTIFY_EMAIL.md](NOTIFY_EMAIL.md) and the fix-later list below |

Notes:
- The bell polls every 60 s and on returning to the foreground, so a new letter may take a minute — use ↻.
- `EMP010` / `EMP040` also see the HR-pool entries in their bell (the pool change), which is why their
  panel can list requests that are not theirs.
- The PDF endpoint belongs to the **recipient**: another employee gets `404` (checked).

### 6.1 Fix later — cannot be checked without a phone (or is not built)

| # | What | Why it is open |
|---|---|---|
| 1 | Anything on a real device: GPS punch inside the radius, `Alert` dialogs, font rendering, RTL layout, the WebView letter, dark mode, `expo-secure-store` | no phone/emulator on this PC (no `adb`, no Android SDK, no Xcode). Only `tsc`, the Metro bundle and the API calls were verified here |
| 2 | Opening the notification PDF **inside** the app | not built. Today the PDF is e-mailed and served by the API. A viewer needs `expo-file-system` + `expo-sharing` (download with the Bearer token, then hand the file to the OS share sheet) plus a new button on the letter/bell row — and a device to prove it |
| 3 | Push notifications | never built (Expo Go cannot do push on Android; needs an EAS project + a dev build). The bell is pull-only |
| 4 | `--tunnel` mode, iOS Expo Go sign-in | needs an Expo account and a device |
| 5 | Android emulator (`10.0.2.2`) | needs Android Studio installed |
| 6 | Testing the app **on a real phone** (Expo Go + QR) | blocked on this PC: it cannot run an elevated PowerShell, so the inbound rule for TCP 8000 cannot be created and the phone gets nothing from `http://<lan>:8000`. Until IT adds the rule (8000 **and** 8081, LocalSubnet only) only the **browser preview on this PC** is possible — see §4.4 |
| 7 | GPS punch from a **phone** browser | `navigator.geolocation` needs a secure context: allowed on `http://localhost` (this PC) but blocked on `http://<lan>:8081` from the phone. A phone can only prove it over HTTPS (Railway). On the PC's browser the fix comes from Windows location services, or from DevTools → device toolbar → ⋯ → **Sensors → Location** (paste a site's `latitude`/`longitude` from the `/api/v1/me/attendance` response) |


## 7. Removing what the setup added

```powershell
# the five test accounts only (keeps the database)
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -h localhost -d ariba_local -c `
  "DELETE FROM public.ariba_auth_accounts WHERE username IN ('EMP010','EMP040','EMP086','EMP002','EMP102');"

# or the whole local copy
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -h localhost -d postgres -c `
  'DROP DATABASE IF EXISTS ariba_local WITH (FORCE);'
```

`ariba_src` (the validated database) is never modified by any of this.

## 8. When something fails

| Symptom | Where the reason is |
|---|---|
| the page loads but every call fails (browser console: `Failed to fetch` / CORS) | Terminal 2 is not running, or `CORS_ORIGINS` in `backend\.env` does not list `http://localhost:3000`; the backend console prints nothing for a CORS rejection, the browser console prints it |
| `401` / you are bounced to `/login` | the access token expired (60 min) or `JWT_SECRET` changed after you signed in — sign in again |
| `422` on a form | the API rejected a field; the response body names it (`{"error":{"code":"invalid_request","message":…}}`) and the Network tab shows the exact payload |
| `403` | the account's role cannot do that action (e.g. `EMP102` editing employees) |
| `500` | the backend console (Terminal 2) has the traceback |
| frontend build/type errors | `npx.cmd tsc --noEmit` in `frontend\hr-web`; `npm.cmd run lint` |
| a bell entry with no e-mail | expected: e-mail is off. `python -m app.services.notify_email` prints `{"reason": "disabled", ...}` |
| the app says «بيانات الدخول غير صحيحة» although the password is right, or every screen is empty | the app is talking to another backend: check `frontend\employee-app\.env` (`EXPO_PUBLIC_API_URL`), then restart Expo with `--clear` — the value is inlined at bundle time |
| the app cannot reach the API at all (spinner, «تعذر الاتصال بالإنترنت») | open `http://<lan>:8000/health` in the **phone's** browser; if that fails it is Wi-Fi isolation (guest/AP isolation), the firewall rule, or uvicorn bound to `127.0.0.1` instead of `0.0.0.0` |
| Expo Go says "Project is incompatible with this version of Expo Go" | store Expo Go is SDK 58; install the SDK 57 build from <https://expo.dev/go?sdkVersion=57&platform=android&device=true> (or upgrade the project) |
| the browser preview shows "React Native WebView does not support this platform." | expected: `react-native-webview` has no web implementation. Use a phone for the letters screen |
