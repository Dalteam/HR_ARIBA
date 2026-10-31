# Database Migration for Porting the React System (Task 5) — ترحيل قاعدة البيانات لنقل نظام React (المهمة 5)

> English first, then the full Arabic version (same content).

---

# English

## Database Migration for Porting the React System (Task 5)

| File | What it does |
|---|---|
| `001_react_port.sql` | The new tables and columns on the normalized schema (without any change to the data): candidates, their files and application links, goals and evaluations, delegation and manager permissions, document signing, leave attachments, mail accounts (password encrypted) and the send log, tasks and meetings, WebAuthn and Push, request-workflow columns (on behalf, escalation, return), notification email, the payroll path (prepare/approve/reopen), the new request and document types, and the default settings (`workflow_config`, `doc_sign_cfg`, `apply_invite_*`). A single transaction, and every item is `IF NOT EXISTS`, so running it a second time changes nothing. |
| `verify_001.sql` | Verifies every new table, column and key; any FAIL line stops the script. |
| `002_notif_email_pool.sql` | The client's migrations 39, 40 and 41 on our schema: the `app_links` setting (`{"hr": …, "emp": …}`) that the notification e-mails link to, the `ariba_notif_files` table (the PDF a letter/template was sent with, attached to the notification e-mail, `ON DELETE CASCADE`), `ariba_hr_pool()` (HR accounts ∪ employee 40 ∪ the HR approvers) with the two bell RPCs reading it, and `ariba_hr_send_template(…, p_pdf_base64, p_pdf_name)` — one 10-argument function so an 8-argument call stays unambiguous. The bell RPCs read `read_at` (normalization dropped `is_read`) and the pool no longer reads `workflow_requests.hr_id` (dropped as well). Its last step writes the e-mail cut-off `notify_email_since` (the moment the file ran, plus how many notifications that silences), so the sender never mails the notifications restored from Supabase. One transaction, every object idempotent. |
| `verify_002.sql` | Verifies the table, its key and index, the pool and its members, both bell RPCs, the 10-argument template function, the `app_links` setting, the e-mail state columns and the cut-off stamp (it exists, parses, and is newer than every notification that came with the migrated data). |
| `run_on_railway.sh` | A full backup with verification of it → confirm the database is normalized → run every `0NN_*.sql` in order → verify → compare row counts before/after. It picks up `002` and `verify_002.sql` with no change: both are globbed by number. |

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
| `002_notif_email_pool.sql` | ترحيلات العميل 39 و40 و41 على سكيمتنا: إعداد `app_links` (`{"hr": …, "emp": …}`) الذي تُبنى عليه روابط إيميلات الإشعارات، وجدول `ariba_notif_files` (ملف PDF الذي أُرسل مع الخطاب/النموذج، مرفق بإيميل الإشعار، `ON DELETE CASCADE`)، ودالة `ariba_hr_pool()` (حسابات الموارد البشرية ∪ الموظف 40 ∪ معتمدي الموارد البشرية) مع استخدام دالتي الجرس لها، ودالة `ariba_hr_send_template(…, p_pdf_base64, p_pdf_name)` — دالة واحدة بعشرة معاملات حتى يبقى نداء الثمانية معاملات واضحاً. دالتا الجرس تقرآن `read_at` (الترتيب حذف `is_read`) والبركة لا تقرأ `workflow_requests.hr_id` (محذوف أيضاً). معاملة واحدة وكل عنصر قابل للتكرار. |
| `verify_002.sql` | يتحقق من الجدول ومفتاحه وفهرسه، والبركة وأعضائها، ودالتي الجرس، ودالة النموذج بعشرة معاملات، وإعداد `app_links`، وأعمدة حالة الإيميل. |
| `run_on_railway.sh` | نسخة احتياطية كاملة مع التحقق منها ← التأكد أن القاعدة مرتّبة ← تشغيل كل `0NN_*.sql` بالترتيب ← التحقق ← مقارنة عدد الصفوف قبل/بعد. يلتقط `002` و`verify_002.sql` بدون تعديل لأنهما يُقرآن بالرقم. |

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
