# دليل مشروع أريبا للموارد البشرية — من البذرة إلى آخر تعديل

> آخر تحديث: 2026-10-11، آخر commit منشور: `2dea04d`.
> هذا الملف هو **المرجع الأول** لأي محادثة جديدة. اقرأه كامل قبل أي تعديل، وبعدها `docs/HANDOFF.md` و `docs/INTEGRATION_AUDIT.md` عند الحاجة.

---

## 0. قواعد العمل مع صاحب المشروع
- **اللغة:** الرد بالعربي، مختصر ومباشر.
- **المرجع:** المرجع الوحيد للشكل والمعادلات هو ملفات HTML المفصولة في `frontend/legacy` (النسخة V114 مع تحديثات حتى V130). أي قاعدة في `docs/BUSINESS_RULES.md` تخالف الـ HTML: نتبع الـ HTML وننبّه.
- **قاعدة البيانات:** هي قاعدة زميلنا (Supabase الأصلية، «canonical»). **لا** Alembic ولا إنشاء جداول عليها، و**لا** commit لأي ملف SQL فيه بيانات حقيقية.
- **النشر:** ما ننشر إلا لما يقول صاحب المشروع «انشر». التعديلات تتجمع محلياً وتنفحص أول.
- **كلمات المرور:** ما ندخل كلمة مرور حقيقية على موقع منشور. الفحص يكون محلياً بحسابات تجربة.

---

## 1. فكرة المشروع (البذرة)
شركة **أريبا للاستشارات** كانت تشغّل نظام موارد بشرية عبارة عن **ملف HTML ضخم واحد** فيه كل شي، وتطور عبر تحديثات مرقّمة (V1 → V130). البيانات كانت في **Supabase** اللي بناه الزميل **محمد عوض**: جداول، ودوال SQL، وحسابات.

**الهدف:** إعادة بناء النظام بتقنيات حديثة، **بنفس الشاشات والحقول والنصوص والمعادلات بالضبط**، على ثلاثة أجزاء:
1. **موقع الموارد البشرية** (متصفح): لموظفي HR والمدراء والمالية.
2. **تطبيق جوال للموظف** (iPhone و Android): البصمة والطلبات والراتب.
3. **خادم واحد + قاعدة بيانات** يخدم الاثنين.

**المبدأ:** ننقل **المنطق** نظيف وبنفس النتائج، ما ننسخ الكود القديم.

---

## 2. الخط الزمني (من أول commit لآخر تعديل)

### المرحلة 1 — 4 أكتوبر: الأساس
| commit | وش صار |
|---|---|
| `de89234` | أساس الخادم: الجداول، الدخول، الأدوار والصلاحيات، الأمان، API الموظفين |
| `2918f77` | نسبة السعودة |
| `a772d67` | أساس الموقع وصفحة الموظفين والوثائق |
| `2720be8` | التأمينات (GOSI)، مكافأة نهاية الخدمة، لوحة التحكم، التنبيهات، المستندات، الصورة، المرافقين |
| `9981fbd` | مطابقة تصميم V114 |
| `ac9eb15` | النشر على Railway بتسجيل دخول خاص فينا وتخزين على قرص، بدون Supabase |

### المرحلة 2 — 5 أكتوبر: إعادة البناء من الـ HTML الجديد
- `34fab47` و `7c2a099`: **تصفير الريبو** وتقسيمه: `backend` + `frontend/hr-web` (Next.js) + `frontend/employee-app` (React Native)، والـ HTML المفصول صار مرجع في `frontend/legacy`.
- بعدها نُقلت كل صفحة من الـ HTML بنفس النتائج:
  - التأمينات مع إعفاء V130.
  - نهاية الخدمة والمخالصة.
  - المسير (محرك PAYX V119).
  - القسيمة والمواقع والحضور.
  - محرك أرصدة الإجازات (منقول سطر بسطر ومطابق لناتج الـ JS القديم).
  - الإجازات والوثائق والتقارير التسعة والإعدادات.
  - النماذج التسعة بالترويسة وإرسالها للموظف.

### المرحلة 3 — 6 أكتوبر: تنظيف وإضافات وأول نسخة من التطبيق
- **الموقع:**
  - تنظيف السكيما (migration 0007).
  - تقارير الحضور V117.
  - مستند المخالصة مع كتابة المبلغ بالحروف.
  - أرشيف الرواتب، وإرسال النماذج لأكثر من موظف، والنسخ الإنجليزية.
  - مواقع عمل لكل موظف (V121).
  - مرفقات الطلبات، ونهاية العقد والإنهاء التلقائي، وخيار «بدون خصم».
- **التطبيق:** بصمة GPS مع نطاق جغرافي في الخادم، وطلباتي، ونسيان البصمة، والفريق، والموافقات، والنماذج، والقسائم، والإشعارات.

### المرحلة 4 — 8 أكتوبر: الانتقال لقاعدة زميلنا (canonical)
- `d32f890`: تقرير مقارنة جداوله بكودنا (`docs/INTEGRATION_AUDIT.md`).
- `d5cd4e3`: **الخادم صار يشتغل على جداول Supabase الـ 34 كما هي**:
  - ملف routes واحد هو `backend/app/routers/canonical.py`، فيه أوامر SQL مباشرة.
  - الحسابات اللي تأكدنا منها بقت من كودنا.
  - القاعدة نُقلت لخدمة Railway اسمها `Postgres-Q6OM`، والقاعدة القديمة `Postgres` بقت للرجوع.
- `8b46326`: أداة إنشاء حساب دخول بكلمة مرور مؤقتة.
- `6f89af9`: تطبيق الموظف بشكل V118 القديم (الشريط العائم، دائرة البصمة، كل التبويبات).

### المرحلة 5 — 11 أكتوبر: العرض، والهوية، والطلبات
- **بيئة عرض `demo` على Railway:** نسخة من الإنتاج، وكل الرواتب فيها 1000 فعلياً في القاعدة. **ما فيها commit**، هي إعداد في Railway. التفاصيل في القسم 4.
- `673ddb1`: شيل الإيموجي واستبداله بأيقونات Tabler الخطية، وتحويل الألوان الدخيلة لألوان الهوية (من ملف `ARIBA LAYOUT - NEW 4.pptx`).
- `9a345ee`: كل رمز انشال صار له بديل، منها أيقونات SVG في المستندات المطبوعة (`lib/print-icons.ts`). وصور الرجل والمرأة والتمهير صارت من صور أرسلها صاحب المشروع (اشتراك Flaticon).
- `487fbaa`:
  - **منتقي تاريخ ووقت موحد** في الموقع (39 خانة) والتطبيق، مع اختيار سريع للسنة والشهر.
  - **صفحة «الطلبات والإجازات»** تعرض كل الأنواع، والرقم يطابق القائمة.
  - **تنبيه نسيان البصمة** في صفحة الحضور.
- `8ee52fc`: لوحة التحكم: أيقونات فوق البطاقات، ورقم الرواتب أسود، وصورتي الجنس بلون واحد وحجم واحد، وأشرطة للأقسام، وترتيب أيقونة ← رقم ← اسم.
- `fe9c836`: زر «تحديث البيانات» صار يعيد تحميل **أي** صفحة (كان يشتغل على صفحتين بس).

---

## 3. المعمارية
```
 موقع HR (Next.js 16)          تطبيق الموظف (Expo / React Native)
 frontend/hr-web               frontend/employee-app
        │  HTTPS JSON  /api/v1          │
        └──────────────┬────────────────┘
                       ▼
            الخادم FastAPI (Python 3.12)
            backend/app/main.py → routers/canonical.py
                       │  SQL مباشر (SQLAlchemy text)
                       ▼
     PostgreSQL على Railway (جداول Supabase الأصلية، 34 جدول)
```
- **الدخول:** `POST /api/v1/auth/login` يرجّع JWT موقّع من الخادم. الحسابات في `ariba_auth_accounts`، وكلمات المرور bcrypt من النظام القديم، وتتحوّل تلقائياً لـ Argon2.
- **الأدوار:** admin، admin_manager، hr، ceo، finance، manager، employee. الخادم يتحقق من الصلاحية في كل route، والواجهة تعكسها بس.
- **التخزين:** صور الموظفين ومرفقات الطلبات والخطابات **داخل قاعدة البيانات** (جدول `ariba_documents`، عمود `file_data`). قرص Railway (`STORAGE_DIR=/data`) من المرحلة القديمة وما يُستخدم على canonical.

---

## 4. البيئات والروابط (Railway، مشروع `sparkling-learning`)
| البيئة | الموقع | الخادم | القاعدة |
|---|---|---|---|
| **production** (البيانات الحقيقية) | https://frontend-production-f9a8a.up.railway.app | https://hrariba-production.up.railway.app | `Postgres-Q6OM` |
| **demo** (الرواتب 1000) | https://frontend-demo-b5ec.up.railway.app | https://hrariba-demo.up.railway.app | `Postgres-Q6OM` (نسخة demo) |

- **خدمات كل بيئة:** `HR_ARIBA` (الخادم)، و`frontend` (الموقع)، و`Postgres-Q6OM` (القاعدة المستخدمة)، و`Postgres` (القاعدة القديمة للرجوع، وفي demo ما لها استخدام).
- **النشر:** أي push على `main` ينشر **البيئتين مع بعض** تلقائياً، لأنهم يأخذون من نفس الريبو.
- **متغيرات الخادم:** `DATABASE_URL`، `JWT_SECRET`، `CORS_ORIGINS`، `RUN_MIGRATIONS_ON_STARTUP=false`، `STORAGE_DIR=/data`، `ENV=production`.
- **متغير الموقع:** `NEXT_PUBLIC_API_URL`، ويُقرأ وقت البناء.
- **الـ CLI:** مربوط على `production`. لأي أمر على العرض أضف `-e demo`.
- **كيف انبنت بيئة demo:**
  1. `pg_dump` من الإنتاج، بتشغيل صاحب المشروع.
  2. استيراد النسخة في قاعدة محلية `ariba_demo`.
  3. تشغيل سكربت يخلي إجمالي كل موظف 1000 بنفس نسب البدلات، ويعيد حساب التأمينات والصافي، ويعدّل المسيرات والأرشيف، وينظف السجلات.
  4. رفعها لقاعدة demo.
- **صور وملفات demo:** نفس الإنتاج، لأنها داخل القاعدة اللي انتسخت. (حالياً في النسختين: مرفق إجازة واحد وخطاب واحد، وما فيه صور موظفين مرفوعة.)
- **قاعدة بعد العرض:** يا نحذف بيئة demo، أو نحذف منها قاعدة `Postgres` القديمة لتوفير التكلفة.

---

## 5. قاعدة البيانات (canonical)
- **أهم الجداول:**
  - `employee_directory`: `employee_id` والاسم والمدير والحالة، ومفاتيح `employer_id` و`department_id` و`job_title_id` إلى جداول الأسماء. اسم المستخدم من `ariba_auth_accounts` فقط. عمود `data` JSONB يحتفظ بالحقول القديمة والحسابات.
  - `workflow_requests`: **كل طلبات الموظفين**. `status` مولّد من `current_stage` ولا يُكتب مباشرة؛ جهات HR وCEO المعتمدة في `workflow_approvers`.
  - `workflow_actions` يسجل الحساب الفاعل والتعليق، و`workflow_notifications.read_at` يحدد المقروء.
  - `leave_requests` و`permissions`: تفاصيل الطلب، مربوطة إلزامياً بـ `workflow_requests` للإجازة، وبـ `workflow_request_id` للاستئذان.
  - `attendance`: كل صف جلسة؛ أكثر من جلسة في اليوم مسموح، مع جلسة مفتوحة واحدة لكل موظف/يوم. الموقع يُقرأ عبر `location_id`.
  - `employee_payrolls` (المسير، `payload` JSONB لكل موظف وشهر)، و`payroll_archives_v2`. اعتماد الشهر في `payroll_periods`.
  - جداول lookup: `employers` و`departments` و`job_titles` و`roles` وأنواع الطلبات والإجازات والأذونات والمستندات.
  - `ariba_auth_accounts` و `ariba_sessions`: الحسابات والجلسات.
  - `ariba_app_settings`: الإعدادات كـ key/value، منها `ins_settings` للتأمينات والشعار.
  - `work_locations`، `public_holidays`، `ariba_documents`، `ariba_audit_log`، `ariba_deleted_items`.
- **مراحل الموافقة:** `_stages()` في `canonical.py`، مثل القديم (`ariba_workflow_action`) بقرار صاحب المشروع:
  - كل الأنواع: مدير الموظف من `employee_directory.manager_id` ← HR ثم الرئيس التنفيذي حسب `workflow_approvers` (الموظف بدون مدير يبدأ من HR).
  - **نسيان البصمة: HR بس**، والموافقة عليه **تسجّل الحضور** في `attendance`.
  - التحقق من رصيد الإجازة السنوية عند التقديم **باقي** (أشد من القديم)، بقرار صاحب المشروع.
- **قواعد محلية على الجهاز** (Postgres في `/tmp`):
  - `ariba_demo`: نسخة العرض المحلية، فيها حسابات وطلبات تجربة.
  - `ariba_hr_dev` و `ariba_hr_test`: قديمة.
- **نسخ احتياطية خارج الريبو:**
  - `~/Desktop/HR/backups/`: فيها `prod_for_demo.sql`، **بيانات حقيقية، تنحذف بعد الانتهاء**، ونسخة القاعدة القديمة.
  - `~/Downloads/supabase_full.sql`: تصدير زميلتنا الكامل.

---

## 6. المجلدات والملفات

### الجذر
| الملف | الدور |
|---|---|
| `README.md` | تعريف وتشغيل سريع |
| `.gitignore` | يستثني `.env` والقواعد المحلية والـ dumps |
| `.claude/launch.json` | إعداد تشغيل محلي قديم. الإعداد المستخدم فعلياً في `~/Desktop/HR/.claude/launch.json` |
| `.vscode/` | إعدادات المحرر |

### `backend/` — الخادم
| الملف | الدور |
|---|---|
| `app/main.py` | إنشاء التطبيق: CORS، رؤوس الأمان، معالجة الأخطاء. **يربط router اثنين بس:** `health` و `canonical` |
| `app/config.py` | قراءة المتغيرات والتحقق منها (في الإنتاج: يشترط JWT قوي و Postgres) |
| `app/database.py` | المحرك والجلسة، ويحوّل `postgresql://` إلى `postgresql+psycopg://` |
| **`app/routers/canonical.py`** | **قلب الخادم (2165 سطر، 99 route).** كل الـ API: الدخول، والموظفين، والمواقع، والإعدادات، ولوحة التحكم، والحضور والبصمة، وطلبات الموظف (`/me/requests`)، وطلبات HR (`/requests`) وموافقاتها، والإشعارات، والنماذج، والمستندات والصور، والمسير (`/sheets`)، والأرشيف، والأرصدة، والعطل |
| `app/routers/health.py` | `/health` لـ Railway |
| `app/routers/*.py` الباقي | **أرشيف** من مرحلة قاعدتنا القديمة. غير مربوط بـ `main.py` |
| `app/services/canonical_data.py` | يقرأ جداول canonical بالشكل اللي تبيه الحسابات |
| `app/services/employee_map.py` | ترجمة بالاتجاهين بين `employee_directory.data` وحقول الموقع، و`figures()` تحسب الإجمالي والتأمينات والصافي |
| `app/services/gosi.py` | التأمينات من قواعد بتواريخ سريان (مع إعفاء V130) |
| `app/services/leave.py` | محرك أرصدة الإجازات (منقول سطر بسطر من V114) |
| `app/services/end_of_service.py`، `contracts.py`، `scheduling.py`(core) | حسابات نهاية الخدمة، والعقود، والتقويم (الرياض، الأحد–الخميس). منطق البصمة الحالي في `routers/canonical.py`؛ `geofence.py` و`punch.py` و`attendance.py` من طبقة ORM القديمة وغير مربوطة بـ `main.py`. |
| `app/services/*` الباقي | أغلبها كانت لمرحلة قاعدتنا القديمة |
| `app/core/` | الأخطاء الموحدة (`errors.py`)، ورؤوس الأمان وحد محاولات الدخول (`security.py`)، والوقت (`scheduling.py`). `identity.py` و `auth.py` للقديم |
| `app/models.py` | جداول canonical بالـ reflection (98 سطر) |
| `app/schemas.py`، `app/enums.py` | أشكال الطلبات والأنواع |
| `alembic/` + `migrations.py` | **أرشيف**: migrations 0001–0008 لقاعدتنا القديمة. **ممنوع تشغيلها** على canonical |
| `tools/create_account.py` | إنشاء حساب دخول بكلمة مرور مؤقتة. الاستخدام: `railway ssh -s HR_ARIBA -- python tools/create_account.py --username X --role employee --employee-id N` |
| `tools/load_canonical.py` | تحميل تصدير Supabase في قاعدة فاضية |
| `tests_canonical/` | اختبارات عقد canonical (الجداول، والتشفير، وإخفاء الراتب والهوية) + **`test_legacy_parity.py`** (مطابقة النظام القديم، القسم 9). `pytest.ini` يشغّلها هي بس |
| `tests/` | **≈70 اختبار معطّلة**: `conftest.py` يستورد `Credential` من `models.py` القديم اللي انحذف وقت الانتقال لـ canonical. فيها اختبارات حسابات قيّمة (التأمينات، ونهاية الخدمة، ومحرك الإجازات، وأيام العمل) تحتاج إنقاذ |
| `railway.json` | أمر التشغيل `uvicorn` و healthcheck `/health` |
| `requirements.txt` | المكتبات |

### `frontend/hr-web/` — موقع HR (Next.js 16، React 19)
> انتبه: `AGENTS.md` يقول إن Next.js هذا فيه تغييرات عن المعتاد، والمرجع `node_modules/next/dist/docs/`. مثلاً `proxy.ts` بدل `middleware.ts`.

**الصفحات `src/app/(hr)/(portal)/`:**
| الصفحة | المحتوى |
|---|---|
| `dashboard` | البطاقات (الحاليون، السعودة، الرواتب، الجنس، الأقسام، المعلقة/المنتهية/التمهير) والرسوم والتنبيهات |
| `employees` (+ `[id]`، `new`) | القائمة والتبويبات وملف الموظف |
| `attendance` | الحضور اليومي، والتسجيل اليدوي، والملخص الشهري، والتقارير، و**تنبيه نسيان البصمة** |
| `locations` | مواقع البصمة |
| **`leaves`** | **«الطلبات والإجازات»** (1032 سطر): بانتظار إجراء · كل الطلبات · طلب جديد · الأرصدة · العطل · عمل إضافي. تقبل رابط `?tab=lv1&type=forgot_punch` |
| `payroll` | المسير (محرك PAYX في `lib/calc/payroll.ts`)، حفظ واعتماد، وExcel، وطباعة |
| `payslips` | القسيمة الرسمية |
| `end-of-service`، `settlement` | نهاية الخدمة والمخالصة ومستندها |
| `documents` | الإقامات، والجوازات، والتأمين، والعقود |
| `reports` | التقارير التسعة |
| `settings` | الشركة، والحضور، والتأمينات، والأقسام، والحسابات، والموقّع |
| `templates` | النماذج وإرسالها للموظف |

**باقي المجلد:**
- `src/app/(hr)/login`: دخول HR.
- `src/app/(employee)/me/...`: نسخة ويب قديمة لبوابة الموظف. **التطبيق الفعلي هو `employee-app`**.
- **`src/components/`:**
  - `hr/hr-shell.tsx`: الإطار، والقائمة، والشريط العلوي، وزر «تحديث البيانات» اللي يعيد تحميل الصفحة عبر `key={tick}`.
  - `hr/employee-form.tsx` و `employee-details.tsx` و `dependents-tab.tsx` و `terminate-modal.tsx`.
  - `hr/charts.tsx` (Chart.js)، و`hr/attendance-reports.tsx`، و`hr/linked-employees.tsx`.
  - `hr/forgot-punch-notice.tsx`: تنبيه صفحة الحضور.
  - `hr/gender-icons.tsx`: صور الجنس كـ CSS mask.
  - **`common/date-time-field.tsx`**: منتقي التاريخ والوقت الموحد (`DateField`، `TimeField`).
  - `common/toast.tsx`: الرسائل مع أيقونة. `common/password-dialog.tsx`.
- **`src/lib/`:**
  - `api.ts`: العميل والأنواع. `leave.ts`، `employees.ts`، `attendance.ts`، `settings.ts`، `sheets.ts`، `salary.ts`، `locations.ts`، `registry.ts`: استدعاءات كل وحدة.
  - **`calc/`**: معادلات منقولة من الـ HTML (`payroll.ts`، `payx.ts`، `eos.ts`، `settlement.ts`، `settlement-doc.ts`، `forms.ts`، `forms-en.ts`، `tafqeet.ts`).
  - `i18n/ar.ts` و `en.ts`: النصوص.
  - `theme.tsx`: الوضع الليلي والنهاري عبر `html[data-ariba-theme]`.
  - `refresh.tsx` و `use-api.ts`: التحديث وجلب البيانات.
  - `print.ts` و `print-icons.ts`: الطباعة.
  - `session.ts` و `auth.ts` و `auth-context.tsx`: الجلسة.
- `src/proxy.ts`: توجيه حسب الدور (مرآة فقط).
- **`src/styles/`:** ملفات CSS منقولة من الـ HTML بالترتيب (`hr/00…24`). تعديلاتنا في **`hr/14-ariba-cohesive-brand-v42.css`**، وفي آخره: صور الجنس، والمنتقي `.ariba-dt*`، ولوحة التحكم.
- **`public/`:** `brand/` (الشعار والترويسة)، و`fonts/` (خط ARIBA Two)، و`icons/` (male / female / tamheer).

### `frontend/employee-app/` — تطبيق الموظف (Expo 57، React Native 0.86، expo-router)
**التبويبات `app/(tabs)/`:**
| الملف | المحتوى |
|---|---|
| `_layout.tsx` | الإطار، والشريط العائم، والجرس |
| `index.tsx` | الرئيسية: دائرة البصمة، والأرصدة، والأزرار السريعة |
| `attendance.tsx` | الحضور والبحث بفترة |
| `leaves.tsx` | طلباتي + طلب جديد |
| `overtime.tsx` | عمل إضافي |
| `salary.tsx` | الراتب والقسائم |
| `team.tsx` | فريقي |
| `approvals.tsx` | الموافقات |
| `documents.tsx` | المستندات |
| `profile.tsx` | ملفي |

**باقي المجلد:**
- `app/login.tsx`، و`change-password.tsx`، و`letter/[id].tsx`.
- **`src/components/`:**
  - `ui.tsx`: المكوّنات الأساسية، ومنها `PickerField` و `CardTitle` و `Btn` اللي تقبل اسم أيقونة، والرسائل.
  - **`date-time.tsx`**: التقويم وأزرار الوقت.
  - `icons.tsx`: أيقونات SVG خطية بأسلوب Tabler.
  - `shared.tsx`: نافذة نسيان البصمة، وبطاقة جهة العمل.
  - `request-item.tsx`، و`password-sheet.tsx`.
- **`src/lib/`:**
  - `api.ts`: عنوان الخادم من `EXPO_PUBLIC_API_URL`، والافتراضي الإنتاج.
  - `data.tsx`، `punch.tsx`، `geo.ts`، `notifications.tsx`، `labels.ts`، `store.ts`، `auth.tsx`.
- `src/theme.tsx`: ألوان الهوية للوضعين.
- `app.json`: يفرض الاتجاه من اليمين لليسار (`forcesRTL`).
- **`.env`** (غير مرفوع): **حالياً يأشّر على خادم العرض**. احذفه عشان يرجع للإنتاج.

### `frontend/legacy/` — المرجع
`hr-portal/` و `employee-portal/`: ملفات الـ HTML و CSS و JS المفصولة (V114 → V130). نرجع لها لأي شاشة أو معادلة.

### `docs/`
| الملف | المحتوى |
|---|---|
| `PROJECT_GUIDE.md` | **هذا الملف** |
| `HANDOFF.md` | ملخص 6 و 8 أكتوبر |
| `INTEGRATION_AUDIT.md` | مقارنة canonical بكودنا |
| `ARIBA_HR_System_Documentation.md` | توثيق النظام القديم |
| `BUSINESS_RULES.md` | القواعد |
| `DATABASE.md` | قاعدتنا القديمة |
| `ARCHITECTURE.md`، `SECURITY.md`، `DEPLOY_RAILWAY.md`، `USAGE.md`، `ROADMAP.md`، `PROJECT_STATUS.md`، `PHASE1_REVIEW.md`، `FEATURE_*.md`، `*.manifest.json` | مراجع قديمة |

---

## 7. أهم المسارات

**البصمة:**
1. التطبيق يرسل `POST /me/attendance/punch` ومعه الإحداثيات.
2. الخادم يتحقق من النطاق الجغرافي والساعات المرنة.
3. يكتب البصمة في جدول `attendance`.

**طلب من التطبيق:**
1. التطبيق يرسل `POST /me/requests`.
2. ينحفظ في `workflow_requests`، والإجازات والاستئذانات تنحفظ كمان في `leave_requests`.
3. ينرسل إشعار لأصحاب المرحلة الأولى.
4. يظهر في الموقع في «الطلبات والإجازات» تحت «بانتظار إجراء» و«كل الطلبات».
5. HR يوافق أو يرفض أو يعتمد نيابة أو يعتمد نهائي (`/requests/{id}/...`).

**نسيان البصمة:** مرحلته HR بس. يظهر كمان في تنبيه صفحة الحضور، والموافقة عليه تكتب صف في `attendance`.

**المسير:**
1. الموقع يحسب المسير بمحرك PAYX في المتصفح.
2. يحفظه عبر `PUT /sheets/pay_YYYY_MM` في `payroll_archives_v2` و`employee_payrolls`.
3. الاعتماد في `payroll_periods`؛ القسائم تظهر للموظف بعد اعتماد الشهر.

**تعديل راتب موظف:** `POST/PATCH /employees` تعيد حساب `salaryTotal` و `insuranceSub/Comp` و `netSalary*` المخزّنة عبر `_store_figures()` بنفس منطق الـ HTML (`sEmp` + `refreshInsuranceDependentViews`). طابقت 102 من 107 موظف قيم الـ HTML الأصلية، والباقي بيانات قديمة. `eosLaborLaw` المخزّن ما زال ما يتحدث.

---

## 8. التشغيل المحلي
- **الخادم على قاعدة العرض المحلية:**
  ```
  cd backend
  DATABASE_URL='postgresql:///ariba_demo?host=/tmp' RUN_MIGRATIONS_ON_STARTUP=false CORS_ORIGINS='http://localhost:3010,http://localhost:8081,http://localhost:8082' ENV=development .venv/bin/uvicorn app.main:app --port 8010
  ```
- **الموقع:** `cd frontend/hr-web && NEXT_PUBLIC_API_URL=http://localhost:8010/api/v1 npx next dev -p 3010`
- **التطبيق على الجوال:** `cd frontend/employee-app && npx expo start --tunnel --clear` ثم Expo Go وامسح الـ QR. أي شخص يقدر يمسحه ما دام الجهاز شغّال.
- **التطبيق في المتصفح للتجربة:** `EXPO_PUBLIC_API_URL=http://localhost:8010 npx expo start --web --port 8082`
- **حسابات التجربة المحلية:** `ui.check` (admin) و `ui.emp` (موظف 10) موجودة في `ariba_demo` المحلية بس. كلمات مرورها ما تنكتب في الملفات.
- **الفحوصات:**
  - الموقع: `npx tsc --noEmit` و `npx eslint src --quiet`
  - التطبيق: `npx tsc --noEmit`
  - الخادم: `.venv/bin/python -m pytest -q` (ومع `LEGACY_PARITY_PG` للمطابقة الكاملة)
  - المطابقة مع الـ HTML: `cd tools/legacy-parity && npm test`

---

## 9. الاختبارات (الوضع الحالي)
- **الخادم:** `tests_canonical`.
  - `test_canonical_contract.py`: عقد canonical.
  - **`test_legacy_parity.py`: مطابقة النظام القديم.**
    - بقيم مرجعية من الـ HTML نفسه (`fixtures/legacy_*.json`): نهاية العقد (`addMonthsSafe`)، وإعفاء التأمينات (`kindOf`)، وإرجاع الموظف نشط.
    - **بدوال SQL القديمة نفسها** على قاعدة مؤقتة تنبني وتنحذف تلقائياً (من `tools/legacy-parity/sql`: سكيما ودوال، بدون بيانات) وبيانات تجريبية: المضلّع، وموقع البصمة وقاعدة «عن بعد»، والتأخير والخروج المبكر، ورصيد التطبيق (`ariba_leave_calc`)، وإشعارات الطلب الجديد (`ariba_submit_request`).
    - التشغيل الكامل: `LEGACY_PARITY_PG='postgresql:///postgres?host=/tmp' .venv/bin/python -m pytest -q`. بدون المتغير تتجاوز اختبارات القاعدة.
- **الموقع مقابل الـ HTML:** `tools/legacy-parity` (Node): يشغّل بوابة HR القديمة في jsdom ويقارن معادلات `src/lib/calc` على مدخلات عشوائية: PAYX (20,000)، والمخالصة (3,000)، ونهاية الخدمة (840)، والتفقيط، وإعفاء التأمينات.
  - `cd tools/legacy-parity && npm ci && npm test`.
  - `npm run fixtures` يحدّث القيم المرجعية لاختبارات الخادم.
- **معطّلة:** `tests/`، تقريباً 70 اختبار (السبب في القسم 6).
- **الواجهات:** ما فيه اختبارات واجهة، والتحقق يدوي في المتصفح.
- **الخطة المقترحة (ما بدأت):**
  1. إنقاذ اختبارات الحسابات.
  2. اختبارات لمسار الطلبات على canonical.
  3. حذف القديم اللي ما له معنى.
  4. اختبارات للواجهات لاحقاً.

---

## 10. ملاحظات مفتوحة / ديون معروفة
- **حذف بيئة demo** بعد العروض، أو حذف قاعدة `Postgres` منها.
- **حذف** `~/Desktop/HR/backups/prod_for_demo.sql`، فيه رواتب حقيقية.
- **حذف** `frontend/employee-app/.env` عشان يرجع التطبيق للإنتاج.
- **`eosLaborLaw` المخزّن** ما يتحدث عند تعديل الراتب. التأمينات والصافي صاروا يتحدثون.
- **غير مدعوم على canonical:** المرافقين (`dependents` يرجع 501)، وإضافة وحذف الأقسام وجهات العمل.
- **زر «تحديث البيانات»** يمسح التعديلات غير المحفوظة في الصفحة، مثل تعديلات المسير. ممكن نضيف تأكيد.
- **ملفات كثيرة في `backend/app/routers` و `services` و `alembic` و `tests` أرشيف** من المرحلة القديمة. تنظيفها مؤجل.
- **تطبيق الموظف ما انجرّب على جوال حقيقي بكل تفاصيله.** ولا فيه بناء دائم (TestFlight / APK) بعد.
