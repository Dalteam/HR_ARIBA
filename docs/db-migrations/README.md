# Database Migration for Porting the React System (Task 5) — ترحيل قاعدة البيانات لنقل نظام React (المهمة 5)

> English first, then the full Arabic version (same content).

---

# English

## Database Migration for Porting the React System (Task 5)

| File | What it does |
|---|---|
| `001_react_port.sql` | The new tables and columns on the normalized schema (without any change to the data): candidates, their files and application links, goals and evaluations, delegation and manager permissions, document signing, leave attachments, mail accounts (password encrypted) and the send log, tasks and meetings, WebAuthn and Push, request-workflow columns (on behalf, escalation, return), notification email, the payroll path (prepare/approve/reopen), the new request and document types, and the default settings (`workflow_config`, `doc_sign_cfg`, `apply_invite_*`). A single transaction, and every item is `IF NOT EXISTS`, so running it a second time changes nothing. |
| `verify_001.sql` | Verifies every new table, column and key; any FAIL line stops the script. |
| `run_on_railway.sh` | A full backup with verification of it → confirm the database is normalized → run every `0NN_*.sql` in order → verify → compare row counts before/after. |

### Running it (the project owner, from his machine)
```
bash docs/db-migrations/run_on_railway.sh demo
bash docs/db-migrations/run_on_railway.sh production
```
The backup is in `~/Desktop/HR/backups/before-react-port/`. The new server **does not start** before this migration (it refuses to start if a table is missing), so the order is: migration first, then merge into `main`.

### The local trial (done in the cloud session)
```
ARIBA_DEV_PASSWORD='…' PGHOST=/tmp PGUSER=postgres bash tools/dev-db/build.sh ariba_trial --no-migrations
bash docs/db-migrations/run_on_railway.sh local:ariba_trial      # twice: the second changes nothing
```
Result: the backup is sound, all checks ok, 25 foreign keys on the new tables, and row counts before = after.
Not tried on the production copy (there is no data in the cloud) — try it on `ariba_after2` locally before Railway (Task 10).

---

# العربي

## ترحيل قاعدة البيانات لنقل نظام React (المهمة 5)

| الملف | ماذا يفعل |
|---|---|
| `001_react_port.sql` | الجداول والأعمدة الجديدة على السكيما المرتّبة (بدون أي تغيير على البيانات): المرشحون وملفاتهم وروابط التقديم، المستهدفات والتقييمات، التفويض وصلاحيات المديرين، توقيع المستندات، مرفقات الإجازات، حسابات البريد (كلمة المرور مشفّرة) وسجل الإرسال، المهام والاجتماعات، WebAuthn وPush، أعمدة سير الطلبات (بالنيابة، التصعيد، الإرجاع)، إيميل الإشعارات، مسار المسيّر (تجهيز/اعتماد/فتح)، أنواع الطلبات والمستندات الجديدة، والإعدادات الافتراضية (`workflow_config`، `doc_sign_cfg`، `apply_invite_*`). معاملة واحدة، وكل عنصر `IF NOT EXISTS` فتشغيله مرة ثانية لا يغيّر شيئاً. |
| `verify_001.sql` | يتحقق من كل جدول وعمود ومفتاح جديد؛ أي سطر FAIL يوقف السكربت. |
| `run_on_railway.sh` | نسخة احتياطية كاملة مع التحقق منها ← التأكد أن القاعدة مرتّبة ← تشغيل كل `0NN_*.sql` بالترتيب ← التحقق ← مقارنة عدد الصفوف قبل/بعد. |

### التشغيل (صاحب المشروع، من جهازه)
```
bash docs/db-migrations/run_on_railway.sh demo
bash docs/db-migrations/run_on_railway.sh production
```
النسخة الاحتياطية في `~/Desktop/HR/backups/before-react-port/`. الخادم الجديد **لا يشتغل** قبل هذا الترحيل (يرفض البدء لو نقص جدول)، فالترتيب: الترحيل أولاً ثم الدمج في `main`.

### التجربة المحلية (تمت في الجلسة السحابية)
```
ARIBA_DEV_PASSWORD='…' PGHOST=/tmp PGUSER=postgres bash tools/dev-db/build.sh ariba_trial --no-migrations
bash docs/db-migrations/run_on_railway.sh local:ariba_trial      # مرتين: الثانية لا تغيّر شيئاً
```
النتيجة: النسخة الاحتياطية سليمة، كل الفحوصات ok، 25 مفتاح ربط على الجداول الجديدة، وعدد الصفوف قبل = بعد.
لم تُجرَّب على نسخة الإنتاج (لا توجد بيانات في السحابة) — جرّبها على `ariba_after2` محلياً قبل Railway (المهمة 10).
