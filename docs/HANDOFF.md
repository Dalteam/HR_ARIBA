# HANDOFF — مشروع أريبا للموارد البشرية (ملخص كامل للمحادثة)

> آخر تحديث: 2026-10-06 · اكتب لي بالعربي، باختصار وبدون إطالة.
> هذا الملف كافٍ لمواصلة العمل في محادثة جديدة.

---

## 1. الهدف
إعادة بناء نظام الموارد البشرية لشركة أريبا بحيث **يطابق 100%** النسخة القديمة (ملفات HTML المفصولة حتى التحديث V130) في الشاشات والحقول والنصوص والمعادلات، لكن على تقنيات حديثة:
- **موقع للموارد البشرية** (متصفح).
- **تطبيق جوال للموظف** (iPhone + Android).
- **خادم واحد + قاعدة بيانات** يخدم الاثنين.

**قاعدة المستخدم الصريحة:** المنطق والمعادلات تُنقل **كمنطق نظيف بنفس النتائج**، مو نسخ ولصق للواجهات أو الكود القديم. المرجع الوحيد هو النسخة المفصولة الجديدة، وليس النسخة الأقدم.

---

## 2. التقنيات
| الجزء | التقنية | المكان | النشر |
|---|---|---|---|
| الخادم | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · Argon2 · JWT | `backend/` | Railway |
| قاعدة البيانات | PostgreSQL (SQLite محلياً) | Railway | — |
| موقع HR | Next.js 16 (App Router) · React 19 · TypeScript | `frontend/hr-web/` | Railway |
| تطبيق الموظف | React Native · Expo SDK 57 · expo-router · TypeScript | `frontend/employee-app/` | لم يُنشر (المتاجر لاحقاً) |
| المرجع القديم | HTML/CSS/JS مفصول (231 ملف) | `frontend/legacy/` | مرجع فقط — لا يُعدّل |
| التوثيق | Markdown | `docs/` | — |

---

## 3. الروابط والوصول
- **GitHub:** `Faisal-Alrashed1/HR_ARIBA` (خاص)، الفرع `main`. أي push على `main` يُنشر تلقائياً على Railway.
- **النسخة القديمة من المستودع قبل التصفير:** العلامة `archive/before-reset` (وفرع `feat/foundation`).
- **Railway:** مشروع `sparkling-learning` (ID `12c5dc37-b739-441d-954c-08412b958fe4`, environment production `64f9e490-e396-49a8-b4e6-979d386d8709`).
  - موقع HR: https://frontend-production-f9a8a.up.railway.app (Root Directory: `frontend/hr-web`)
  - الخادم: https://hrariba-production.up.railway.app (Root Directory: `backend`، يشغّل `alembic upgrade head` قبل كل نشر)
  - خدمة الخادم في Railway اسمها `HR_ARIBA`، وخدمة الموقع `frontend`، وفيه `Postgres`.
- **حساب المدير على الموقع المنشور:** اسم المستخدم `admin` (أُنشئ عبر `railway ssh -- python -m app.services.seeds create-user --username admin --name-ar "مدير النظام" --role admin --print`). كلمة المرور مؤقتة وتُغيَّر أول دخول — **لا تُكتب في أي ملف**.
- **نسخة محلية:** `/Users/fyslalrashd/Desktop/HR/HR_ARIBA` (مربوطة بـ Railway عبر `railway link`).
- **الملفات الأصلية (لا تُلمس):** `/Users/fyslalrashd/Desktop/HR/‪1_HR_برنامج_الموارد_البشرية_V114 1.html` و `‪2_EMPLOYEE_تطبيق_الموظف_V114 2.html` — md5 `27a11e07fa9bddf3c2ea268f50e71cf0` و `a3aa514f2330813c1e7efba3978b2fd9`.
- **النسخة المفصولة الأصلية على الجهاز:** `/Users/fyslalrashd/Desktop/HR/ariba-portals/`.

---

## 4. هيكل المستودع
```
HR_ARIBA/
├── backend/
│   ├── app/{core,routers,services,models.py,schemas.py,main.py}
│   ├── alembic/versions/0001…0008
│   └── tests/
├── frontend/
│   ├── hr-web/        (src/app/(hr)/(portal)/*, src/components, src/lib, src/lib/calc, src/styles/hr|employee)
│   ├── employee-app/  (app/(tabs), app/login.tsx, app/change-password.tsx, src/lib/api.ts, src/lib/auth.tsx, src/theme.ts)
│   └── legacy/{hr-portal,employee-portal}/{index.html,css/,js/}
└── docs/
    ├── ARIBA_HR_System_Documentation.md  ← المواصفات (القسم 4 = كل المعادلات بأمثلة رقمية، القسم 9 = 35 سؤال مفتوح)
    ├── ROADMAP.md, ARCHITECTURE.md, BUSINESS_RULES.md, DATABASE.md, DEPLOY_RAILWAY.md, SECURITY.md
    └── HANDOFF.md (هذا الملف)
```

---

## 5. تسلسل ما تم (كل المحادثة)

### 5.1 فصل ملفات HTML القديمة (مكتمل)
- كل ملف HTML قُسّم إلى `index.html` + `css/` + `js/` (HR: 27 CSS + 141 JS، الموظف: 14 CSS + 47 JS)، والمعادلات في `js/calculations/`.
- التحقق: إعادة التركيب = الملف الأصلي حرف بحرف؛ تشغيل Playwright مقارنة 13 صفحة (شكل + متغيرات + معادلات) = متطابق.
- التوثيق الكامل: `docs/ARIBA_HR_System_Documentation.md`.

### 5.2 المستودع والنشر
- صُفّر المستودع (بعد حفظ `archive/before-reset`)، ثم أُعيد الخادم والموقع من الأرشيف وبُني تطبيق Expo، ونُقلت الملفات المفصولة إلى `frontend/legacy`.
- تقسيم CSS الموقع إلى ملفات بنفس أسماء ملفات الفصل (`src/styles/hr/*`, `src/styles/employee/*`).
- اكتُشف أن الموقع الأول بُني من نسخة HTML أقدم → صار المرجع الوحيد هو النسخة الجديدة.

### 5.3 الخادم (Backend) — الموجود الآن
- **الدخول والأمان:** Argon2، JWT مع تجديد، تغيير كلمة المرور الإجباري، حد محاولات، سجل عمليات، 6 أدوار: `employee, manager, finance, hr, ceo, admin`.
- **الموظفين:** إضافة/تعديل/إنهاء/إرجاع، مستندات، صورة، مرافقين، معاينة الراتب.
- **التأمينات:** `services/gosi.py` + إعفاء V130 `exempt_kind` (تمهير/استشاري/متدرب + غير WPS).
- **نهاية الخدمة:** `services/end_of_service.py` (سنوات = الأيام ÷ 365.25 مقربة، م.77 مقربة لريال).
- **نهاية العقد:** `services/contracts.py` `fixed_term_end` = إضافة الشهور − يوم (مثل `addMonthsSafe`). + `apply_auto_terminations` (انتهاء/إرجاع تلقائي للعقود المحددة، يُستدعى في قائمة الموظفين ولوحة التحكم وبيانات الرواتب).
- **محرك الإجازات:** `services/leave.py` (`LeaveBook`) — منطق نظيف **مطابق 100%** للكود القديم (اختبار `tests/test_leave_engine.py` بأرقام مستخرجة من تشغيل JS القديم). يقرأ من `leave_year_overrides` و `leave_adjustments` و `employees.leave_eos_excess` والطلبات المعتمدة والعطلات. + `used_through` لعمود «ما تم استحقاقه».
- **سير الاعتماد:** `services/workflow.py` (المراحل من `workflow_rules`: إجازات/عن بعد/سلفة → مدير ← HR ← رئيس تنفيذي؛ استئذان/إضافي/مهمة → مدير ← HR؛ نسيان بصمة → HR فقط). موافقة، اعتماد نيابة، اعتماد نهائي، رفض بسبب، حذف (يرجّع الرصيد).
- **Routers (كلها تحت `/api/v1`):** `auth, me, dashboard, employees, dependents, documents, salary, settings, sheets (+payroll-archive), locations (+assignments, work-locations), attendance (+range, summary), leave (holidays, requests, balances, used-through), registry (documents), letters (+me/letters)`.
- **الاختبارات:** آخر تشغيل كامل = 74 ناجحة (بعدها طلب المستخدم إيقاف الاختبارات لتوفير الوقت).

### 5.4 قاعدة البيانات (ملفات Alembic)
| الملف | المحتوى |
|---|---|
| 0001 | الجداول الأساسية (المشروع السابق) |
| 0002 | البيانات المرجعية (جهات العمل، الأقسام، الجنسيات، العطلات، نسب التأمينات، مراحل الاعتماد) |
| 0003 | بدل الإضافي للموظف |
| 0004 | كلمات المرور المشفرة `credentials` |
| 0005 | `sheets` (تخزين مرن بمفتاح: الشعار `company_logo`، التوقيع والختم `hr_signer`) |
| 0006 | `sent_letters` (النماذج المرسلة للموظف) |
| 0007 | **تنظيف السكيما:** الحضور يسمح بأكثر من جلسة يومياً؛ `payroll_runs`/`payroll_rows` جداول مربوطة (صف المسير الكامل في `data` JSON + المجاميع أعمدة)؛ `leave_year_overrides` + `leave_adjustments` جديدة؛ `employees.leave_eos_excess`؛ حذف `settlements, settlement_items, template_letters, leave_year_ledgers` القديمة؛ CASCADE لخطوات الطلب؛ CHECK على نوع وحالة `sent_letters`. **باتجاه واحد (downgrade غير مدعوم).** |
| 0008 | `employee_locations` (مواقع بصمة لكل موظف — V121) |
- 40+ علاقة Foreign Key حقيقية. الموظف هو المحور.
- المسير: الموقع ما زال يستخدم `GET/PUT /sheets/pay_YYYY_MM` لكن الخادم يحفظها فعلياً في `payroll_runs/rows`.

### 5.5 الموقع (hr-web) — كل الصفحات مبنية
لوحة التحكم، الموظفين، الحضور (+ تقارير V117 + تقرير شهري)، مواقع البصمة (+ الموظفين المربوطين V121)، الإجازات (6 تبويبات + مرفق اختياري + محرر الرصيد سنة بسنة)، المسير V119 (+ «ما تم استحقاقه» تلقائي + «بدون خصم» + أرشيف المسيرات المعتمدة)، كشف الراتب، نهاية الخدمة، المخالصة (+ طباعة مخالصة رسمية بالتفقيط)، الوثائق، التقارير (9)، الإعدادات (9 بطاقات + إظهار التوقيع/الختم)، النماذج (9 نماذج + إرسال جماعي + نسخ إنجليزية + لغة خطاب الراتب + حالة المرسَل).
- مكتبات الحساب: `src/lib/calc/` (`payx.ts` محرك المسير، `settlement.ts`, `settlement-doc.ts`, `eos.ts`, `tafqeet.ts`, `forms.ts`, `forms-en.ts`, `payroll.ts`).
- `listAllEmployees` يجيب كل الصفحات (الخادم يحد 100 لكل صفحة).

### 5.6 المطابقة مع النسخة القديمة
- مقارنة تلقائية: تشغيل النسخة القديمة وسحب 380 عنصر (أزرار/تبويبات/عناوين/حقول) ومقارنتها بالموقع → **97%**. الباقي صياغات بسيطة.
- **المعادلات مطابقة بالأرقام:** المسير (AV 89,168.24 · AK 47,203.65 · AC 28,816.67)، المخالصة (م.84 140,224 · م.85 116,618.44 · م.77 193,132 · م.80 69,407.33)، الإجازات (رصيد 25.81)، التفقيط (12,345.67 / 2,000)، نهاية العقد (2025-03-10+24 = 2027-03-09).

### 5.7 تطبيق الجوال — الأساس فقط
موجود: الدخول، تغيير كلمة المرور، الرئيسية، الراتب، ملفي، الخروج؛ ألوان التطبيق القديم وخط ARIBA Two؛ RTL. مربوط حالياً بـ `localhost` (`EXPO_PUBLIC_API_URL`). معرّف التطبيق مؤقت `sa.ariba.employee`. ما انجرب على جوال حقيقي.

---

## 6. ديون تقنية معروفة (لم تُحل — بقرار المستخدم بدء التطبيق أولاً)
1. **`frontend/hr-web/src/lib/calc/payx.ts` منسوخ حرفياً** من ملف JS القديم (`// @ts-nocheck`). المطلوب لاحقاً: إعادة كتابته كمنطق نظيف بنفس النتائج.
2. `settlement.ts` منقول سطر بسطر من `sRun`.
3. حسابات المسير والمخالصة ونهاية الخدمة وتقارير الحضور تتم في **المتصفح**؛ الأصح نقلها للخادم.
4. ملف التعديل 0007 بدون downgrade (اختبار upgrade/downgrade سيفشل).
5. أُضيفت ميزات بعد آخر تشغيل للاختبارات (طلب المستخدم: لا اختبارات الآن).
6. كشف الراتب يعرض `otherDeduct || loanDeduct` (سلوك قديم مقصود).
7. الأسئلة الـ 35 في القسم 9 من التوثيق ما زالت بلا رد من موظف الموارد البشرية.

---

## 7. الخطوة التالية: تطبيق الجوال
**كيف يرتبط:** التطبيق لا يكلّم الموقع؛ الاثنان يكلّمان نفس الخادم وقاعدة البيانات، فكل شيء يظهر فوراً في الطرف الآخر.

**الجاهز في الخادم للتطبيق:** `/auth/*`, `/me`, `/me/employee`, `/me/letters` (+ `/me/letters/{id}/respond`), `/letters/{id}/html`.

**الناقص في الخادم (لازم يُبنى):**
- بصمة الجوال: `POST /me/attendance/punch` (GPS، أقرب موقع، النطاق — الحفظ يفرض 1000م لغير «عن بعد» حسب V38، مواقع الموظف V121 أو مواقع جهة عمله، الساعات المرنة والانصراف المتوقع، التأخير والخروج المبكر)، وسجلي `GET /me/attendance`.
- طلباتي: `POST /me/requests` (إجازة بأنواعها، استئذان، سلفة، إضافي، نسيان بصمة → يذهب لـ HR مباشرة) + `GET /me/requests` + رصيدي `GET /me/leave`.
- فريقي وموافقات المدير: `GET /me/team`, `GET /me/approvals`, `POST /me/approvals/{id}`.
- كشوف رواتبي من المسيرات المعتمدة: `GET /me/payslips`.
- الإشعارات.

**تم (2026-10-06):**
- ✅ 1. التطبيق مربوط افتراضياً بالخادم المنشور (`src/lib/api.ts`، و`.env.example`).
- ✅ 2. البصمة بالـ GPS: `services/geofence.py` (Haversine) + `services/punch.py` + `GET /me/attendance` و `POST /me/attendance/punch {action in|out, lat, lng}`. الأخطاء: `outside_geofence` (مع أقرب موقع ومسافته)، `too_early_for_flexible_window`، `too_late_for_flexible_window`، `remote_limit_reached`، `already_checked_in`، `not_checked_in`. التأخير من أول جلسة فقط؛ الساعة المرنة: لا تأخير والانصراف المتوقع = أول دخول + الساعات. شاشة الحضور في التطبيق (ساعة الرياض، حالة الموقع، رجوع للعمل، جلسات اليوم، سجل 31 يوم). + إصلاح: أوقات الحضور تُعرض بتوقيت الرياض (`attendance.local`) بدل UTC من Postgres.
- ✅ 3+4. الطلبات والرصيد والفريق والموافقات: `routers/me_requests.py` — `GET/POST /me/requests`, `DELETE /me/requests/{id}` (غير المعتمد فقط)، `GET /me/leave`, `GET /me/team`, `GET /me/approvals`, `POST /me/approvals/{id} {action approve|reject, reason}` (المدير المباشر لمرحلة المدير، hr/admin لمرحلة HR، ceo/admin لمرحلة الرئيس التنفيذي). اعتماد «نسيان بصمة» يسجّل الحضور تلقائياً (`punch.record_forgot_punch`). شاشات الإجازات وفريقي في التطبيق. المرفقات في طلبات التطبيق لم تُبنَ بعد، والتواريخ تُكتب نصاً (YYYY-MM-DD).
- ✅ 5. النماذج: تبويب «مستندات» + شاشة `app/letter/[id].tsx` (عرض HTML عبر `react-native-webview` + موافقة/اعتراض بسبب ≥ 3 أحرف). كشوف الراتب: `GET /me/payslips` (المسيرات المعتمدة فقط، حقول قسيمة V119) في تبويب الراتب.
- ✅ 6. الإشعارات: `GET /me/notifications` (نماذج بانتظار الرد، قرارات طلباتي آخر 60 يوم، طلبات بانتظار موافقتي) + جرس بعدّاد في رأس كل تبويب + شاشة `app/notifications.tsx`؛ «مقروء» يُحفظ على الجهاز. إشعارات الدفع (Push) لم تُبنَ: تحتاج حساب Expo/EAS و build خاص (Expo Go لا يدعمها على Android).
- ⏳ 7. التجربة على الجوال: لم تتم (لا يوجد Xcode/محاكي على الجهاز). التحقق المنجز: `tsc` + `expo export` + اختبارات API مؤقتة.
- ملاحظة: منطق `ariba_attendance` القديم كان في Supabase وغير موجود في الملفات؛ بُني من وصف التوثيق (3.2.4، 4.11، 4.12).

**خطة التطبيق بالترتيب:**
1. ربطه بالخادم المنشور (`EXPO_PUBLIC_API_URL=https://hrariba-production.up.railway.app`).
2. البصمة بالـ GPS (الأهم).
3. الإجازات والطلبات والرصيد.
4. فريقي والموافقات.
5. النماذج (موافقة/اعتراض بسبب ≥ 3 أحرف) وكشوف الراتب.
6. الإشعارات.
7. التجربة على جوال المستخدم عبر Expo Go، ثم المتاجر (يحتاج Apple Developer + Google Play).

**المرجع للتطبيق:** `frontend/legacy/employee-portal/` + القسم 3 و 6 من التوثيق.

---

## 8. أوامر مفيدة
```bash
# الخادم محلياً
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
# الموقع محلياً
cd frontend/hr-web && npm run dev
# التطبيق
cd frontend/employee-app && npx expo start
# فحص الموقع
cd frontend/hr-web && npx tsc --noEmit && npm run lint
# حالة النشر
railway status --json -p 12c5dc37-b739-441d-954c-08412b958fe4 -e 64f9e490-e396-49a8-b4e6-979d386d8709
# إذا فشل git push بـ HTTP 400
git config http.postBuffer 524288000
```

## 9. قواعد العمل مع المستخدم
- الرد بالعربي، مختصر، وبدون استهلاك توكن زائد؛ قل «خلصت» عند الانتهاء.
- لا تعدّل `frontend/legacy` أو الملفات الأصلية. لا تغيّر إعدادات Railway/Supabase/Netlify. لا تفحص قاعدة Supabase القديمة.
- لا تكتب كلمات مرور حقيقية في أي مكان، ولا تنشئ حسابات على الموقع المنشور بنفسك (المستخدم يشغّل الأمر).
- commits صغيرة على `main` مع السطر: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
