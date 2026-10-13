# توثيق نظام أريبا للموارد البشرية (الإصدار V114 كما هو في الملفين الأصليين)

> هذا المستند يصف النظام **كما هو مكتوب في الكود حرفياً**. لم يُعدَّل أي منطق أو معادلة. أي نقطة غامضة موثّقة كما هي ومعلَّمة بـ **(يحتاج توضيح من موظف الموارد البشرية)**، والأسئلة كلها مجمّعة في القسم 9.
>
> - الملفان المرجعيان (لم يُعدَّلا، وتم التحقق ببصمة MD5 قبل العمل وبعده):
>   - `‪1_HR_برنامج_الموارد_البشرية_V114 1.html` (15,009 سطر) — MD5 `27a11e07fa9bddf3c2ea268f50e71cf0`
>   - `‪2_EMPLOYEE_تطبيق_الموظف_V114 2.html` (4,464 سطر) — MD5 `a3aa514f2330813c1e7efba3978b2fd9`
> - النسخة المفصولة: `ariba-portals/hr-portal` و `ariba-portals/employee-portal`.
> - كل أرقام الأسطر في هذا المستند تشير إلى الملف الأصلي.
> - لم يتم فحص قاعدة البيانات (بناءً على طلبكم). القسم 5 يصف فقط ما **يطلبه الكود** من قاعدة البيانات (أسماء الدوال والحقول) كما يظهر في الملفات.
> - لم يتم تسجيل الدخول إلى الموقع المنشور: كتابة كلمة المرور في موقع حقيقي غير مسموح لي، ورابط Netlify غير موجود داخل الكود. لذلك وُصفت الواجهة من الكود، ثم شُغِّلت النسختان محلياً ببيانات اختبارية وقورنت شاشاتهما (القسم 8).

---

## 1. نظرة عامة

### 1.1 البنية
النظام مكوّن من تطبيقين ويب منفصلين يشتركان في نفس الخادم السحابي:

| | بوابة الموارد البشرية | بوابة الموظف |
|---|---|---|
| الملف الأصلي | `1_HR_...V114.html` | `2_EMPLOYEE_...V114.html` |
| الحجم | 15,009 سطر (≈1.9MB، منها ≈700KB صور وخطوط Base64) | 4,464 سطر (≈390KB) |
| الاتجاه | RTL عربي افتراضياً + إنجليزي كامل | RTL عربي افتراضياً + إنجليزي كامل |
| الشكل | لوحة تحكم بشريط جانبي (220px) يمين | تطبيق جوال (PWA) بشريط تنقل سفلي |
| الجلسة | `sessionStorage['ariba_hr_session_v3']` | `localStorage['ariba_employee_session_v2']` |

**طريقة بناء الكود (مهم جداً لفهم أي تعديل مستقبلي):** كل ملف مكوّن من «سكربت رئيسي» قديم، ثم عشرات «الباتشات» (Patches) أُضيفت بالتتابع (V18 … V130). كل باتش **يغلّف** دوال سابقة (`var old=window.fn; window.fn=function(){...old...}`) أو **يستبدلها**، أو يضيف عناصر للواجهة بـ `setInterval`. لذلك:
- **ترتيب تحميل السكربتات يحدد السلوك النهائي**؛ آخر تعريف للدالة هو الفعّال.
- في هذا المستند، عند ذكر معادلة أذكر **الإصدار النهائي الفعّال** وأذكر الإصدارات الأقدم إن كانت ما زالت مستخدمة في شاشة أخرى.

### 1.2 التقنيات والمكتبات
| المكتبة | المصدر | الاستخدام |
|---|---|---|
| supabase-js@2 | `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` | محمَّلة في البوابتين، لكن **الاتصال الفعلي يتم بـ `fetch`/`XMLHttpRequest` مباشرة** إلى `/rest/v1/rpc/...`. في بوابة الموارد البشرية المتغير `supa` غير معرّف (فكل كود `supa.from(...)` لا يعمل)، وفي بوابة الموظف `supa` كائن وهمي (stub) يرجع نتائج فارغة. |
| Chart.js 4.4.0 | jsdelivr | الرسوم البيانية في لوحة التحكم (HR فقط) |
| Tabler Icons webfont | 3.19.0 في HR، و`@latest` في بوابة الموظف | الأيقونات (`<i class="ti ti-...">`) |
| خط ARIBA Two | ملفات `./fonts/ARIBA_TWO_LIGHT/MEDIUM/BOLD.ttf` (**غير موجودة في المجلد**، يُفترض أنها على Netlify) + نسخة Base64 مدمجة داخل سكربت النماذج للطباعة | كل الواجهة |
| Google Maps (iframe) | `google.com/maps?...&output=embed` | معاينة مواقع البصمة |
| بدون مكتبات أخرى | — | تصدير Excel الحقيقي (xlsx) مكتوب يدوياً (ZIP + XML)، وقراءة docx/xlsx للمعاينة يدوياً |

### 1.3 الربط مع Supabase
- المشروع: `https://iwviydmapqpqihcdazpe.supabase.co`، المفتاح العام (publishable): `sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB`.
- **نمط الأمان:** كل العمليات الحساسة تمر عبر دوال RPC تستقبل `p_token` (رمز الجلسة UUID الصادر من `ariba_login`)، والخادم يتحقق من الصلاحية. التطبيق يعتبر الجلسة «سحابية حقيقية» فقط إذا كان الرمز بصيغة UUID.
- الرابط والمفتاح **مكرّران حرفياً في نحو 40 موضعاً** داخل الباتشات. في النسخة المفصولة جُمع التعريف الرئيسي (`const SUPA_URL`, `const SUPA_KEY` من السكربت الرئيسي، الأسطر 3111–3113) في `js/config/supabase-config.js`، أما بقية التكرارات فتُركت في أماكنها لأن توحيدها يتطلب تعديل الكود (وهذا ممنوع). في بوابة الموظف ملف `js/config/002-supabase-stub-and-sb-fetch.js` يحوي الكائن الوهمي `supa` ودوال `sbFetch/sbInsert/...` القديمة.

### 1.4 النشر على Netlify
- كل بوابة تُنشر كموقع ثابت (Static). لا يوجد في الكود أي إعداد لـ Netlify ولا رابط الموقع المنشور.
- ملفات يشير إليها الكود وليست ضمن الملفين (يجب أن تكون بجانب `index.html` على الخادم): `fonts/ARIBA_TWO_*.ttf` (البوابتان)، `manifest.webmanifest` و`icons/icon-192.png` و`sw.js` (بوابة الموظف؛ والكود نفسه يذكر في تعليق أن `sw.js` غير موجود وأن خطأ تسجيله مكتوم عمداً).
- تعليق داخل الكود (السطر 626) يوصي بإعدادات خادم: `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, و`Content-Security-Policy` مقيّد.
- **لنشر النسخة المفصولة:** ارفع محتوى `hr-portal/` كموقع، و`employee-portal/` كموقع آخر، مع نفس الملفات الإضافية أعلاه. لا يحتاج أي خطوة بناء (Build).

### 1.5 التخزين المحلي (مهم: النظام يعتمد عليه كثيراً)
بوابة الموارد البشرية تحتفظ بنسخة كاملة من البيانات في `localStorage` (بادئة `hr7_`) وتزامنها مع السحابة. أهم المفاتيح:

| المفتاح | المحتوى |
|---|---|
| `hr7_emps` | **المصدر الوحيد لقائمة الموظفين** (الحاليون + المنتهية خدماتهم بعد V101) |
| `hr7_term_emps` | أرشيف قديم للمنتهية خدماتهم (يُدمج في `hr7_emps`) |
| `hr7_deleted_employee_ids` | معرّفات الموظفين المحذوفين نهائياً (لا يعودون أبداً) |
| `hr7_pay_YYYY_MM`, `hr7_archive_pay_...`, `hr7_approved_archive_pay_...` | مسير كل شهر |
| `ariba_payroll_archive_v3`, `ariba_approved_payroll_history_v54`, `ariba_payroll_archive_v58` | أرشيفات المسيرات المعتمدة |
| `_ar_<base64(hr7_leaves)>` وغيرها | المفاتيح «الحساسة» (`emps, att, payroll, leaves, perms, documents, workflow`) تُحفظ مشفّرة بـ XOR بمفتاح `ARIBA2030HRARIBA2030HR` ثم Base64 (دالة `_enc/_dec`) — تشفير تمويهي وليس أمنياً |
| `hr7_settings` | إعدادات الشركة (الاسم، وقت الدوام، هامش التأخير، حد العمل عن بعد) |
| `hr7_insuranceRules` | فترات نسب التأمينات |
| `hr7_hols`, `hr7_locs` | الإجازات الرسمية ومواقع البصمة |
| `hr7_leave_balance_adjustments` | سجل تعديلات الأرصدة اليدوية |
| `hr7_master_lists` | قوائم الأقسام وجهات العمل |
| `deps_manual_<id>` (مشفّر) | التابعون (محلي فقط) |
| `hr7_lang` + `ariba_ui_lang` | اللغة (مشتركة بين البوابتين) |
| `ariba_ui_theme` (HR) / `ariba_employee_theme` (الموظف) | الوضع الليلي/النهاري |
| `hr7_cloud_sync_queue_v100` | طابور الموظفين المعدَّلين المنتظر إرسالهم للسحابة |
| `ariba_hr_signer_v1`, `ariba_company_logo_v1`, `ariba_sc_seq_YYYYMMDD` | الموقّع، الشعار، تسلسل أرقام الصادر |
| `ARIBA_HR_LOCAL_ATTACHMENTS_V1` (IndexedDB) | مرفقات طلبات الإجازة التي يسجلها HR محلياً |

---

## 2. خريطة الملفات الجديدة

### 2.1 مبدأ الفصل المتّبع
1. **لم يُغيَّر حرف واحد من الكود.** كل وسم `<style>` نُقل محتواه حرفياً إلى ملف CSS، واستُبدل الوسم بـ `<link rel="stylesheet" ... href="css/NN-...css">` **في نفس مكانه** وبنفس خصائصه (مثل `id`). وكل `<script>` داخلي نُقل محتواه إلى ملف JS، واستُبدل بـ `<script ... src="js/...">` **في نفس مكانه** وبنفس خصائصه.
2. **ترتيب التحميل محفوظ 100%** لأن كل وسم بقي في موضعه داخل `index.html`. أسماء الملفات تبدأ برقم ترتيب التحميل (`001`, `002`…) حتى داخل المجلدات المختلفة.
3. **ملفات JavaScript عادية (ليست Modules)** لأن الكود يعتمد على دوال عامة تُستدعى من `onclick`.
4. **السكربت الرئيسي** في كل بوابة (HR: الأسطر 1022–3266، الموظف: 380–1150) قُسِّم إلى ملفات حسب الأقسام الموجودة فعلاً فيه (`// ATTENDANCE`, `// LEAVES`, …)، والمعادلات وُضعت في `js/calculations/`. التقسيم تم **عند حدود الدوال فقط** وبنفس الترتيب، وتم التحقق آلياً من عدم وجود أي استدعاء في ملف لدالة لم تُعرَّف بعد (القسم 8).
5. **الباتشات** (كل `<script id="ariba-vNN-...">`) بقي كل منها ملفاً مستقلاً كما هو، وصُنِّف في مجلد حسب وظيفته. لم يُجمع باتشان في ملف واحد ولم يُقسَّم باتش، لأن كل باتش دالة مغلقة (IIFE) تعتمد على ترتيبها.
6. الصور والخطوط المدمجة (Base64) بقيت داخل الكود في مكانها (نقلها يتطلب تغيير الكود). شعار الشريط الجانبي (Base64 داخل وسم `<img>` في السطر 648) بقي داخل `index.html`.
7. `index.html` بقي فيه هيكل الصفحة (HTML) فقط، بالإضافة إلى روابط الملفات.

### 2.2 المجلدات
```
ariba-portals/
  hr-portal/
    index.html                 ← هيكل الصفحة + 168 رابط ملف بنفس الترتيب
    css/      (27 ملف)          ← كل وسوم <style> بالترتيب 01..27
    js/
      config/supabase-config.js ← SUPA_URL / SUPA_KEY (من السكربت الرئيسي)
      main/       (19 ملف)      ← السكربت الرئيسي مقسّم حسب أقسامه
      calculations/ (8 ملفات)   ← المعادلات من السكربت الرئيسي
      core-ui/ employees-data/ attendance/ leaves/ payroll/ settlement-eos/
      requests/ forms/ reports/ locations/ auth-permissions/ assistant/ misc/
                                ← الباتشات، كل باتش ملف
  employee-portal/
    index.html
    css/      (13 ملف)
    js/
      config/002-supabase-stub-and-sb-fetch.js
      main/ (12 ملف) + core-ui/ requests/ leaves/ attendance/ payroll/ forms/ locations/ employees-data/ auth-permissions/
  docs/
    ARIBA_HR_System_Documentation.md   ← هذا المستند
    hr-portal.manifest.json / employee-portal.manifest.json  ← خريطة آلية: كل ملف ↔ أسطره في الأصل
```

### 2.3 ملفات المعادلات (HR — من السكربت الرئيسي)
| الملف | الأسطر الأصلية | المحتوى |
|---|---|---|
| `js/calculations/01-eos-basic-calcEOS.js` | 1088 | `calcEOS` (مكافأة نهاية الخدمة الأساسية — م.84) |
| `js/calculations/02-workdays-holidays.js` | 1315–1347 | `holidayDatesForYear`, `isOfficialHoliday`, `countLeaveWorkdays`, `countAnnualLeaveDays` |
| `js/calculations/03-leave-balance-engine.js` | 1777–1902 | محرك أرصدة الإجازات كاملاً (الاستحقاق، الترحيل 10 أيام، فائض نهاية الخدمة…) |
| `js/calculations/04-eos-page-by-law.js` | 2157–2191 | `rEOS` (صفحة نهاية الخدمة حسب المادة) + `exportEOS` |
| `js/calculations/05-gosi-social-insurance.js` | 2428–2471 | محرك التأمينات الاجتماعية (`gosiRates`, `calcIns`, …) |
| `js/calculations/06-payroll-module.js` | 2472–3083 | مسير الرواتب (النسخة 2: البناء، إعادة الحساب، الاعتماد، الطباعة، Excel) |
| `js/calculations/07-settlement-calculator.js` | 3084–3096 | حاسبة المخالصة `sRun` |
| `js/calculations/08-leave-rollover.js` | 3097–3110 | `rolloverLeaves` (الترحيل السنوي) |

**معادلات موجودة داخل باتشات (بقيت في ملف الباتش نفسه):**
| الملف | المحتوى |
|---|---|
| `js/payroll/107-ariba-v119-payroll.js` | **محرك المسير النهائي `PAYX.compute`** (نفس معادلات Excel «مسير رواتب سبتمبر 2026»): الإضافي، الإجازة، نهاية الخدمة، التأمينات، الصافي |
| `js/payroll/023-ariba-v53-final-request-fixes-js.js` | أيام التأمينات `recalcPayrollRowWithInsuranceDays` (نسخة أقدم يغطيها V119) |
| `js/payroll/114-ariba-v130-insurance-exempt.js` | قاعدة الإعفاء من التأمينات (استشاري/تمهير/تدريب) |
| `js/settlement-eos/056-...v68...js` | التفقيط `aribaTafqeet` + مستند المخالصة الرسمي |
| `js/attendance/102-ariba-v117-att-reports.js` | تقارير الحضور (الغياب، التأخير، نسبة الحضور) |
| `js/leaves/084-ariba-v93-live-leave-ledger-auto-year.js` | ربط الرصيد الحي بكل موظف |
| `js/employees-data/081-...v89...js` | الإنهاء التلقائي لانتهاء العقد/التدريب + الأيام المتبقية للوثائق + سنوات الخدمة |
| `js/payroll/103-ariba-v117-attachments-bulk-salary.js` | خطاب تعريف الراتب (الإجمالي ورقم الحساب من IBAN) |
| بوابة الموظف `js/leaves/023-ariba-emp-v94-live-leave-balance.js` | نسخة حساب الرصيد في تطبيق الموظف (تغطيها V112 بقيمة الخادم) |

### 2.4 الجداول التفصيلية لكل ملف
الجداول التالية مولّدة آلياً من عملية الفصل (لكل ملف: أسطره في الأصل والمعرّف `id` للوسم الأصلي). الوصف الوظيفي لكل باتش موجود في القسم 3 مرتباً بنفس الأسماء.

### بوابة الموارد البشرية (hr-portal)

| # | الملف الجديد | النوع | الأسطر في الملف الأصلي | المعرّف الأصلي (id) | الحجم |
|---|---|---|---|---|---|
| 1 | `css/01-ariba-preboot-css.css` | CSS | 4–4 | ariba-preboot-css | 0.2 KB |
| 2 | `js/core-ui/001-ariba-preboot-js.js` | JS | 4–46 | ariba-preboot-js | 4.5 KB |
| 3 | `css/02-ariba-fonts.css` | CSS | 51–58 | ariba-fonts | 0.6 KB |
| 4 | `css/03-ariba-photo-css.css` | CSS | 58–62 | ariba-photo-css | 0.4 KB |
| 5 | `css/04-styles.css` | CSS | 67–203 | — | 13.7 KB |
| 6 | `css/05-ariba-fix.css` | CSS | 205–214 | ariba-fix | 0.3 KB |
| 7 | `css/06-map-fix.css` | CSS | 215–215 | map-fix | 0.0 KB |
| 8 | `css/07-ariba-employee-app-link.css` | CSS | 217–217 | ariba-employee-app-link | 0.3 KB |
| 9 | `js/leaves/002-ariba-leave-performance-v18.js` | JS | 219–225 | ariba-leave-performance-v18 | 0.3 KB |
| 10 | `css/08-ariba-auth-sidebar-final-v30.css` | CSS | 226–247 | ariba-auth-sidebar-final-v30 | 0.7 KB |
| 11 | `js/core-ui/003-ariba-auth-sidebar-final-v30.js` | JS | 248–272 | ariba-auth-sidebar-final-v30 | 0.9 KB |
| 12 | `js/requests/004-ariba-v21-documents-overtime.js` | JS | 273–469 | ariba-v21-documents-overtime | 14.6 KB |
| 13 | `js/core-ui/005-ariba-v21-language-extra.js` | JS | 470–481 | ariba-v21-language-extra | 1.6 KB |
| 14 | `css/09-ariba-auth-sidebar-lock-v21.css` | CSS | 482–497 | ariba-auth-sidebar-lock-v21 | 0.4 KB |
| 15 | `css/10-ariba-leave-editor-v31.css` | CSS | 498–498 | ariba-leave-editor-v31 | 0.1 KB |
| 16 | `js/core-ui/006-theme-preset.js` | JS | 498–498 | — | 0.2 KB |
| 17 | `css/11-ariba-brand-theme.css` | CSS | 498–525 | ariba-brand-theme | 1.7 KB |
| 18 | `css/12-ariba-light-login.css` | CSS | 526–531 | ariba-light-login | 0.5 KB |
| 19 | `js/core-ui/007-ariba-theme-system.js` | JS | 532–546 | ariba-theme-system | 1.3 KB |
| 20 | `css/13-ariba-brand-final-v41.css` | CSS | 547–556 | ariba-brand-final-v41 | 1.0 KB |
| 21 | `js/core-ui/008-ariba-security-final-cleanup-v41.js` | JS | 556–556 | ariba-security-final-cleanup-v41 | 0.0 KB |
| 22 | `css/14-ariba-cohesive-brand-v42.css` | CSS | 558–614 | ariba-cohesive-brand-v42 | 2.8 KB |
| 23 | `js/core-ui/009-ariba-secure-cache-v42.js` | JS | 616–616 | ariba-secure-cache-v42 | 0.0 KB |
| 24 | `css/15-dash-layout-fix.css` | CSS | 618–623 | dash-layout-fix | 0.2 KB |
| 25 | `js/core-ui/010-ariba-security-cache-cleanup-v41.js` | JS | 625–625 | ariba-security-cache-cleanup-v41 | 0.0 KB |
| 26 | `js/main/01-core-helpers-storage.js` | JS | 1022–1087 | (main) | 6.0 KB |
| 27 | `js/calculations/01-eos-basic-calcEOS.js` | JS | 1088–1088 | (main) | 0.2 KB |
| 28 | `js/main/02-i18n-language.js` | JS | 1089–1130 | (main) | 6.8 KB |
| 29 | `js/main/03-data-employees-leaves-locations-holidays.js` | JS | 1131–1314 | (main) | 10.2 KB |
| 30 | `js/calculations/02-workdays-holidays.js` | JS | 1315–1347 | (main) | 1.4 KB |
| 31 | `js/main/04-charts-navigation.js` | JS | 1348–1385 | (main) | 8.7 KB |
| 32 | `js/main/05-dashboard.js` | JS | 1386–1585 | (main) | 12.5 KB |
| 33 | `js/main/06-employees.js` | JS | 1586–1675 | (main) | 26.5 KB |
| 34 | `js/main/07-attendance.js` | JS | 1676–1703 | (main) | 6.5 KB |
| 35 | `js/main/08-leaves-ui-pending-all.js` | JS | 1704–1776 | (main) | 9.2 KB |
| 36 | `js/calculations/03-leave-balance-engine.js` | JS | 1777–1902 | (main) | 10.2 KB |
| 37 | `js/main/09-leaves-ui-balances-holidays-requests.js` | JS | 1903–2106 | (main) | 21.2 KB |
| 38 | `js/main/10-payroll-legacy-table.js` | JS | 2107–2139 | (main) | 4.8 KB |
| 39 | `js/main/11-salary-slip.js` | JS | 2140–2156 | (main) | 5.0 KB |
| 40 | `js/calculations/04-eos-page-by-law.js` | JS | 2157–2191 | (main) | 6.6 KB |
| 41 | `js/main/12-leaves-print.js` | JS | 2192–2232 | (main) | 2.5 KB |
| 42 | `js/main/13-documents.js` | JS | 2233–2234 | (main) | 3.4 KB |
| 43 | `js/main/14-locations.js` | JS | 2235–2250 | (main) | 5.3 KB |
| 44 | `js/main/15-reports.js` | JS | 2251–2319 | (main) | 10.5 KB |
| 45 | `js/main/16-settings.js` | JS | 2320–2322 | (main) | 0.9 KB |
| 46 | `js/main/17-extra-pages-managers-undo.js` | JS | 2323–2427 | (main) | 6.7 KB |
| 47 | `js/calculations/05-gosi-social-insurance.js` | JS | 2428–2471 | (main) | 7.3 KB |
| 48 | `js/calculations/06-payroll-module.js` | JS | 2472–3083 | (main) | 34.4 KB |
| 49 | `js/calculations/07-settlement-calculator.js` | JS | 3084–3096 | (main) | 10.9 KB |
| 50 | `js/calculations/08-leave-rollover.js` | JS | 3097–3110 | (main) | 0.8 KB |
| 51 | `js/config/supabase-config.js` | JS | 3111–3113 | (main) | 0.1 KB |
| 52 | `js/main/18-supabase-sync.js` | JS | 3114–3207 | (main) | 4.1 KB |
| 53 | `js/main/19-init-realtime.js` | JS | 3208–3266 | (main) | 3.1 KB |
| 54 | `js/assistant/012-ariba-ai-layer.js` | JS | 3289–3310 | ariba-ai-layer | 6.2 KB |
| 55 | `js/core-ui/013-ariba-final-safety.js` | JS | 3312–3330 | ariba-final-safety | 0.9 KB |
| 56 | `js/requests/014-ariba-secure-workflow-patch.js` | JS | 3331–3408 | ariba-secure-workflow-patch | 10.7 KB |
| 57 | `js/employees-data/015-ariba-final-cloud-sync.js` | JS | 3412–3561 | ariba-final-cloud-sync | 7.7 KB |
| 58 | `js/locations/016-ariba-v38-data-location-sync-fix.js` | JS | 3563–3704 | ariba-v38-data-location-sync-fix | 8.4 KB |
| 59 | `css/16-ariba-v50-excel-palette.css` | CSS | 3706–3724 | ariba-v50-excel-palette | 2.8 KB |
| 60 | `js/core-ui/017-ariba-v50-currency-display.js` | JS | 3727–3745 | ariba-v50-currency-display | 0.9 KB |
| 61 | `js/core-ui/018-ariba-final-salary-display-fix.js` | JS | 3748–3774 | ariba-final-salary-display-fix | 1.3 KB |
| 62 | `css/17-ariba-v52-payslip-polish.css` | CSS | 3776–3827 | ariba-v52-payslip-polish | 2.6 KB |
| 63 | `js/core-ui/019-ariba-v52-language-guard.js` | JS | 3830–3840 | ariba-v52-language-guard | 0.3 KB |
| 64 | `js/core-ui/020-ariba-shared-language-key.js` | JS | 3843–3845 | ariba-shared-language-key | 0.2 KB |
| 65 | `js/requests/021-ariba-v53-hr-workflow-payroll-locations.js` | JS | 3848–3983 | ariba-v53-hr-workflow-payroll-locations | 11.5 KB |
| 66 | `js/employees-data/022-ariba-legacy-data-load.js` | JS | 3985–4017 | ariba-legacy-data-load | 1.7 KB |
| 67 | `css/18-ariba-v53-final-request-fixes.css` | CSS | 4019–4026 | ariba-v53-final-request-fixes | 0.3 KB |
| 68 | `js/payroll/023-ariba-v53-final-request-fixes-js.js` | JS | 4027–4347 | ariba-v53-final-request-fixes-js | 17.4 KB |
| 69 | `js/payroll/024-ariba-v53-print-v2.js` | JS | 4349–4401 | ariba-v53-print-v2 | 5.2 KB |
| 70 | `css/19-ariba-theme-label-v3.css` | CSS | 4403–4407 | ariba-theme-label-v3 | 0.1 KB |
| 71 | `js/core-ui/025-ariba-chart-palette-v3.js` | JS | 4409–4466 | ariba-chart-palette-v3 | 1.9 KB |
| 72 | `js/payroll/026-ariba-payroll-persistence-v3.js` | JS | 4468–4525 | ariba-payroll-persistence-v3 | 1.8 KB |
| 73 | `css/20-ariba-v54-final.css` | CSS | 4527–4530 | ariba-v54-final | 0.1 KB |
| 74 | `js/payroll/027-ariba-v54-final-persistence.js` | JS | 4532–4685 | ariba-v54-final-persistence | 7.3 KB |
| 75 | `css/21-ariba-company-chart-fixed-colors.css` | CSS | 4687–4690 | ariba-company-chart-fixed-colors | 0.1 KB |
| 76 | `js/core-ui/028-ariba-company-chart-fixed-colors-js.js` | JS | 4691–4753 | ariba-company-chart-fixed-colors-js | 2.4 KB |
| 77 | `css/22-ariba-v58-final-ui.css` | CSS | 4755–4761 | ariba-v58-final-ui | 0.5 KB |
| 78 | `js/payroll/029-ariba-v58-final-fixes.js` | JS | 4762–4912 | ariba-v58-final-fixes | 8.9 KB |
| 79 | `js/employees-data/030-ariba-terminated-load-v9.js` | JS | 4914–5031 | ariba-terminated-load-v9 | 3.9 KB |
| 80 | `js/employees-data/031-ariba-cross-app-sync-v11.js` | JS | 5033–5057 | ariba-cross-app-sync-v11 | 1.0 KB |
| 81 | `css/23-ariba-terminated-v12.css` | CSS | 5059–5061 | ariba-terminated-v12 | 0.1 KB |
| 82 | `js/employees-data/032-ariba-terminated-data-v12.js` | JS | 5062–5143 | ariba-terminated-data-v12 | 2.9 KB |
| 83 | `js/employees-data/033-ariba-excel-master-v16.js` | JS | 5146–5245 | ariba-excel-master-v16 | 4.3 KB |
| 84 | `css/24-ariba-v18-sidebar-fix.css` | CSS | 5252–5256 | ariba-v18-sidebar-fix | 0.3 KB |
| 85 | `js/core-ui/034-ariba-v18-final-runtime.js` | JS | 5257–5335 | ariba-v18-final-runtime | 3.0 KB |
| 86 | `js/locations/035-ariba-requested-location-fix.js` | JS | 5338–5366 | ariba-requested-location-fix | 1.3 KB |
| 87 | `js/employees-data/036-ariba-v36-save-safe.js` | JS | 5385–5416 | ariba-v36-save-safe | 1.0 KB |
| 88 | `css/25-ariba-v41-final-style.css` | CSS | 5430–5433 | ariba-v41-final-style | 0.3 KB |
| 89 | `js/reports/037-ariba-v41-excel-reports.js` | JS | 5434–5498 | ariba-v41-excel-reports | 7.1 KB |
| 90 | `js/core-ui/038-ariba-v41-chart-colors.js` | JS | 5501–5836 | ariba-v41-chart-colors | 15.1 KB |
| 91 | `css/26-ariba-v42-requested-ui.css` | CSS | 5840–5856 | ariba-v42-requested-ui | 1.2 KB |
| 92 | `js/employees-data/039-ariba-v42-requested-fixes.js` | JS | 5857–6023 | ariba-v42-requested-fixes | 17.8 KB |
| 93 | `css/27-ariba-v60-final-fix.css` | CSS | 6025–6029 | ariba-v60-final-fix | 0.3 KB |
| 94 | `js/employees-data/040-ariba-v60-final-fix.js` | JS | 6030–6193 | ariba-v60-final-fix | 29.0 KB |
| 95 | `js/employees-data/041-v43-force-terminate-wassim.js` | JS | 6197–6297 | — | 6.4 KB |
| 96 | `js/reports/042-v44-reports-terminated-eos.js` | JS | 6300–6349 | — | 4.5 KB |
| 97 | `js/auth-permissions/043-ariba-v54-real-cloud-login-fix.js` | JS | 6351–6461 | ariba-v54-real-cloud-login-fix | 5.8 KB |
| 98 | `js/employees-data/044-ariba-v55-terminated-employees-and-dashboard-fix.js` | JS | 6463–6595 | ariba-v55-terminated-employees-and-dashboard-fix | 6.4 KB |
| 99 | `js/reports/045-ariba-v56-reports-docs-and-override-fix.js` | JS | 6597–6655 | ariba-v56-reports-docs-and-override-fix | 3.0 KB |
| 100 | `js/employees-data/046-ariba-v57-disable-legacy-supabase-overwrite.js` | JS | 6657–6682 | ariba-v57-disable-legacy-supabase-overwrite | 1.5 KB |
| 101 | `js/core-ui/047-ariba-v59-sidebar-stub.js` | JS | 6684–6699 | ariba-v59-sidebar-stub | 0.9 KB |
| 102 | `js/core-ui/048-ariba-v60-chart-render-safety.js` | JS | 6701–6739 | ariba-v60-chart-render-safety | 1.8 KB |
| 103 | `js/core-ui/049-ariba-v61-salary-summary-card.js` | JS | 6741–6782 | ariba-v61-salary-summary-card | 2.6 KB |
| 104 | `js/requests/050-ariba-v62-approve-reject-print-refresh-fix.js` | JS | 6784–6956 | ariba-v62-approve-reject-print-refresh-fix | 11.8 KB |
| 105 | `js/attendance/051-ariba-v63-attendance-auto-sync.js` | JS | 6958–6978 | ariba-v63-attendance-auto-sync | 0.8 KB |
| 106 | `js/employees-data/052-ariba-v64-auto-sync-employee-edits.js` | JS | 6980–7030 | ariba-v64-auto-sync-employee-edits | 2.3 KB |
| 107 | `js/attendance/053-ariba-v65-standalone-attendance-sync.js` | JS | 7032–7078 | ariba-v65-standalone-attendance-sync | 2.6 KB |
| 108 | `js/payroll/054-ariba-v66-payslip-month-year-selectors.js` | JS | 7080–7126 | ariba-v66-payslip-month-year-selectors | 2.1 KB |
| 109 | `js/payroll/055-ariba-v67-payslip-years-and-all-requests-fix.js` | JS | 7128–7263 | ariba-v67-payslip-years-and-all-requests-fix | 7.0 KB |
| 110 | `js/settlement-eos/056-ariba-v68-official-settlement-document.js` | JS | 7265–7525 | ariba-v68-official-settlement-document | 16.5 KB |
| 111 | `js/settlement-eos/057-ariba-v69-single-page-settlement-and-official-payslip.js` | JS | 7527–7834 | ariba-v69-single-page-settlement-and-official-payslip | 80.7 KB |
| 112 | `js/forms/058-ariba-v70-templates-tab.js` | JS | 7836–8362 | ariba-v70-templates-tab | 424.5 KB |
| 113 | `js/forms/059-ariba-v71-hr-send-to-employee.js` | JS | 8364–8590 | ariba-v71-hr-send-to-employee | 17.0 KB |
| 114 | `js/requests/060-ariba-v72-realtime-alerts-and-fast-polling.js` | JS | 8591–8713 | ariba-v72-realtime-alerts-and-fast-polling | 6.4 KB |
| 115 | `js/payroll/061-ariba-v72-exclude-from-payroll.js` | JS | 8714–8807 | ariba-v72-exclude-from-payroll | 4.4 KB |
| 116 | `js/employees-data/062-ariba-v73-cloud-sync-delete-terminate.js` | JS | 8808–8843 | ariba-v73-cloud-sync-delete-terminate | 1.1 KB |
| 117 | `js/auth-permissions/063-ariba-v74-fix-logout.js` | JS | 8844–8858 | ariba-v74-fix-logout | 0.6 KB |
| 118 | `js/employees-data/064-ariba-v75-fix-stale-clean-emps-priority.js` | JS | 8859–8885 | ariba-v75-fix-stale-clean-emps-priority | 1.8 KB |
| 119 | `js/employees-data/065-ariba-v76-fix-missing-terminate-button.js` | JS | 8886–8933 | ariba-v76-fix-missing-terminate-button | 2.1 KB |
| 120 | `js/attendance/066-ariba-v77-fix-attendance-id-mismatch.js` | JS | 8934–8981 | ariba-v77-fix-attendance-id-mismatch | 1.9 KB |
| 121 | `js/attendance/067-ariba-v77-sync-attendance-with-refresh-button.js` | JS | 8982–9004 | ariba-v77-sync-attendance-with-refresh-button | 1.3 KB |
| 122 | `js/attendance/068-ariba-v78-fix-attendance-id-mismatch.js` | JS | 9005–9090 | ariba-v78-fix-attendance-id-mismatch | 5.1 KB |
| 123 | `js/attendance/069-ariba-v78b-attendance-status-toast.js` | JS | 9091–9116 | ariba-v78b-attendance-status-toast | 1.5 KB |
| 124 | `js/attendance/070-ariba-v79-reliable-attendance-triggers.js` | JS | 9117–9160 | ariba-v79-reliable-attendance-triggers | 1.8 KB |
| 125 | `js/core-ui/071-ariba-v80-toast-top-center.js` | JS | 9162–9173 | ariba-v80-toast-top-center | 0.6 KB |
| 126 | `js/reports/072-ariba-v81-fix-documents-print.js` | JS | 9174–9304 | ariba-v81-fix-documents-print | 8.7 KB |
| 127 | `js/auth-permissions/073-ariba-v82-finance-role-restriction.js` | JS | 9305–9384 | ariba-v82-finance-role-restriction | 3.4 KB |
| 128 | `js/auth-permissions/074-ariba-v83-permissions-management-ui.js` | JS | 9385–9518 | ariba-v83-permissions-management-ui | 6.7 KB |
| 129 | `js/forms/075-ariba-v84-clean-template-labels.js` | JS | 9519–9554 | ariba-v84-clean-template-labels | 1.6 KB |
| 130 | `js/attendance/076-ariba-v85-sync-attendance-settings.js` | JS | 9555–9617 | ariba-v85-sync-attendance-settings | 2.9 KB |
| 131 | `js/attendance/077-ariba-v86-flexible-hours-ui.js` | JS | 9618–9708 | ariba-v86-flexible-hours-ui | 5.5 KB |
| 132 | `js/employees-data/078-ariba-v87-fix-destructive-auto-overwrite.js` | JS | 9709–9777 | ariba-v87-fix-destructive-auto-overwrite | 3.3 KB |
| 133 | `js/employees-data/079-ariba-v87-disable-legacy-employee-overwrite.js` | JS | 9778–9805 | ariba-v87-disable-legacy-employee-overwrite | 1.5 KB |
| 134 | `js/attendance/080-ariba-v88-attendance-range-report.js` | JS | 9806–10025 | ariba-v88-attendance-range-report | 69.0 KB |
| 135 | `js/employees-data/081-ariba-v89-apply-v42-filtering-to-final-aemps.js` | JS | 10026–10130 | ariba-v89-apply-v42-filtering-to-final-aemps | 4.5 KB |
| 136 | `js/employees-data/082-ariba-v91-fix-v60all-live-dates-and-dob.js` | JS | 10131–10204 | ariba-v91-fix-v60all-live-dates-and-dob | 3.2 KB |
| 137 | `js/employees-data/083-ariba-v92-auto-sync-on-employee-save.js` | JS | 10206–10242 | ariba-v92-auto-sync-on-employee-save | 1.8 KB |
| 138 | `js/leaves/084-ariba-v93-live-leave-ledger-auto-year.js` | JS | 10244–10324 | ariba-v93-live-leave-ledger-auto-year | 3.5 KB |
| 139 | `js/payroll/085-ariba-v105-net-salary-other-allowances.js` | JS | 10327–10356 | ariba-v105-net-salary-other-allowances | 1.5 KB |
| 140 | `js/employees-data/086-ariba-v106-remove-old-duplicates.js` | JS | 10357–10392 | ariba-v106-remove-old-duplicates | 1.9 KB |
| 141 | `js/employees-data/087-ariba-v100-unified-save-and-live-sync.js` | JS | 10393–10661 | ariba-v100-unified-save-and-live-sync | 13.7 KB |
| 142 | `js/employees-data/088-ariba-v101-restore-terminated-renewals-and-safe-save.js` | JS | 10662–10882 | ariba-v101-restore-terminated-renewals-and-safe-save | 12.5 KB |
| 143 | `js/core-ui/089-ariba-v103-version-badge-and-multi-tab-guard.js` | JS | 10883–10919 | ariba-v103-version-badge-and-multi-tab-guard | 2.0 KB |
| 144 | `js/locations/090-ariba-v104-locations-feedback.js` | JS | 10920–10969 | ariba-v104-locations-feedback | 2.9 KB |
| 145 | `js/auth-permissions/091-ariba-v104-force-password-change.js` | JS | 10970–11024 | ariba-v104-force-password-change | 4.5 KB |
| 146 | `js/forms/092-ariba-v110-forms-one-page.js` | JS | 11025–11057 | ariba-v110-forms-one-page | 2.0 KB |
| 147 | `js/assistant/093-ariba-v112-local-assistant.js` | JS | 11058–11437 | ariba-v112-local-assistant | 27.8 KB |
| 148 | `js/leaves/094-ariba-v113-hr-leaves-to-cloud.js` | JS | 11438–11518 | ariba-v113-hr-leaves-to-cloud | 5.2 KB |
| 149 | `js/auth-permissions/095-ariba-v114-password-settings-hr.js` | JS | 11520–11687 | ariba-v114-password-settings-hr | 14.2 KB |
| 150 | `js/attendance/096-ariba-v114-attendance-flex-late-fix.js` | JS | 11689–11764 | ariba-v114-attendance-flex-late-fix | 4.6 KB |
| 151 | `js/requests/097-ariba-v114-forgot-punch-hr.js` | JS | 11766–11837 | ariba-v114-forgot-punch-hr | 4.4 KB |
| 152 | `js/forms/098-ariba-v114-forms-arabic-send-all.js` | JS | 11840–12049 | ariba-v114-forms-arabic-send-all | 18.9 KB |
| 153 | `js/requests/099-ariba-v114-approve-on-behalf-label.js` | JS | 12051–12072 | ariba-v114-approve-on-behalf-label | 1.2 KB |
| 154 | `js/requests/100-ariba-v114-pending-stable.js` | JS | 12074–12127 | ariba-v114-pending-stable | 3.1 KB |
| 155 | `js/misc/101-ariba-v116-hr-fixes.js` | JS | 12129–12292 | ariba-v116-hr-fixes | 11.7 KB |
| 156 | `js/attendance/102-ariba-v117-att-reports.js` | JS | 12294–12678 | ariba-v117-att-reports | 38.8 KB |
| 157 | `js/payroll/103-ariba-v117-attachments-bulk-salary.js` | JS | 12680–13155 | ariba-v117-attachments-bulk-salary | 51.3 KB |
| 158 | `js/core-ui/104-ariba-v117-english-hr.js` | JS | 13157–13316 | ariba-v117-english-hr | 85.7 KB |
| 159 | `js/forms/105-ariba-v117-forms-english.js` | JS | 13318–13456 | ariba-v117-forms-english | 16.1 KB |
| 160 | `js/forms/106-ariba-v120-hr-signer.js` | JS | 13466–13630 | ariba-v120-hr-signer | 122.8 KB |
| 161 | `js/payroll/107-ariba-v119-payroll.js` | JS | 13632–14105 | ariba-v119-payroll | 55.6 KB |
| 162 | `js/core-ui/108-ariba-v125-ai-quiet.js` | JS | 14117–14178 | ariba-v125-ai-quiet | 3.8 KB |
| 163 | `js/requests/109-ariba-v118-bell.js` | JS | 14180–14391 | ariba-v118-bell | 16.1 KB |
| 164 | `js/locations/110-ariba-v121-employers-locations.js` | JS | 14430–14574 | ariba-v121-employers-locations | 14.2 KB |
| 165 | `js/employees-data/111-ariba-v124-delete.js` | JS | 14576–14684 | ariba-v124-delete | 9.7 KB |
| 166 | `js/payroll/112-ariba-v127-insurance-sync.js` | JS | 14686–14760 | ariba-v127-insurance-sync | 4.7 KB |
| 167 | `js/core-ui/113-ariba-v129-company-logo.js` | JS | 14762–14912 | ariba-v129-company-logo | 13.2 KB |
| 168 | `js/payroll/114-ariba-v130-insurance-exempt.js` | JS | 14914–15009 | ariba-v130-insurance-exempt | 7.3 KB |

المكتبات الخارجية (تبقى روابطها كما هي داخل index.html):

- السطر 48: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`
- السطر 65: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js">`

### بوابة الموظف (employee-portal)

| # | الملف الجديد | النوع | الأسطر في الملف الأصلي | المعرّف الأصلي (id) | الحجم |
|---|---|---|---|---|---|
| 1 | `css/01-ariba-preboot-css.css` | CSS | 4–4 | ariba-preboot-css | 0.1 KB |
| 2 | `js/core-ui/001-ariba-preboot-js.js` | JS | 4–42 | ariba-preboot-js | 4.1 KB |
| 3 | `js/config/002-supabase-stub-and-sb-fetch.js` | JS | 45–84 | — | 1.9 KB |
| 4 | `css/02-styles.css` | CSS | 97–178 | — | 5.0 KB |
| 5 | `css/03-ariba-pwa-ui.css` | CSS | 180–182 | ariba-pwa-ui | 0.3 KB |
| 6 | `css/04-ariba-final-employee-ui.css` | CSS | 184–203 | ariba-final-employee-ui | 1.7 KB |
| 7 | `css/05-ariba-fonts.css` | CSS | 204–211 | ariba-fonts | 0.6 KB |
| 8 | `css/06-ariba-employee-final-palette-v10.css` | CSS | 212–219 | ariba-employee-final-palette-v10 | 0.1 KB |
| 9 | `css/07-ariba-employee-final-palette-v11.css` | CSS | 220–227 | ariba-employee-final-palette-v11 | 0.1 KB |
| 10 | `css/08-ariba-employee-theme-v12.css` | CSS | 228–287 | ariba-employee-theme-v12 | 1.9 KB |
| 11 | `css/09-ariba-profile-harmony-v13.css` | CSS | 289–326 | ariba-profile-harmony-v13 | 1.3 KB |
| 12 | `css/10-ariba-employee-theme-label-fix-v20.css` | CSS | 328–331 | ariba-employee-theme-label-fix-v20 | 0.1 KB |
| 13 | `js/main/01-state.js` | JS | 380–387 | (main) | 0.3 KB |
| 14 | `js/main/02-utils.js` | JS | 388–405 | (main) | 1.3 KB |
| 15 | `js/main/03-login-session.js` | JS | 406–577 | (main) | 6.7 KB |
| 16 | `js/main/04-storage-sync-tabs.js` | JS | 578–596 | (main) | 0.7 KB |
| 17 | `js/main/05-home.js` | JS | 597–637 | (main) | 2.1 KB |
| 18 | `js/main/06-leave-types.js` | JS | 638–656 | (main) | 1.0 KB |
| 19 | `js/main/07-leaves.js` | JS | 657–806 | (main) | 7.9 KB |
| 20 | `js/main/08-attendance-gps-forgot.js` | JS | 807–1005 | (main) | 11.5 KB |
| 21 | `js/main/09-pay.js` | JS | 1006–1030 | (main) | 1.5 KB |
| 22 | `js/main/10-team-manager-approvals.js` | JS | 1031–1106 | (main) | 4.8 KB |
| 23 | `js/main/11-profile.js` | JS | 1107–1142 | (main) | 1.6 KB |
| 24 | `js/main/12-storage-sync.js` | JS | 1143–1150 | (main) | 0.4 KB |
| 25 | `js/requests/004-ariba-secure-workflow-patch.js` | JS | 1151–1366 | ariba-secure-workflow-patch | 27.7 KB |
| 26 | `js/core-ui/005-ariba-bilingual-ui.js` | JS | 1368–1425 | ariba-bilingual-ui | 20.7 KB |
| 27 | `js/core-ui/006-ariba-pwa-register.js` | JS | 1427–1436 | ariba-pwa-register | 0.8 KB |
| 28 | `js/core-ui/007-ariba-final-employee-cloud-ui.js` | JS | 1438–1524 | ariba-final-employee-cloud-ui | 8.4 KB |
| 29 | `js/leaves/008-ariba-v20-leave-bilingual.js` | JS | 1528–1602 | ariba-v20-leave-bilingual | 3.3 KB |
| 30 | `js/requests/009-ariba-v21-documents-overtime.js` | JS | 1604–1808 | ariba-v21-documents-overtime | 14.2 KB |
| 31 | `js/core-ui/010-ariba-v21-language-extra.js` | JS | 1810–1821 | ariba-v21-language-extra | 1.4 KB |
| 32 | `js/employees-data/011-ariba-employee-live-sync-v19.js` | JS | 1824–1933 | ariba-employee-live-sync-v19 | 3.8 KB |
| 33 | `css/11-ariba-silent-refresh-v19.css` | CSS | 1934–1937 | ariba-silent-refresh-v19 | 0.1 KB |
| 34 | `js/core-ui/012-ariba-employee-theme-language-v12.js` | JS | 1938–1978 | ariba-employee-theme-language-v12 | 1.7 KB |
| 35 | `js/core-ui/013-ariba-employee-cloud-refresh-v15.js` | JS | 1979–1985 | ariba-employee-cloud-refresh-v15 | 0.2 KB |
| 36 | `js/core-ui/014-ariba-employee-source-of-truth-v19.js` | JS | 1986–1992 | ariba-employee-source-of-truth-v19 | 0.3 KB |
| 37 | `css/12-ariba-employee-v21-theme-language.css` | CSS | 1994–1997 | ariba-employee-v21-theme-language | 0.4 KB |
| 38 | `js/core-ui/015-ariba-employee-v21-english-and-quiet.js` | JS | 1998–2032 | ariba-employee-v21-english-and-quiet | 8.0 KB |
| 39 | `css/13-ariba-employee-v22-manual-refresh.css` | CSS | 2035–2038 | ariba-employee-v22-manual-refresh | 0.3 KB |
| 40 | `js/core-ui/016-ariba-employee-v22-manual-and-english.js` | JS | 2039–2088 | ariba-employee-v22-manual-and-english | 6.8 KB |
| 41 | `js/employees-data/017-ariba-employee-shared-backend-final-v24.js` | JS | 2090–2105 | ariba-employee-shared-backend-final-v24 | 1.7 KB |
| 42 | `css/14-ariba-employee-theme-final-v24.css` | CSS | 2106–2110 | ariba-employee-theme-final-v24 | 0.4 KB |
| 43 | `js/core-ui/018-profile-data-getd.js` | JS | 2112–2288 | — | 10.6 KB |
| 44 | `js/payroll/019-ariba-hr-master-payroll-final.js` | JS | 2291–2438 | ariba-hr-master-payroll-final | 13.0 KB |
| 45 | `js/forms/020-ariba-emp-v1-pending-templates.js` | JS | 2441–2610 | ariba-emp-v1-pending-templates | 9.6 KB |
| 46 | `js/leaves/021-ariba-emp-v2-fix-normalizeprofile-leave-fields.js` | JS | 2611–2670 | ariba-emp-v2-fix-normalizeprofile-leave-fields | 3.3 KB |
| 47 | `js/attendance/022-ariba-emp-v3-attendance-date-lookup.js` | JS | 2671–2739 | ariba-emp-v3-attendance-date-lookup | 4.0 KB |
| 48 | `js/leaves/023-ariba-emp-v94-live-leave-balance.js` | JS | 2741–2832 | ariba-emp-v94-live-leave-balance | 3.9 KB |
| 49 | `js/auth-permissions/024-ariba-v104-force-password-change.js` | JS | 2834–2888 | ariba-v104-force-password-change | 4.5 KB |
| 50 | `js/leaves/025-ariba-emp-v112-leave-from-hr.js` | JS | 2890–2928 | ariba-emp-v112-leave-from-hr | 2.5 KB |
| 51 | `js/auth-permissions/026-ariba-v114-change-password-emp.js` | JS | 2930–3039 | ariba-v114-change-password-emp | 8.6 KB |
| 52 | `js/requests/027-ariba-v114-forgot-punch-emp.js` | JS | 3041–3144 | ariba-v114-forgot-punch-emp | 8.7 KB |
| 53 | `js/attendance/028-ariba-v117-emp-attendance.js` | JS | 3146–3250 | ariba-v117-emp-attendance | 8.9 KB |
| 54 | `js/core-ui/029-ariba-v117-english-emp.js` | JS | 3252–3426 | ariba-v117-english-emp | 53.8 KB |
| 55 | `js/core-ui/030-ariba-v118-emp-ui.js` | JS | 3428–3767 | ariba-v118-emp-ui | 35.4 KB |
| 56 | `js/payroll/031-ariba-v119-emp-payslip.js` | JS | 3771–3852 | ariba-v119-emp-payslip | 6.2 KB |
| 57 | `js/requests/032-ariba-v118-bell.js` | JS | 3868–4079 | ariba-v118-bell | 16.1 KB |
| 58 | `js/locations/033-ariba-v122-emp-locations.js` | JS | 4093–4176 | ariba-v122-emp-locations | 6.5 KB |
| 59 | `js/attendance/034-ariba-v122b-emp-attendance-location.js` | JS | 4178–4256 | ariba-v122b-emp-attendance-location | 5.7 KB |
| 60 | `js/employees-data/035-ariba-v124-emp-delete.js` | JS | 4266–4376 | ariba-v124-emp-delete | 8.7 KB |
| 61 | `js/core-ui/036-ariba-v126-emp-quiet.js` | JS | 4378–4464 | ariba-v126-emp-quiet | 9.1 KB |

المكتبات الخارجية (تبقى روابطها كما هي داخل index.html):

- السطر 44: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`
---

## 3. خريطة الميزات الكاملة

### 3.1 بوابة الموارد البشرية

#### 3.1.1 الدخول والجلسة والصلاحيات
- **شاشة الدخول `#LG`**: حقلا `#LU` (اسم المستخدم) و`#LP` (كلمة المرور)، زر `#LB` «دخول»، رسالة خطأ `#LE`. زر «عين» لإظهار كلمة المرور (يختفي تلقائياً بعد 15 ثانية).
- الدخول: `ariba_login {p_username,p_password}` ← رمز جلسة يحفظ في `sessionStorage['ariba_hr_session_v3']` (يُفقد بإغلاق التبويب). الدخول المحلي القديم ملغى (V104).
- إن لم توجد جلسة تظهر شاشة الدخول فوراً قبل أي محتوى (preboot). الشريط الجانبي مخفي حتى الدخول.
- **تغيير إجباري لكلمة المرور** إن كانت افتراضية: `ariba_password_status` ← نافذة (الحالية + الجديدة مرتين؛ 8 أحرف على الأقل).
- **تغيير اختياري** من زر المفتاح في الشريط العلوي أو كارت «كلمات المرور والأمان» في الإعدادات (8+ أحرف، حروف وأرقام، مختلفة عن الحالية) ← `ariba_change_my_password`.
- **إعادة تعيين كلمة مرور موظف** (من الإعدادات أو زر «🔑 كلمة مرور جديدة لتطبيق الموظف» في نموذج الموظف أو المساعد): `ariba_hr_reset_password` ← كلمة مرور مؤقتة تظهر مرة واحدة، والموظف ملزم بتغييرها، وتسجيل خروج كل أجهزته.
- **تسجيل الخروج** `hrLogout`: يمسح الجلسة ويعيد تحميل الصفحة.
- **الصلاحيات (V83)** في الإعدادات «صلاحيات المستخدمين»: `employee` موظف عادي، `manager` مدير، `finance` مالية، `hr` موارد بشرية، `ceo` رئيس تنفيذي، `admin` مدير عام (كل الصلاحيات). الحفظ `ariba_hr_set_role` (بالرقم الوظيفي)، العرض `ariba_hr_list_roles`.
- **قيد دور المالية (V82):** إذا كان دور الجلسة (`ariba_session_row.role`) = `finance` تختفي كل عناصر القائمة ما عدا: مسير الرواتب، كشف الراتب، نهاية الخدمة، المخالصة. محاولة فتح صفحة أخرى تعيده لمسير الرواتب مع رسالة «⛔ غير مصرح لك بالوصول لهذا القسم».
- **بانر أحمر** أعلى الصفحة إن كان الدخول محلياً فقط (V72). **شارة الإصدار** «إصدار V113 ✓» أسفل اليسار، وتتحول لتحذير أحمر إذا فُتح البرنامج في أكثر من تبويب (V103).

#### 3.1.2 الشريط العلوي
عنوان الصفحة الحالية، التاريخ، زر اللغة (AR/EN)، زر الوضع الليلي/النهاري، جرس الإشعارات، زر الطباعة، زر «تحديث البيانات» (`syncAll`: إرسال كل الموظفين للسحابة + جلب الإجازات والحضور والمواقع والعطل)، اسم المستخدم «مسؤول HR»، زر تغيير كلمة المرور، زر الخروج.

#### 3.1.3 القائمة الجانبية (`PG_NAV`)
عام: لوحة التحكم | الموظفون: الموظفون | الحضور: الحضور والانصراف، مواقع البصمة | الإجازات: الإجازات | المالية: مسير الرواتب، كشف الراتب، نهاية الخدمة، المخالصة | الوثائق: الوثائق | إدارية: التقارير، الإعدادات | + «نماذج» (V70). شارات عددية: عدد الموظفين، الطلبات المعلقة، الوثائق العاجلة.
صفحات موجودة في الكود لكن غير موجودة في القائمة: `saudi` (السعوديون)، `expats` (المقيمون)، `consultants`، `excl` (المستبعدون — فيها جداول ثابتة بأسماء مكتوبة في HTML)، `projects` (الموظفون حسب المشروع)، `form` (نموذج الموظف).

#### 3.1.4 لوحة التحكم (`pg-dash`)
- 6 بطاقات: الموظفون الحاليون (سعودي • وافد)، نسبة السعودة، إجمالي الرواتب الشهرية، توزيع الجنس (ذكور/إناث)، توزيع الأقسام، (طلبات معلقة + منتهية الخدمة + تمهير).
- رسوم: الرواتب حسب جهة العمل (أعمدة)، الجنسيات، جهات العمل، الأقسام (دوائر).
- «تنبيهات عاجلة»: كل إقامة/جواز/عقد (غير محدد المدة مستثنى)/تأمين طبي ينتهي خلال ≤90 يوماً، مرتبة بالأقرب.
- «طلبات معلقة»: الطلبات السحابية المعلقة (V55). «ملخص الرواتب»: عدد الموظفين، إجمالي الرواتب، إجمالي الصافي (V61).
- المعادلات في القسم 4.13.

#### 3.1.5 الموظفون (`pg-emps`) ونموذج الموظف (`pg-form`)
- تبويبات: الكل، الموظفون الحاليون، المنتهية خدماتهم، تمهير، تدريب، استشاريين. بحث (الاسم عربي/إنجليزي، الإقامة، الرقم)، فلتر جهة العمل.
- أعمدة: الرقم، الموظف، الوظيفة، جهة العمل، القسم، الجنسية، الخدمة (سنوات)، الإقامة (أيام متبقية)، العقد (أيام متبقية)، الراتب الإجمالي، الصافي، إجراءات (عرض/تعديل/حذف نهائي/إنهاء خدمة أو إرجاع للعمل).
- **نافذة العرض `#EM`**: تبويبات أساسي/وثائق/مالية/إجازات (المالية تعرض تأمين الموظف والشركة ومكافأة نهاية الخدمة المحسوبة).
- **نموذج الموظف** (5 تبويبات):
  - **البيانات الأساسية:** الاسم عربي* وإنجليزي، الرقم الوظيفي، جهة العمل* (بعد V121: اريبا / أوبتيموم فقط + جهة الموظف الحالية)، الجنسية، القسم، الوظيفة، تاريخ الميلاد، الجوال، البريد، صورة الموظف (تُصغَّر إلى 480px JPEG 0.82)، البنك، IBAN، الكفيل، الديانة، المدير المباشر، ملاحظات، **مواقع العمل** (V121: اختيار متعدد لمواقع البصمة؛ الموظف يبصم فيها فقط).
  - **الوثائق:** رقم الإقامة/الهوية وانتهاؤها، رقم الجواز وانتهاؤه، شركة التأمين الطبي وفئته ورقم البطاقة وانتهاؤه، + رفع الوثائق الإلكترونية (الهوية، الجواز، شهادة التخرج، شهادة الخبرة، شهادة التأمينات، العنوان الوطني، السيرة الذاتية؛ حد 12MB) ← `ariba_save_document`.
  - **العقد:** طبيعة العقد (محدد المدة / غير محدد المدة)، مدة العقد بالشهور، تاريخ المباشرة، انتهاء العقد/آخر يوم عمل (يُحسب تلقائياً للمحدد المدة — القسم 4.14)، أيام الإجازة السنوية (افتراضي 21).
  - **الراتب:** الأساسي، السكن، المواصلات، المشروع، بدلات أخرى، استقطاعات أخرى، إضافي، العملة (ريال/دولار/يورو/جنيه مصري)، معدل الصرف، نظام التأمينات (لا يطابق 9.75%+11.75% / يطابق 10.75%+12.75% / غير سعودي 0%+2%)، نوع الموظف/WPS (خاضع حماية الأجور، متدرب، تمهير، عقد خارجي، استشاري، بدون WPS، عن بعد) + **معاينة فورية** (الإجمالي، تأمين الموظف، تأمين الشركة، الصافي، والصافي بالريال للعملات الأجنبية).
  - **التابعون:** الاسم عربي/إنجليزي، العلاقة (زوجة، زوج، ابن، ابنة، والد، والدة)، تاريخ الميلاد، الهوية وانتهاؤها، الجواز وانتهاؤه، شركة التأمين ورقم البطاقة وانتهاؤه، الجوال، مرفقات. **تُحفظ على الجهاز فقط** (لا يوجد كود يرسلها للسحابة).
- **الحفظ** (`sEmp`): يتحقق من عدم تكرار الرقم الوظيفي/البريد/رقم الهوية، ومن تاريخ المباشرة والمدة للعقد المحدد. الموظف الجديد يأخذ رقماً = أكبر رقم موجود + 1، واسم مستخدم `EMP` + الرقم بثلاث خانات (مثل `EMP007`). بعد الحفظ يُرسل الموظف المعدَّل للسحابة (`ariba_sync_employee`) مع طابور إعادة محاولة كل 20 ثانية، ورسالة «✓ تم الحفظ ووصل التعديل لتطبيق الموظف».
- **إنهاء الخدمة** (`termEmp`): يطلب السبب وآخر يوم عمل (YYYY-MM-DD). للعقد غير المحدد يصبح تاريخ انتهاء العقد = آخر يوم. ثم `ariba_hr_deactivate_employee`.
- **الإرجاع** (`reinstate`)، **الحذف النهائي** (`delEmp`): يُضاف المعرّف لقائمة المحذوفين، ويُحذف من كل المسيرات المحفوظة والتابعين.
- **إنهاء تلقائي** و**إرجاع تلقائي عند تجديد العقد** — القسم 4.15.
- قائمة «الأقسام» و«جهات العمل» قابلة للإدارة من الإعدادات (لا يمكن حذف قيمة مستخدمة).

#### 3.1.6 الحضور والانصراف (`pg-att`)
- بطاقات اليوم: حاضر، متأخر، عن بعد، غائب.
- **سجل الحضور** لتاريخ مختار: لكل موظف: أول دخول → آخر خروج (×عدد الجلسات)، سطر «⏰ تأخير N دقيقة» و«🚪 خروج مبكر N دقيقة» و«⏱ ساعات»، والحالة (حاضر/متأخر/غائب/إجازة/عن بعد/لم يسجل). زر تحديث من السحابة. زر «+» لتسجيل/تعديل حضور يدوي (الموظف، التاريخ، الدخول، الانصراف، الموقع، الحالة) ← `ariba_sync_attendance`.
- **التقرير الشهري** (موظف/الكل + شهر): حاضر، متأخر، غائب، إجازة، عن بعد، دقائق التأخير، الساعات.
- **تقارير الحضور المتقدمة (V117):** فترة من/إلى (أزرار سريعة: هذا الشهر، الشهر الماضي، آخر 7 أيام، هذه السنة)، اختيار موظفين/قسم، فلتر (الكل، المتأخرون، الغائبون، خروج مبكر، بدون بصمة انصراف، عن بعد، في إجازة، الملتزمون) مع حد أدنى للأيام، نوع (ملخص/تفصيلي يومي)، طباعة على ورق الشركة، تصدير Excel (ورقتان: ملخص وتفصيلي). المعادلات في 4.11.
- المزامنة من السحابة كل 8 ثوانٍ (`ariba_staff_attendance`)، مع إشعار «🟢 بصمة جديدة».

#### 3.1.7 مواقع البصمة (`pg-loc`)
- بطاقة لكل موقع: الاسم، النوع (مقر رئيسي/مشروع/عن بعد)، جهة العمل، الإحداثيات، النطاق، زر Google Maps، تعديل، حذف.
- إضافة/تعديل: الاسم*، جهة العمل، النوع، النطاق (متر، 50–5000 افتراضي 200)، خط العرض/الطول، «موقعي الحالي (GPS)»، معاينة خريطة.
- **ملاحظة:** باتش V38 يفرض **نطاق 1000 متر** لكل موقع غير «عن بعد» عند الحفظ والقراءة من السحابة (القسم 4.12).
- موقعان مفروضان (V35): `L7` «عمل عن بعد» (مفتوح في أي مكان) و`L8` «مصر» (نطاق: محافظة القاهرة والجيزة). ويُحذف التكرار لموقع «عمل عن بعد» ويُبقى `L6`.
- جدول «الموظفين المربوطين بمواقع البصمة» (V121).

#### 3.1.8 الإجازات (`pg-lv`)
تبويبات:
1. **معلقة:** الطلبات المحلية + السحابية في عرض واحد. لكل طلب سحابي: الاسم، النوع، التفاصيل، المرحلة الحالية، المرفقات (عرض/تحميل) وأزرار: «✓ موافقة» (تظهر كـ «موافقة نيابة عن المدير المباشر/الرئيس التنفيذي» حسب المرحلة)، «✗ رفض» (سبب إلزامي)، «اعتماد نهائي» (للمراحل manager/hr: يمرر كل المراحل المتبقية دفعة واحدة)، «🗑 حذف». قسم «الطلبات السابقة (قرارات الموارد البشرية)» (آخر 20).
2. **كل الطلبات:** فلاتر الموظف/النوع/الحالة + جدول «طلبات أخرى من تطبيق الموظف» + «أرشيف مرفقات الطلبات (كل الحالات)».
3. **طلب جديد** (HR يسجل عن موظف): نوع الطلب (سنوية، مرضية، اضطرارية، وفاة، زواج، أبوة، أمومة، عمرة، حج، عن بعد، مهمة خارجية، استئذان، استئذان أمومة، خروج مبكر، سلفة)، الموظف، من/إلى، مرفق اختياري (يحفظ في IndexedDB)، ملاحظات. يعرض «أيام العمل | سيتبقى» ويرفض السنوية إذا تجاوزت الرصيد. تُرسل للسحابة (`ariba_hr_record_leave`) وتظهر للموظف.
4. **الأرصدة:** ملخص لكل الموظفين (المرحّل، الحالي، رصيد 31/12، المستحق والمستخدم والمتبقي من بداية الخدمة، نهاية الخدمة) + تفاصيل موظف (7 بطاقات + جدول سنة بسنة) + **نافذة تعديل الأرصدة سنة بسنة** (القسم 4.3.9).
5. **الإجازات الرسمية:** الاسم، التاريخ، الأيام، متكررة سنوياً. الافتراضي: عيد الفطر 2026-03-20 (4 أيام)، عيد الأضحى 2026-05-27 (4)، اليوم الوطني 09-23 (متكرر)، يوم التأسيس 02-22 (متكرر). المصدر الرسمي: السحابة.
6. **عمل إضافي:** HR يرفع طلب عمل إضافي عن موظف (التاريخ، الساعات بخطوة 0.5، السبب، مرفق) ← `ariba_hr_submit_overtime`؛ وقائمة طلبات العمل الإضافي بمراحلها.

#### 3.1.9 مسير الرواتب (`pg-pay`)
- اختيار الشهر/السنة (السنة الحالية ±2)، أيام الشهر (28–31، تلقائي حسب الشهر ويمكن تثبيت قيمة يدوية لكل شهر)، فلتر نطاق العمل.
- أزرار: اعتماد، إضافة صف، إعادة بناء، Excel (xlsx)، طباعة المسير، «+ إضافة موظف منتهي الخدمة…»، «↺ أيام العمل تلقائي»، «أيام التأمينات = أيام العمل»، «↺ أيام التأمينات تلقائي».
- مؤشرات: إجمالي صافي العملات، إجمالي الصافي (ر.س)، تأمينات المنشأة، بدل الإجازة، …
- الجدول بمجموعات أعمدة مثل Excel (بيانات الموظف، التعاقد والإجازة، الراتب، البدلات، مكافأة نهاية الخدمة، الإجمالي، الاستقطاعات، الصافي) مع إجمالي فرعي لكل جهة عمل وإجمالي عام وإجمالي حسب طريقة الدفع (مدد/تحويل بنكي/تحويل دولي/نقداً). الحقول القابلة للتعديل وأي قيمة معدَّلة يدوياً تُحفظ ويمكن إرجاعها للتلقائي بـ «↺».
- **الاعتماد:** بعد التأكيد يُجمَّد المسير (لا يُعاد بناؤه من بيانات الموظفين أبداً)، يُحفظ في عدة أرشيفات محلية وفي السحابة (`ariba_sync_payroll`)، ويظهر للموظف في تطبيقه. «سجل المسيرات المعتمدة» مع زر مراجعة لكل شهر.
- **الطباعة:** A4 عرضي «كشف رواتب ومكافآت موظفي شركة حلول أريبا لخدمات الأعمال» مع شعار وتوقيعات: مدير الموارد البشرية (افتراضي: عبد الله العنبر)، المدير المالي (مطر المطر)، الرئيس التنفيذي (حسام الحوراني) — أسماء مكتوبة في الكود.
- المعادلات في القسم 4.6.

#### 3.1.10 كشف الراتب (`pg-slip`)
موظف + شهر + سنة (±15/+10 سنة). إن وُجد مسير محفوظ للشهر يُقرأ صف الموظف منه، وإلا يُحسب من بيانات الموظف. يعرض الاستحقاقات والاستقطاعات والصافي. زر «طباعة رسمية» بورق الشركة (توقيع الموظف والموارد البشرية). المعادلة 4.7.

#### 3.1.11 نهاية الخدمة (`pg-eos`)
تاريخ الإنهاء (فارغ = اليوم)، المادة (م.84، م.74، م.85، م.75، م.77، م.80، م.74(4)، م.74(3))، فلتر جهة العمل، Excel (CSV). جدول: الموظف، المباشرة، مدة الخدمة (سنة/شهر/يوم)، الأساسي، السكن، الوعاء، المكافأة. المعادلة 4.5.2.

#### 3.1.12 المخالصة (`pg-eoscalc`)
اختيار الموظف، تاريخ المباشرة، تاريخ الإنهاء، الراتب الإجمالي، سبب الإنهاء (9 خيارات)، إجازة/سنة، إجازة مأخوذة، أيام الشهر، أيام الحضور، استحقاقات إضافية (اسم+مبلغ)، استقطاعات (اسم + مبلغ أو أيام). النتائج: 5 بطاقات + إجمالي + جدول تفصيلي. أزرار: طباعة، تصفير، «طباعة مخالصة رسمية» (مستند صفحة واحدة بورق الشركة مع الإقرار والتعهد والتفقيط). المعادلة 4.8.

#### 3.1.13 الوثائق (`pg-docs`)
تبويبات: الإقامات، الجوازات، التأمين الطبي، العقود — لكل موظف حالي: الرقم، الانتهاء، المتبقي، الحالة (غير مكتمل/منتهي/ساري…). طباعة التبويب الحالي أو الكل بتنسيق الشركة. زر تحديث.

#### 3.1.14 التقارير (`pg-rpt`)
أرصدة الإجازات، الإقامات، الجوازات، العقود، الرواتب التفصيلي، نهاية الخدمة (المنتهية خدماتهم الذين لهم مكافأة > 0 فقط)، التنبيهات العاجلة، كل الموظفين الحاليين (مع التابعين)، المنتهية خدمتهم (مع زر إرجاع).

#### 3.1.15 الإعدادات (`pg-set`)
اسم الشركة عربي/إنجليزي (يظهر في الشريط الجانبي)، نظام العمل (السعودية/مصر/الإمارات — لا يغيّر أي حساب في الكود)، وقت بدء العمل (08:00)، هامش التأخير (15 دقيقة)، حد العمل عن بعد (10 أيام/سنة) — الثلاثة الأخيرة تُرسل للسحابة وتؤثر على بصمة الموظف. بطاقات: شعار الشركة، **التأمينات الاجتماعية — إعدادات النسب** (حد الأجر، حد العمر، فترات النسب)، إدارة الأقسام وجهات العمل، استبعاد موظف من مسير الرواتب، صلاحيات المستخدمين، **الساعة المرنة** (تفعيل/إلغاء، من الساعة، إلى الساعة، عدد ساعات الدوام)، كلمات المرور والأمان، مدير الموارد البشرية وتوقيعه وختم الشركة.

#### 3.1.16 النماذج (`pg-forms`)
اختيار موظف مشترك + بطاقة «إرسال نموذج لعدة موظفين دفعة واحدة» + بطاقة لكل نموذج (طباعة + «إرسال للموظف للتوقيع»):
مباشرة عمل، استلام عهدة تقنية (بنود: الاسم، الموديل/الرقم التسلسلي، الحالة)، تمديد فترة التجربة، إشعار إنهاء فترة التجربة، إخلاء طرف (استقالة/انتهاء العقد/أخرى)، شهادة خبرة (رقم الصادر الافتراضي `AR-<الرقم>-<السنة>`)، تقييم فترة التجربة (5 معايير)، إشعار انتهاء عقد العمل (السند النظامي من المواد)، خطاب تعريف بالراتب. كل نموذج له نسخة إنجليزية. جدول «حالة النماذج المُرسلة للموظفين»: ⏳ بانتظار الموظف / ✅ تمت الموافقة / ⚠️ معترَض عليه + السبب.

#### 3.1.17 مساعد أريبا (زر عائم «🤖 اريبا AI»)
يعمل داخل الصفحة بدون خادم (V112). يفهم أوامر عامية مثل: «محمد عوض غياب النهارده»، «حسام حضور امبارح الساعة 8:30»، «اجازة سنوية لمحمد من الاحد للخميس»، «نموذج مباشرة عمل لسارة»، «اعمل مخالصة لأحمد استقالة»، «كشف راتب محمد»، «رصيد محمد»، «إعادة تعيين كلمة مرور …»، «مين لسه ماغيرش كلمة المرور». الإجراءات التي تغيّر بيانات تحتاج زر «تنفيذ». (إن وُضع عنوان في `localStorage['ariba_ai_endpoint']` يُستخدم خادم خارجي بدلاً منه.)

#### 3.1.18 الإشعارات (الجرس)
`ariba_my_notifications` (آخر 40) و`ariba_mark_notifications_read`. أنواع: نموذج، طلب، موافقة، رفض. الضغط على إشعار يفتح الصفحة المناسبة.

### 3.2 بوابة الموظف

#### 3.2.1 الدخول
اسم المستخدم (`EMPxxx`) وكلمة المرور ← `ariba_login`، الرمز في `localStorage['ariba_employee_session_v2']` (يبقى بعد إغلاق التطبيق). ثم `ariba_employee_context` يجلب: بيانات الموظف، الدور، الإشعارات، الطلبات، المواقع، الفريق، الحضور، العطل، الوثائق، المسيرات المعتمدة، المدير. تغيير إجباري لكلمة المرور الافتراضية، وتغيير اختياري (زر المفتاح + بطاقة «الأمان» في ملفي).

#### 3.2.2 الشريط العلوي والسفلي
أعلى: عنوان الصفحة، زر تحديث يدوي، الوضع (ليلي/نهاري — الافتراضي نهاري)، اللغة، الجرس، كلمة المرور، الخروج. أسفل (عائم): الرئيسية، الحضور، الإجازات، الراتب، فريقي، ملفي، عمل إضافي، مستندات (بعدد المعلّق)، الموافقات (للمدير/الموارد البشرية/الرئيس التنفيذي فقط).

#### 3.2.3 الرئيسية
بطاقة البصمة الكبيرة: ساعة الرياض الحية، زر دائري (سجّل حضورك/سجّل انصرافك/تم الانصراف + «↩ رجوع للعمل»)، حالة الموقع (داخل النطاق/خارج النطاق — أقرب موقع ومسافته)، الانصراف المتوقع (عند تفعيل الساعة المرنة)، ساعات اليوم. ثم: رصيد الإجازة، رصيد نهاية السنة، آخر راتب معتمد، أزرار سريعة (طلب إجازة، نسيت بصمة، عمل إضافي…)، بياناتي (جهة العمل، القسم، المدير المباشر، الجنسية)، «جهة العمل ومواقع العمل».

#### 3.2.4 الحضور
`ariba_attendance {p_action:'in'|'out', p_lat, p_lng}` — **الخادم** يتحقق من النطاق الجغرافي والساعة المرنة ويحسب التأخير. رسائل الخطأ: `OUTSIDE_GEOFENCE` «أنت خارج نطاق مواقع العمل المسموح بها»، `TOO_EARLY_FOR_FLEXIBLE_WINDOW`، `TOO_LATE_FOR_FLEXIBLE_WINDOW`. يُسمح بأكثر من جلسة في اليوم (رجوع بعد خروج بالخطأ). سجل آخر 31 يوم (أول دخول → آخر خروج ×جلسات)، واستعلام بفترة (`ariba_my_attendance_range`). زر «نسيان بصمة».

#### 3.2.5 الإجازات والطلبات
أنواع الطلب: سنوية، مرضية، اضطرارية، وفاة، زواج، أمومة، أبوة، عمرة، حج، عن بعد، استئذان، استئذان أمومة، خروج مبكر، سلفة (المبلغ)، مهمة خارجية، نسيان بصمة. الحقول: من/إلى (أو التاريخ/الوقت/المدة بالساعات للاستئذان)، ملاحظات، مرفق اختياري ≤12MB. يُرسل `ariba_submit_request`. «طلباتي» بالحالة: موافق / مرفوض / بانتظار المدير المباشر / بانتظار الموارد البشرية / بانتظار الرئيس التنفيذي، مع إمكانية الحذف (الطلب المعتمد يُخفى من القائمة فقط).
**نسيان بصمة:** النوع (دخول/خروج/دخول وخروج)، التاريخ (ليس مستقبلياً)، الوقت (والخروج بعد الدخول)، السبب إلزامي. يذهب للموارد البشرية مباشرة، وعند الموافقة يُسجَّل في الحضور تلقائياً.
**عمل إضافي:** التاريخ، الساعات (≥0.5)، السبب، مرفق.

#### 3.2.6 الراتب
الراتب الحالي (الأساسي، السكن، النقل، المشروع، أخرى، الإجمالي، استقطاع التأمينات، الصافي)، قسيمة آخر مسير معتمد وكل المسيرات المعتمدة (من صف المسير نفسه: الأساسي حسب أيام العمل، البدلات، الإضافي، بدل الإجازة، مكافأة نهاية الخدمة، إجمالي المستحق، التأمينات، السلف/الغياب، الاستقطاعات الأخرى، الصافي بالريال وبالعملة الأصلية)، IBAN.

#### 3.2.7 فريقي / الموافقات
فريقي: الموظفون الذين مديرهم أنا. الموافقات (للأدوار manager/hr/ceo): `ariba_staff_queue` ثم موافقة أو رفض (سبب) `ariba_workflow_action`. نص المسار المعروض: «الموظف → المدير المباشر → الموارد البشرية → الرئيس التنفيذي → الموظف».

#### 3.2.8 مستندات بانتظار توقيعي
النماذج التي أرسلها HR: عرض المستند، موافقة، أو رفض بسبب (3 أحرف على الأقل) ← `ariba_employee_ack_template`. حذف المستند.

#### 3.2.9 ملفي
الصورة والاسم والوظيفة والرقم، البيانات الشخصية، الوظيفة والعقد، الراتب من الموارد البشرية، IBAN، الأمان، وثائقي (تحميل).

---

## 4. المعادلات الحسابية ومنطق نظام العمل (القسم الأهم)

**اصطلاحات:**
- `r2(x)` = تقريب لأقرب منزلتين عشريتين: `Math.round(x*100)/100` (في محرك V119: `Math.round((x+EPSILON)*100)/100`).
- «يوم عمل» في الإجازات = أي يوم ليس **جمعة ولا سبت** (`getDay()!==5 && !==6`) وليس عطلة رسمية.
- «العطلات الرسمية» تُوسَّع إلى أيامها (التاريخ + عدد الأيام)، والمتكررة تُنقل لنفس اليوم/الشهر في السنة المطلوبة.
- الأمثلة المكتوب بجانبها «(من الكود)» محسوبة بتشغيل الكود الفعلي في المتصفح؛ والمكتوب بجانبها «حساب يدوي» محسوبة يدوياً بنفس المعادلة.
- **المصدر** = من أين يأتي المُدخل (بيانات الموظف `e.*`، حقل في الشاشة، إعدادات).

---

### 4.1 مكونات الراتب الأساسية

#### 4.1.1 إجمالي الراتب (بيانات الموظف) — `sEmp` في `js/main/06-employees.js`
- **الغرض:** حساب «الراتب الإجمالي» المخزن للموظف عند الحفظ.
- **المعادلة:** `salaryTotal = sal + hou + tra + prj + oth + extra`
- **المدخلات:** الأساسي `sal`، السكن `hou`، المواصلات `tra`، المشروع `prj`، أخرى `oth`، الإضافي الثابت `extra` — كلها من تبويب «الراتب» في نموذج الموظف.
- **مثال:** 10,000 + 2,500 + 1,000 + 0 + 500 + 0 = **14,000**.
- **ملاحظة:** باتش V38 (`js/locations/016-...`) يملأ `salaryTotal` إن كان فارغاً = `r2(b+h+t+p+o)` (بدون الإضافي).

#### 4.1.2 الصافي المخزن للموظف — `sEmp` + تصحيح V105
- **المعادلة:** `netSalary = salaryTotal − insuranceSub − otherDeductions`
  حيث `insuranceSub` = حصة الموظف في التأمينات من `calcIns(e,31,31)` (القسم 4.2).
- **مثال:** 14,000 − 1,343.75 − 200 = **12,456.25**.
- **العملة الأجنبية:** الصافي يُخزن بعملة الموظف، و`netSalarySAR = net × exchRate`. معدل الصرف الافتراضي: الدولار 3.755 في `defaultExchangeRate`، و**3.75** في دوال العرض `ARIBA_SAR/ARIBA_MONEY` إن لم يكن هناك معدل محفوظ، وغير الدولار 1. في المعاينة: إن وُجد سعر يومي في `localStorage['exr_<CODE>_<date>']` أكبر من 1 يُستخدم بدل اليدوي.
- **تصحيح بيانات قديمة (getEmps):** إذا كانت العملة أجنبية وكان الصافي المخزن > 2×الإجمالي ونسبته ≈ معدل الصرف (فرق < 0.05) فهو مخزن بالريال خطأً فيُقسم على المعدل؛ وإن كان > 20×الإجمالي يُعاد حسابه = الإجمالي − التأمين − الاستقطاعات.

#### 4.1.3 معاينة الراتب في النموذج — `cSP`
`tot = sal+hou+tra+prj+oth+extra`؛ `ins = calcIns({...},31,31).empAmt`؛ `insC = .erAmt`؛ `net = r2(tot − ins − ded)`؛ `netSAR = r2(net × exr)`. بعد V130: إن كان الموظف مُعفى (4.2.4) تظهر خانتا التأمين «غير خاضع» والصافي = الإجمالي.

---

### 4.2 التأمينات الاجتماعية (GOSI)

#### 4.2.1 جدول النسب — `INS_RULES_DEFAULT` في `js/calculations/05-gosi-social-insurance.js`
قابل للتعديل من الإعدادات (يُحفظ محلياً وفي السحابة بمفتاح `insurance_rules`). كل «فترة» لها تاريخ سريان؛ يُختار **آخر فترة تاريخها ≤ تاريخ الحساب** (وإن لم توجد فأول فترة).

| النسبة | من 2026-01-01 | من 2027-07-01 |
|---|---|---|
| يطابق — موظف (أقل من 55) | 10.75% | 11.25% |
| يطابق — موظف (55 فأكثر) | 10.50% | 11.00% |
| يطابق — منشأة (أقل من 55) | 12.75% | 13.25% |
| يطابق — منشأة (55 فأكثر) | 12.50% | 13.00% |
| لا يطابق — موظف (أقل من 55) | 9.75% | 10.25% |
| لا يطابق — موظف (55 فأكثر) | 9.00% | 9.50% |
| لا يطابق — منشأة (أقل من 55) | 11.75% | 12.25% |
| لا يطابق — منشأة (55 فأكثر) | 11.00% | 11.50% |
| غير سعودي — منشأة | 2.00% | 2.00% |
| حد الأجر الخاضع | 45,000 | 45,000 |
| حد العمر | 55 | 55 |

- نص الإعدادات: «النسب الإجمالية المستخدمة في معادلة اريبا وتشمل المعاشات وساند، وحصة الشركة تشمل الأخطار المهنية».
- «يطابق» = `insSystem='new'`، «لا يطابق» = `'old'`. **القاعدة النظامية الظاهرة:** يبدو أن «يطابق/لا يطابق» تمثل الموظف المسجَّل بعد/قبل نظام التأمينات الجديد (2024) وزيادة النسب التدريجية — **(يحتاج توضيح من موظف الموارد البشرية)**.

#### 4.2.2 العمر — `empAge`
`age = السنة الحالية − سنة الميلاد` (−1 إن لم يأتِ يوم الميلاد بعد). **إن لم يوجد تاريخ ميلاد يُعتبر العمر 30.** (في محرك V119: العمر يُحسب بـ DATEDIF حتى نهاية شهر المسير، وبدون تاريخ ميلاد = 0.)

#### 4.2.3 حساب التأمين — `calcIns(emp, wd, md, asOf)` (النسخة الأساسية، تُستخدم في معاينة الموظف، كشف الراتب، التقارير)
- **الوعاء:** `base = min( (wageCap / md) × wd , sal + hou )`
- **حصة الموظف:** `empAmt = r2(base × rateEmp)`، **حصة المنشأة:** `erAmt = r2(base × rateEr)`.
- **غير السعودي:** `rateEmp=0`، `rateEr = nonSaudiEr (2%)`.
- **الاستثناءات (ترجع 0):** (1) استشاري (`excelCategory='consultant'` أو الوظيفة تحتوي «استشاري» أو نوع التوظيف يحتوي «مهمة محددة»)، (2) `noIns_wps(emp)` = صحيح — **قبل V130** معناها `wpsType ≠ 'wps'`، **بعد V130** (النهائي) معناها أن الموظف من فئة معفاة (4.2.4).
- **مثال (من الكود):** سعودي «يطابق» عمره 36، أساسي 10,000 وسكن 2,500، شهر كامل (31/31)، تاريخ 2026-10: `base = min(45000, 12500) = 12,500` ← موظف 12,500×10.75% = **1,343.75**، منشأة ×12.75% = **1,593.75**.
- مثال غير سعودي: أساسي 3,000 + سكن 750 ← `base=3,750` ← منشأة 2% = **75**، موظف 0.
- مثال سعودي «لا يطابق» عمره 58، أساسي 40,000 + سكن 10,000: `base=min(45000,50000)=45,000` ← موظف 9% = **4,050**، منشأة 11% = **4,950**.
- مثال قاعدة 2027 (من الكود): سعودي «يطابق» أساسي 10,000 + سكن 2,500، تاريخ 2027-08، 30 يوماً من 31: `base = min(45000/31×30 , 12,500) = 12,500` ← موظف 11.25% = **1,406.25**، منشأة 13.25% = **1,656.25**.

#### 4.2.4 الإعفاء التلقائي من التأمينات — V130 (`js/payroll/114-ariba-v130-insurance-exempt.js`) — **النهائي**
يُعتبر الموظف «غير خاضع» (تأمين = 0 للطرفين) إذا كان:
- **تمهير:** جهة العمل أو الوظيفة أو القسم تحتوي «تمهير».
- **استشاري:** الوظيفة تحتوي «استشاري/مستشار/استشاريه/استشارية»، أو `excelCategory='consultant'`، أو نوع التوظيف «مهمة محددة».
- **تدريب:** الوظيفة تحتوي «متدرب/تدريب/trainee/intern»، أو القسم = «تدريب» بالضبط، أو جهة العمل تحتوي «تدريب»، أو نوع التوظيف «متدرب».
وعند الحفظ يُضبط `wpsType` تلقائياً على النوع (`tamheer/consultant/trainee`) وتُصفَّر قيم التأمين المخزنة.

#### 4.2.5 تأمينات المسير (محرك V119) — انظر 4.6.6.

---

### 4.3 الإجازات وأرصدتها — `js/calculations/03-leave-balance-engine.js`

#### 4.3.1 عدد أيام الطلب
- **سنوية:** `countAnnualLeaveDays(from,to)` = عدد أيام العمل (ليس جمعة/سبت وليس عطلة رسمية) بين التاريخين شاملين.
- **باقي الأنواع:** أيام تقويمية = `round((to − from)/يوم) + 1`.
- **مثال (حساب يدوي):** سنوية من الأحد 2026-10-04 إلى الخميس 2026-10-15 بدون عطلات رسمية = **10 أيام** (يُستبعد يوما الجمعة والسبت 9–10 أكتوبر).
- **بوابة الموظف (الكود الأساسي):** نفس القاعدة لكن تستبعد العطلة إذا طابق **تاريخ بدايتها فقط** (لا تُوسَّع لأيامها) ويُستخدم `toISOString` (UTC). الطلب الفعلي يُرسل للخادم الذي يقرر — **(يحتاج توضيح)** هل الحساب النهائي للأيام من الخادم أم من التطبيق.

#### 4.3.2 الاستحقاق السنوي — `leaveAnnual`
`annual = max(0, leaveDaysContract || 21)` (من حقل «أيام الإجازة السنوية» في العقد).

#### 4.3.3 الاستحقاق التناسبي — `leaveAccruedForPeriod(e, year, toDate)`
- `start = max(تاريخ المباشرة, 1 يناير)`، `end = min(toDate, 31 ديسمبر)`
- `accrued = min( annual , annual × (أيام العمل من start إلى end) ÷ (أيام العمل في السنة كاملة) )`
- **مثال (من الكود):** 2026 فيها 255 يوم عمل. حتى 2026-10-05: 192 يوماً ← 21 × 192/255 = **15.81 يوم**. موظف باشر 2026-03-15: 205 أيام ← 21×205/255 = **16.88 يوم** لسنة 2026 كاملة.
- **القاعدة الظاهرة (من نص الشاشة):** «الاستحقاق يُحسب على أيام العمل من الأحد إلى الخميس مع استبعاد الإجازات الرسمية. السنة الكاملة = 21 يومًا، والسنة الأولى تُحسب تناسبيًا من تاريخ المباشرة» (المادة 109: 21 يوماً، و30 بعد 5 سنوات — **لاحظ أن هذا المحرك لا يرفع إلى 30 تلقائياً**؛ يعتمد على قيمة `leaveDaysContract` المدخلة — يحتاج توضيح).

#### 4.3.4 المستخدم في سنة — `leaveDefaultUsed(e, y, toDate)`
`used = baseline + Σ(أيام الطلبات السنوية المعتمدة في السنة y)`
- `baseline = max( e.leaveUsed<y> , e.leaveHistoryByYear[y] , override[y].used )`
- الطلبات: نوعها `annual` وحالتها `approved` وتبدأ في السنة y وقبل/عند `toDate`؛ **وتُستبعد الطلبات التي تبدأ قبل `override[y].asOf`** (لأنها محسوبة في الرصيد المستورد). أيام كل طلب = أيام عمل من `from` إلى `min(to, toDate)`.

#### 4.3.5 التعديلات اليدوية — `leaveManualNet`
مجموع `delta` في `hr7_leave_balance_adjustments` للموظف في السنة حتى التاريخ.

#### 4.3.6 الترحيل (حد 10 أيام) — `leaveCarryForward(e, y)`
بالترتيب:
1. إن وُجد `override[y].carry` ← هو (≥0).
2. إن كانت y = سنة المباشرة ← **0**.
3. إن كانت **y = 2024** ← `max(0, closing(2023) − 10)` ← **لاحظ: الفائض فوق 10 وليس الحد الأدنى** (يحتاج توضيح، انظر القسم 9).
4. إن وُجد `override[y−1].carryNext` ← `min(10, ...)`.
5. وإلا ← `min(10, max(0, closing(y−1)))`.

#### 4.3.7 دفتر السنة — `leaveYearLedger(e, y)`
| البند | المعادلة |
|---|---|
| المرحَّل للسنة `opening` | `leaveCarryForward(e,y)` |
| استحقاق السنة `entitlement` | `override.entitlement` أو الاستحقاق التناسبي حتى 31/12 |
| المستخدم `used` | `override.used` أو `leaveDefaultUsed` حتى 31/12 |
| التعديلات `adjustment` | `override.adjustment` أو `leaveManualNet` |
| نهاية السنة `close` | `override.yearEnd` أو `max(0, opening + entitlement + adjustment − used)` |
| المرحَّل للعام التالي `carry` | `min(10, max(0, close))` |
| فائض نهاية الخدمة `eos` | إذا y ≥ 2024: `max(0, close − 10)` وإلا 0 |

- **مثال (حساب يدوي حسب المعادلات):** موظف باشر 2019 بدون أي استخدام ولا تعديلات: 2024: opening 21 (بسبب قاعدة 2024)، استحقاق 21، close **42**، مرحَّل 10، فائض **32**. 2025: 10+21 = 31، مرحَّل 10، فائض 21. 2026: 31، فائض 21.
- **القاعدة الظاهرة:** «يرحل بحد أقصى 10 أيام للسنة التالية، وما زاد يبقى ضمن رصيد نهاية الخدمة» (تعليق الكود ونص الشاشة)، و«رصيد ما قبل 2024 فوق حد 10 أيام يدخل كسجل افتتاحي لعام 2024».

#### 4.3.8 الرصيد الحالي — `leaveCurrentBalance` / `leaveCurrentLedger`
`current = override[سنة الحالية].current` إن وُجد، وإلا:
`current = max(0, carry(y) + accrued(y, اليوم) + manual(y, اليوم) − used(y, اليوم))`
- **مثال (من الكود، 2026-10-05):** 10 + 15.81 + 0 − 0 = **25.81 يوم**.
- يُخزَّن في `e.leaveBalance` لكل موظف حالي (V93) مقرباً لمنزلتين. **للموظف المنتهية خدمته** يتجمد الرصيد = `override[سنة آخر يوم].yearEnd`.
- **الموافقة على سنوية** (`approveLv`): `leaveBalance = max(0, current − days)` و`leaveUsed<سنة البداية> += days`.

#### 4.3.9 أرقام شاشة الأرصدة
- المتوقع في 31/12: `leaveYearClosing(e, السنة)`.
- إجمالي المستحق من بداية الخدمة: Σ لكل سنة (override.entitlement للسنوات السابقة أو المحسوب؛ والسنة الحالية حتى اليوم).
- إجمالي المستخدم من بداية الخدمة: Σ بنفس الطريقة.
- المتبقي من بداية الخدمة: `max(0, accrued − used + manual)`.
- رصيد نهاية الخدمة المتراكم: `leaveAccumulatedEos(e, y) = e.leaveEosExcess + Σ_{s=max(2024,سنة المباشرة)}^{y−1} max(0, closing(s) − 10)`؛ وفي جدول الملخص يُضاف فائض السنة الحالية.
- **نافذة التعديل (سنة بسنة):** لكل سنة: المرحل، الاستحقاق، المستخدم، التعديل ±، الحالي (للسنة الحالية فقط)، نهاية السنة، المرحل للتالي، فائض نهاية الخدمة. عند الحفظ: نهاية السنة الفارغة = `max(0, carry+entitlement+adjustment−used)`؛ المرحل للتالي = `min(10, القيمة أو min(10,yearEnd))`؛ الفائض = القيمة أو `max(0, yearEnd−10)`؛ ويُسجل كل ذلك في `leave_balance_adjustments` بعملية `replace_year`.

#### 4.3.10 الترحيل السنوي التلقائي — `rolloverLeaves` (`js/calculations/08-leave-rollover.js`)
عند فتح البرنامج في سنة جديدة لكل موظف لم يُرحَّل: يُجمع الفائض للسنوات الماضية في `leaveEosExcess`، و`leaveBalance = carry = min(10, closing(السنة السابقة))`، ورسالة «تم تحديث ترحيل الإجازات: بحد أقصى 10 أيام للعام الجديد، والزائد يُرحّل لرصيد نهاية الخدمة».

#### 4.3.11 الرصيد في تطبيق الموظف
- **النهائي (V112):** الرقم المعروض = `leaveBalance` القادم من الخادم في `ariba_employee_context` (مع `leaveYearEnd` و`leaveCarryover`)، ويُفرض كل ثانية.
- النسخة الداخلية V94 (يغطيها V112): `max(0, carry + accrued − used)` حيث `carry = override[y−1].carryNext` (وإلا **0**)، و`used = override[y].used + الطلبات المعتمدة التي تبدأ **بعد** asOf` (في HR: «من asOf فصاعداً»).

---

### 4.4 العمل الإضافي
- **الطلب** (الموظف أو HR): `{date, hours, notes}` ساعات ≥ 0.5 — بدون حساب مبلغ.
- **المبلغ في المسير (V119، العمود X):**
  `X = (T ÷ days ÷ 8 × W) + (Q ÷ days ÷ 8 ÷ 2 × W)` حيث W = ساعات الإضافي، T = الراتب شامل البدلات، Q = الأساسي.
  أي: أجر الساعة الكامل + 50% من أجر الساعة الأساسي (يطابق المادة 107: «أجر ساعة + 50% من الأجر الأساسي»). اليوم = 8 ساعات.
  - **مثال (من الكود):** T=14,000، Q=10,000، 30 يوماً، 10 ساعات: 14000/30/8×10 = 583.33 + 10000/30/8/2×10 = 208.33 ← **791.67**.
  - إن لم تُدخل ساعات ← يُستخدم مبلغ يدوي `otAmount` (افتراضيه «الإضافي» الثابت في بيانات الموظف `extraAllowance`).
- النسخة الأقدم من المسير: `overtime` مبلغ يدوي فقط.

---

### 4.5 مكافأة نهاية الخدمة

#### 4.5.1 الأساسية — `calcEOS(sal, yrs, hou=0)` في `js/calculations/01-eos-basic-calcEOS.js`
- `base = sal + hou` (الأساسي + السكن)
- `EOS = r2( base/2 × min(yrs,5) + base × max(0, yrs−5) )`
- **القاعدة:** المادة 84 (نصف شهر عن كل سنة من أول 5 سنوات، وشهر عن كل سنة بعدها — نص TX.eosinfo).
- **أمثلة (من الكود):** (10,000؛ 3 سنوات؛ سكن 2,500) = **18,750**. (10,000؛ 7.5 سنة؛ 2,500) = 31,250 + 31,250 = **62,500**.
- **الاستخدام:** نافذة الموظف (تبويب مالية)، تقرير نهاية الخدمة كقيمة احتياطية، عمود «نهاية الخدمة» في المسير القديم.

#### 4.5.2 صفحة نهاية الخدمة حسب المادة — `rEOS` / `calcByLaw`
- **سنوات الخدمة:** `yrs = r2( (تاريخ الإنهاء − تاريخ المباشرة) ÷ 365.25 يوم )`؛ تاريخ الإنهاء الافتراضي = اليوم.
- `base = sal + hou`؛ `eos84 = r2(base/2 × min(yrs,5) + base × max(0,yrs−5))`
| المادة | المكافأة |
|---|---|
| م.84 إنهاء من الشركة، م.74 اتفاق، م.74(4) تقاعد، م.74(3) وفاة/عجز | `eos84` |
| م.85 استقالة، م.75 استقالة قسرية | `yrs<2 ← 0`؛ `yrs<5 ← r2(eos84/3)`؛ `yrs<10 ← r2(eos84×2/3)`؛ وإلا `eos84` |
| م.77 فصل تعسفي | `r2( eos84 + max( round(2×base) , round(base/30×15×yrs) ) )` |
| م.80 فصل تأديبي | 0 |
- مدة الخدمة النصية: سنوات كاملة، ثم شهور كاملة، ثم الأيام المتبقية **+1**.
- يُستبعد الموظف بالساعة. (نفس المعادلة تُستخدم لعمود «حسبة نهاية الخدمة» في المسير القديم عند اختيار مادة لصف.)
- **ملاحظة نظامية:** المادة 75 (الاستقالة القسرية/المادة 81) تُعامل هنا مثل الاستقالة (بالثلث والثلثين)، بينما في محرك المسير V119 «ترك العمل للحالات الواردة في المادة 81» = مكافأة كاملة — **(يحتاج توضيح)**.

#### 4.5.3 محرك المسير V119 (يطابق Excel) — `PAYX.compute` في `js/payroll/107-ariba-v119-payroll.js`
- **مدة الخدمة:** `I` = آخر يوم عمل (إن وُجد) وإلا `EDATE(تاريخ المباشرة, مدة العقد بالشهور)`. إن كان آخر يوم مكتوباً يُضاف له يوم (اليوم الأخير محسوب كاملاً).
  `AD = DATEDIF(H, I, "y")`، `AE = DATEDIF(H, I, "ym")`، `AF = DATEDIF(H, I, "md")` (بنفس منطق Excel)، و`K = AD + AE/12 + AF/360`.
- **الوعاء:** `T` = الراتب شامل البدلات (الأساسي + السكن + النقل + المشروع + أخرى).
- **تكلفة السنوات** `AG = AD≤5 ? AD×T×0.5 : 5×T×0.5 + (AD−5)×T`
- **تكلفة الشهور** `AH = AD≥5 ? AE/12×T : AE/12×T×0.5`
- **تكلفة الأيام** `AI = AD≥5 ? AF/365×T : AF/360×T×0.5` ← لاحظ 365 مقابل 360 (يحتاج توضيح).
- **إجمالي المكافأة** `AJ = AG + AH + AI` (صفر للمتدرب/التمهير حسب جهة العمل).
- **المكافأة المستحقة** `AK = AJ × المعامل` حسب سبب الإنهاء (جدول «بيانات» P8:P15 في Excel):
| السبب | المعامل |
|---|---|
| اتفاق العامل وصاحب العمل على إنهاء العقد | 1 |
| انتهاء مدة العقد | 1 |
| فسخ العقد من قبل صاحب العمل لإحدى الحالات الواردة في المادة (80) | 0 |
| فسخ العقد من قبل صاحب العمل لغير الحالات الواردة في المادة (80) | 1 |
| بلوغ سن التقاعد / العجز / الوفاة | 1 |
| ترك العامل العمل للحالات الواردة في المادة (81) | 1 |
| ترك العامل العمل دون تقديم استقالة لغير الحالات الواردة في المادة (81) | 0 |
| استقالة | `K<2 ← 0`؛ `K≤5 ← 1/3`؛ `K≤10 ← 2/3`؛ وإلا 1 |
- **مثال (من الكود):** مباشرة 2019-03-10، آخر يوم 2026-09-30، T = 14,000، استقالة:
  AD=7، AE=6، AF=21، K=7.5583 ← AG = 5×14000×0.5 + 2×14000 = **63,000**؛ AH = 6/12×14000 = **7,000**؛ AI = 21/365×14000 = **805.48** ← AJ = **70,805.48** ← المعامل 2/3 ← **AK = 47,203.65**.
- **ملاحظة مهمة:** إن لم يُكتب آخر يوم وكانت «مدة التعاقد» موجودة، تُحسب المدة حتى `EDATE(المباشرة, المدة)` أي **نهاية العقد الأصلي** لا تاريخ اليوم؛ في الاختبار موظف بعقد 24 شهراً من 2019 ظهرت خدمته في المسير «سنتان» (K=2) رغم أن عقده ممتد حتى 2027 — **(يحتاج توضيح)**.

#### 4.5.4 تقرير نهاية الخدمة (التقارير)
يعرض فقط المنتهية خدماتهم الذين لهم مكافأة > 0: القيمة = `eosLaborLaw` المخزنة، وإن لم توجد (ولا يوجد `eosCategory`) = `calcEOS(salary, yearsOfService, housing)`. يستثنى بالاسم «البوصيري» و«وسيم» (مكتوب في الكود).

---

### 4.6 مسير الرواتب — المحرك النهائي (V119)
الملف: `js/payroll/107-ariba-v119-payroll.js` (يغلّف `buildPayrollRows` و`recalcRow` و`renderPayroll` الموجودة في `js/calculations/06-payroll-module.js`).

#### 4.6.1 من يدخل المسير
الموظفون الحاليون، عدا: المنتهية خدماتهم، الموظف بالساعة، `empType='consultant_external'`، `excludeFromPayroll=true` (يُضبط من الإعدادات)، وأي اسم يحتوي «البوصيري» (مستثنى بالاسم في الكود). يُضاف تلقائياً الموظف الذي **انتهت خدمته داخل شهر المسير**، ويمكن إضافة أي منتهي الخدمة يدوياً.

#### 4.6.2 الأيام
- `days` = أيام الشهر (أو القيمة اليدوية 28–31 لهذا الشهر).
- `workDays (U)` الافتراضي = أيام الشهر، **أو** من يوم المباشرة إن باشر داخل الشهر، **أو** حتى آخر يوم إن انتهت خدمته داخل الشهر (مع سبب إنهاء): `U = min(days, end − start + 1)`.
- `insDays (Ins)` الافتراضي = نفس قاعدة أيام العمل (وزر «أيام التأمينات = أيام العمل» ينسخها).

#### 4.6.3 الاستحقاقات
| العمود | المعادلة |
|---|---|
| V الراتب حسب الأيام | `Q × U/days` |
| Y السكن | `Q × houRate × U/days` (صفر إذا كانت جهة العمل تحتوي تمهير/تدريب) |
| Z المواصلات | `Q × traRate × U/days` (نفس الاستثناء) |
| AA المشروع | `prj × U/days` |
| AB أخرى | `oth × U/days` |
| T الراتب شامل البدلات | `Q + Q×houRate + Q×traRate + prj + oth` (أو قيمة يدوية) |
| X الإضافي | 4.4 |
| AC بدل الإجازة | إن وُجد سبب إنهاء: `P × T/30`؛ وإلا مبلغ يدوي |
| AK مكافأة نهاية الخدمة | 4.5.3 (فقط مع سبب إنهاء) |
| **AM إجمالي المستحق** | `V + X + Y + Z + AA + AB + AC + AK` (+ «بدلات أخرى» يدوية `otherAllow`) |
- `houRate = hou/sal`، `traRate = tra/sal` من بيانات الموظف (أي البدل الفعلي)؛ وإذا استُدعي المحرك بدونها فالافتراضي 25% و10%.

#### 4.6.4 رصيد الإجازة في المسير
- `N` (المستحق خلال فترة التعاقد) = `r2( K≤0 ? 0 : K≤5 ? K×M : 105 + (K−5)×30 )` حيث M = الاستحقاق السنوي (افتراضي 21). أي 21 يوماً للخمس سنوات الأولى (=105) ثم 30 يوماً لكل سنة بعدها (المادة 109).
- `O` (ما تم استحقاقه = المأخوذ): يدوي، أو تلقائياً من سجلات الإجازات من بداية الخدمة حتى آخر يوم (فقط عند وجود سبب إنهاء).
- `P = r2(N − O)`، `AC = P × T/30`.
- **مثال (من الكود):** K=7.5583 ← N = 105 + 2.5583×30 = **181.75**؛ مأخوذ 120 ← P = **61.75** ← AC = 61.75 × 14,000/30 = **28,816.67**.

#### 4.6.5 الاستقطاعات والصافي
| العمود | المعادلة |
|---|---|
| AO تأمينات الموظف | 4.6.6 |
| AU إجمالي المستقطع | `otherDed + AO (إلا إذا عُلّم «لا يُخصم من الموظف») + advances (سلف/غياب)` |
| AV الصافي بالعملة | `AM − AU` (+ otherAllow) |
| AW الصافي بالريال | `AV × معدل الصرف` |

#### 4.6.6 تأمينات المسير
- `insBase = min( cap/days × Ins , (Q + Q×0.25)/days × Ins )` ← **الوعاء = الأساسي + 25% من الأساسي ثابتاً** (وليس السكن الفعلي) — يختلف عن `calcIns` (4.2.3) الذي يستخدم السكن الفعلي. **(يحتاج توضيح)**.
- الحالة (`insStatus`) قابلة للاختيار لكل صف: «يطابق» ← نسب المطابق، «لا يطابق» ← نسب غير المطابق، «غير سعودي» ← موظف 0 ومنشأة `min(cap/days×Ins, 1.25Q/days×Ins) × 2%`، «غير خاضع»/«لا يطبق» ← 0. النسب حسب العمر (≥55) والفترة السارية في **نهاية شهر المسير**.
- الحالة الافتراضية: معفى (4.2.4) ← «غير خاضع»؛ استشاري ← «لا يطبق»؛ غير سعودي ← «غير سعودي»؛ غير WPS ← «لا يطبق»؛ وإلا «يطابق»/«لا يطابق» حسب نظام التأمينات.
- **الأجر الخاضع AQ:** `Q > cap ? min(cap, 1.25Q) : Ins<days ? min(cap, 1.25Q × Ins/days) : min(cap, 1.25Q)`.
- **مثال كامل (حساب يدوي حسب المعادلات):** Q=10,000، سكن 2,500، نقل 1,000، أخرى 500، 30 يوماً، سعودي يطابق، بدون إنهاء: V=10,000، Y=2,500، Z=1,000، AB=500 ← AM = **14,000**؛ insBase = min(45000, 12,500) = 12,500 ← AO = **1,343.75**، AR = **1,593.75** ← AV = **12,656.25**.
- مع إنهاء استقالة (المثال في 4.5.3 + 10 ساعات إضافي + سلفة 300): AM = 14,000 + 791.67 + 28,816.67 + 47,203.65 = **90,811.99**؛ AU = 1,343.75 + 300 = 1,643.75 ← AV = **89,168.24**.

#### 4.6.7 المسير القديم (قبل V119، ما زال كوده موجوداً)
`salByDays = r2(tot/days × workDays)`؛ `totalDue = r2(salByDays + overtime + leaveComp + otherAllow)`؛ `totalDeduct = r2(insEmp + loanDeduct + otherDeduct)`؛ `net = r2(totalDue − totalDeduct)`؛ `netSAR = r2(net × exchRate)`؛ والتأمين `base = min(cap/days × insDays, sal+hou)` × النسب (V53). هذه الدوال مغطاة الآن بـ V119.

#### 4.6.8 الاعتماد والتجميد
المسير المعتمد يُعرض من النسخة المحفوظة حرفياً ولا يعاد حسابه. «إعادة بناء» ممنوعة بعد الاعتماد.

---

### 4.7 كشف الراتب — `rSlip` (V60) + الطباعة الرسمية (V69)
- إن وُجد صف للموظف في `hr7_pay_YYYY_MM`: الإجمالي = `totalDue`، التأمين = `insEmp`، الاستقطاعات = `otherDeduct` **أو** `loanDeduct` (الأولى غير الصفرية فقط، لا يُجمعان)، الصافي = `net` أو `netSAR`.
- وإلا: الإجمالي = الأساسي + السكن + النقل + المشروع + أخرى؛ التأمين = `calcIns(e,31,31, أول الشهر)`؛ الصافي = الإجمالي − التأمين − `otherDeductions`.
- **(يحتاج توضيح):** عرض `otherDeduct || loanDeduct` بدل مجموعهما.

---

### 4.8 حاسبة المخالصة — `sRun` في `js/calculations/07-settlement-calculator.js`
- **المدخلات:** تاريخ المباشرة، تاريخ الإنهاء (افتراضي اليوم)، الراتب `sal` (افتراضي = `salaryTotal` أي **الإجمالي شامل كل البدلات**)، السبب، الإجازة السنوية `ld` (21)، الإجازة المأخوذة `lt`، أيام الشهر `wd`، أيام الحضور `ad`، استحقاقات واستقطاعات إضافية.
- **المدة:** `fy` سنوات كاملة، `fm` شهور كاملة بعدها، `fd` الأيام المتبقية **+1**؛ `ty = fy + fm/12 + fd/360`.
- **المكافأة:** `e84 = r2(sal/2 × min(ty,5) + sal × max(0,ty−5))`؛ م.84/م.74/م.74(4)/م.74(3) = e84؛ م.85/م.75: `ty<2 ← 0`، `<5 ← ثلث`، `<10 ← ثلثان`، وإلا كاملة؛ م.77 = `e84 + max(round(2×sal), round(sal/30×15×ty))`؛ م.80 و**م.53 (فترة التجربة)** = 0.
- **الإجازة:** `ldue = r2(ty × ld)`، `lrem = max(0, r2(ldue − lt))`، **بدل الإجازة** `lcomp = r2(sal/30 × lrem)`؛ إن كانت المأخوذة أكثر: `lexc = max(0, r2(lt − ldue))` ويُخصم `lded = r2(sal/30 × lexc)`.
- **راتب الفترة:** `lmsf = (wd>0 && ad>0) ? r2(sal/wd × ad) : sal` ← **إن لم تُدخل الأيام يُحتسب راتب شهر كامل**.
- **الاستقطاع بالأيام:** `r2(sal/(wd||30) × الأيام)`.
- **الإجمالي:** `gt = max(0, r2(e + lcomp + lmsf + الاستحقاقات − الاستقطاعات − lded))`.
- **مثال (من الكود):** مباشرة 2019-03-10، إنهاء 2026-09-30، sal = 14,000، مأخوذ 40 يوماً، 30/30:
  ty = 7.5583؛ e84 = 70,816.67؛ ldue = 158.73 ← lrem = 118.73 ← lcomp = **55,407.33**؛ راتب الفترة **14,000**.
  م.84 = **140,224**؛ م.85 (ثلثان) = 47,211.11 ← **116,618.44**؛ م.77 = 70,816.67 + max(28,000 ; 52,908) ← **193,132**؛ م.80 = **69,407.33**.
- **ملاحظات:** هذه الحاسبة تحسب على **الراتب الإجمالي** بينما صفحة نهاية الخدمة على (الأساسي + السكن) ومحرك المسير على T؛ وتحسب رصيد الإجازة = سنوات الخدمة × الاستحقاق (وليس من دفتر الأرصدة) — **(يحتاج توضيح)**.
- **المستند الرسمي:** يقرأ الأرقام من الشاشة ولا يعيد الحساب. فترة «راتب آخر فترة» المعروضة = من 1 الشهر الأخير (أو تاريخ المباشرة إن كان بعده) إلى تاريخ الإنهاء (+1 يوم). الاستقطاع الذي يحتوي اسمه «تأمين» يُعرض «التأمينات الاجتماعية (GOSI) عن الفترة …».

### 4.9 التفقيط — `aribaTafqeet(amount)` (`js/settlement-eos/056-...`)
الريالات = الجزء الصحيح، الهللات = `round(الكسر×100)` (100 ← +1 ريال). مجموعات مليون/ألف بصيغ المفرد/المثنى/الجمع (3–10 جمع). النتيجة: «… ريال سعودي» + « و… هللة» أو « لا غير».
أمثلة (من الكود): 12,345.67 ← «اثنا عشر ألف وثلاثمائة وخمسة وأربعون ريال سعودي وسبعة وستون هللة»؛ 2,000 ← «ألفان ريال سعودي لا غير».

### 4.10 العقد وانتهاؤه
- **تاريخ نهاية العقد المحدد المدة** `addMonthsSafe(join, months)`: إضافة الشهور مع تثبيت اليوم لآخر الشهر إن لزم، ثم **طرح يوم**. أمثلة (حساب يدوي حسب الكود): (2025-03-10، 24) ← **2027-03-09**؛ (2024-01-31، 1) ← 2024-02-29 ثم −1 ← **2024-02-28**.
- **الأيام المتبقية للوثائق** (V89/V91): `round((تاريخ الانتهاء − اليوم)/يوم)`؛ الألوان: ≤0 منتهي (أحمر)، ≤30 أحمر/عاجل، ≤90 أصفر/قريب، غير ذلك أخضر/ساري.
- **سنوات الخدمة المعروضة** (V89/V91): `r2((نهاية − المباشرة)/365.25 يوم)`، النهاية = آخر يوم للمنتهي وإلا اليوم.

### 4.11 الحضور والتأخير والغياب
#### 4.11.1 القواعد المعروضة في سجل HR الأساسي (`rAtt`)
- التأخير = `دقيقة الدخول − (بداية الدوام + هامش السماح)` إن كانت موجبة (بداية الدوام من الإعدادات 08:00، السماح 15).
- الخروج المبكر = `(16:00 − السماح) − دقيقة الخروج` إن كانت موجبة — **نهاية الدوام 16:00 مكتوبة ثابتة**.
- بعد V114/V117 تُعرض قيم **الخادم** (`late_minutes`, `early_minutes`) بدلاً منها.
#### 4.11.2 الساعة المرنة (إعدادات V86 — الحساب على الخادم)
«الموظف يدخل أي وقت داخل نطاق الدوام، ووقت انصرافه المفروض = وقت دخوله + عدد الساعات (مثال: نطاق 8 إلى 5، دوام 8 ساعات ← دخل 8 يمشي 4، دخل 9 يمشي 5). لو الدخول هيخلي الانصراف يعدي نهاية النطاق، البصمة بترفض.»
- **الانصراف المتوقع المعروض:** `أول دخول + ساعات الدوام`، وإن كان متأخراً: `min(ذلك، نهاية النطاق)`. الخروج المبكر في HR (إن لم يرسله الخادم) = `max(0, المتوقع − الخروج)`.
#### 4.11.3 تقارير الحضور (V117)
- **تجميع اليوم:** أكثر من بصمة في اليوم ← أول دخول وآخر خروج حقيقي؛ البصمات المكررة بنفس وقت الدخول تُحسب مرة؛ الساعات = مجموع (خروج − دخول) للجلسات المغلقة **عدا المغلقة تلقائياً** (ملاحظاتها «إغلاق تلقائي/auto»)؛ الحالة متأخر إن كانت أول جلسة متأخرة؛ التأخير = دقائق أول جلسة؛ الخروج المبكر = دقائق آخر جلسة.
- **تصنيف كل يوم:** بعد اليوم ← لا يُحسب؛ قبل المباشرة ← لا يُحسب؛ يوجد سجل ← حالته؛ جمعة/سبت/عطلة ← «عطلة»؛ إجازة معتمدة ← «إجازة» (أو «عن بعد» لنوع remote)؛ اليوم الحالي بلا سجل ← «لم يُسجَّل بعد»؛ **غير ذلك ← غائب**.
- **أيام العمل المتوقعة** = الأيام التي ليست عطلة ولا «لم يسجل بعد» (العمل في يوم عطلة لا يُحسب ضمنها).
- **نسبة الحضور** = `round1( (حاضر + متأخر + عن بعد) ÷ (المتوقعة − الإجازات) × 100 )`.
- ملاحظة الطباعة: «يوم العمل = غير الجمعة/السبت والعطلات الرسمية وبعد تاريخ المباشرة ولا يشمل اليوم الحالي. الغياب = يوم عمل بدون بصمة وبدون إجازة معتمدة…».
#### 4.11.4 تطبيق الموظف (الكود الأساسي القديم — يغطيه الخادم الآن)
التأخير = `max(0, الآن − (wst + tol))`؛ الخروج المبكر = `max(0, 15:45 − الخروج)`؛ الساعات = `(خروج − دخول)/60` مقرّبة.

### 4.12 النطاق الجغرافي
- **التحقق الفعلي على الخادم** (`ariba_attendance`).
- **العرض في تطبيق الموظف (V118):** المسافة بمعادلة Haversine (`R = 6,371,000 م`) لأقرب موقع غير «عن بعد» له إحداثيات غير (0,0)؛ «داخل النطاق» إذا `المسافة ≤ radius_m` (افتراضي 200). الكود الأساسي القديم: `√((Δlat×111000)² + (Δlng×111000×cos(lat))²)`.
- **في HR:** الحفظ يفرض **1000 متر** لكل موقع غير «عن بعد» (V38)، بينما الواجهة تسمح 50–5000 — **(يحتاج توضيح)**. «عن بعد» = 999999 (أو 999999999 للمواقع المفروضة L7/L8).
- **مواقع الموظف (V121):** إن حُدد للموظف `workLocationIds` يبصم فيها فقط، وإلا «بيبصموا في مواقع جهة عملهم».

### 4.13 مؤشرات لوحة التحكم
- **نسبة السعودة** = `round(عدد السعوديين ÷ عدد الحاليين × 100)` (السعودي = `isSaudi` أو الجنسية «سعودي/سعودية»).
- **الإناث** = حقل الجنس «أنثى/f/female» **أو أن الاسم يبدأ بأحد الأسماء:** منى، زينب، ريم، بدريه، ساره، نوره، كادي، منيرة، دعاء، غدي، لينا، نهى، سجى، روان، أثير، هيا، نورة، فاطمة، عائشة، أفنان. الذكور = الباقي. النسبة `round(إناث/الكل×100)` والذكور = 100 − الإناث.
- **إجمالي الرواتب في البطاقة** = Σ(الأساسي + السكن + النقل) فقط. «ملخص الرواتب» = Σ salaryTotal و Σ الصافي.
- **تمهير** = الوظيفة تحتوي «تمهير».
- **الطلبات المعلقة** = الإجازات والاستئذانات المحلية المعلقة + طابور الطلبات السحابية.

### 4.14 خطاب تعريف الراتب (V117)
- **الإجمالي** = الأساسي + السكن + المواصلات + بدلات أخرى (**بدل المشروع غير مشمول**). إن كانت كلها صفراً ← الأساسي = `salaryTotal`.
- **رقم الحساب من IBAN:** إذا طابق `^SA\d{22}$` ← الأرقام بعد أول 6 خانات.
- **رقم الصادر:** `AR-YYYYMMDD-n` (تسلسل يومي يزيد مع كل طباعة/إرسال). التاريخ هجري (أم القرى) وميلادي بتوقيت الرياض.

### 4.15 الإنهاء والإرجاع التلقائي
- **إنهاء تلقائي (V42/V89):** عقد محدد المدة تاريخ انتهائه قبل اليوم ← «منتهي الخدمة» بسبب «انتهاء مدة العقد» وآخر يوم = تاريخ الانتهاء؛ متدرب/تمهير انتهى تاريخ تدريبه ← «انتهاء فترة التدريب/التمهير».
- **إرجاع تلقائي (V101):** إذا كان السبب تلقائياً (انتهاء العقد/التدريب) ثم جُدِّد العقد (الانتهاء الجديد ≥ اليوم وبعد آخر يوم) أو صار غير محدد المدة ← يعود للعمل. الإنهاء اليدوي لا يُلمس.

### 4.16 تقييم فترة التجربة
المعايير الخمسة (المعرفة الفنية، الالتزام بالأنظمة، جودة العمل، العلاقة مع الإدارة والزملاء، القدرة على التعلم والمبادرة)، كل معيار: 0 غير مرضٍ، 50 أقل من التوقعات، 70 يحقق (افتراضي)، 90 يفوق، 100 متميز. **المجموع = round(المتوسط)**.

### 4.18 كلمة مرور الموظف الافتراضية (ملاحظة)
عند إضافة/تعديل موظف: `password = آخر 4 أرقام من رقم الهوية/الإقامة` (أو 1234)، واسم المستخدم `EMP` + الرقم الوظيفي بثلاث خانات. الرقم الوظيفي الجديد = أكبر رقم موجود + 1 (V111).

### 4.17 العملات
`ARIBA_SAR(e,'net')` = الصافي المحلي × المعدل (المعدل الافتراضي للدولار هنا 3.75)، منزلتان. عملات المسير تُجمع منفصلة («إجمالي صافي العملات») ثم بالريال.

---

## 5. قاعدة البيانات (كما تظهر من الكود فقط)

> **تنبيه:** بطلبكم **لم تُفحص قاعدة البيانات** ولم يُستدعَ أي RPC حقيقي. كل ما يلي مستنتج من نصوص الكود (أسماء الدوال والحقول المُرسلة والمستقبلة). المخطط الحقيقي للجداول غير معروف.

### 5.1 الاتصال
- مشروع Supabase واحد للبوابتين (`https://iwviydmapqpqihcdazpe.supabase.co`) بمفتاح publishable (عام بطبيعته). الإعداد الرئيسي في `hr-portal/js/config/supabase-config.js` و`employee-portal/js/config/002-supabase-stub-and-sb-fetch.js`. **العنوان والمفتاح مكتوبان أيضاً حرفياً في نحو 40 موضعاً داخل الباتشات** وتُركت كما هي لعدم تغيير السلوك.
- كل العمليات تقريباً عبر `POST /rest/v1/rpc/<function>` مع `p_token` (رمز الجلسة UUID). جلسة HR: `sessionStorage['ariba_hr_session_v3']`، جلسة الموظف: `localStorage['ariba_employee_session_v2']`.
- الصلاحيات تُفرض في الخادم (الدوال) حسب `role` في الجلسة: `employee` موظف عادي، `manager` مدير، `finance` مالية، `hr` موارد بشرية، `ceo` رئيس تنفيذي، `admin` مدير عام.

### 5.2 الدوال (RPC) المستخدمة
| المجال | HR | الموظف |
|---|---|---|
| الدخول والجلسة | `ariba_login` {p_username,p_password}، `ariba_session_row` (الدور)، `ariba_password_status`، `ariba_change_my_password` {p_old,p_new}، `ariba_hr_reset_password`، `ariba_hr_default_password_list` | `ariba_login`، `ariba_employee_context` (الموظف، الدور، الإشعارات، الطلبات، المواقع، الفريق، الحضور، العطلات، المستندات، رصيد الإجازة)، `ariba_password_status`، `ariba_change_my_password` |
| الموظفون | `ariba_sync_employee` (رفع)، `ariba_staff_employees` و`ariba_hr_legacy_employees` (**السحب محجوب في المتصفح منذ V87**)، `ariba_hr_deactivate_employee`، `ariba_hr_set_role`، `ariba_hr_list_roles` | — |
| الحضور | `ariba_staff_attendance`، `ariba_sync_attendance`، `ariba_hr_attendance_range` {p_from,p_to,p_employee_id}، `ariba_get_attendance_settings`، `ariba_hr_set_attendance_settings` {p_work_start,p_tolerance_minutes}، `ariba_hr_set_flexible_hours` {p_enabled,p_shift_hours,p_window_start,p_window_end} | `ariba_attendance` {p_action in/out,p_lat,p_lng} (يرجع late_minutes, early_minutes, expected_checkout أو أخطاء OUTSIDE_GEOFENCE / TOO_EARLY_FOR_FLEXIBLE_WINDOW / TOO_LATE_FOR_FLEXIBLE_WINDOW)، `ariba_my_attendance_range` |
| المواقع والعطلات | `ariba_staff_locations`، `ariba_upsert_location`، `ariba_delete_location`، `ariba_sync_locations`، `ariba_staff_holidays`، `ariba_sync_holidays` | (ضمن context) |
| الطلبات وسير العمل | `ariba_staff_requests`، `ariba_submit_request`، `ariba_hr_submit_overtime`، `ariba_workflow_action`، `ariba_hr_override_workflow`، `ariba_hr_final_approve`، `ariba_hr_record_leave`، `ariba_delete_request` | `ariba_submit_request` {p_type,p_payload}، `ariba_staff_queue`، `ariba_workflow_action` {p_request_id,p_action,p_reason}، `ariba_delete_request` |
| المسير | `ariba_sync_payroll` {p_year,p_month,p_approved,p_approved_at,p_rows}، `ariba_payroll_archive` | (ضمن context: المسيرات المعتمدة) |
| المستندات والنماذج | `ariba_save_document`، `ariba_get_document`، `ariba_list_documents`، `ariba_hr_send_template`، `ariba_hr_template_status` | `ariba_save_document`، `ariba_get_document`، `ariba_list_documents`، `ariba_employee_pending_templates`، `ariba_employee_ack_template` |
| الإعدادات والإشعارات | `ariba_hr_get_setting`، `ariba_hr_set_setting` (مثل `insurance_rules`)، `ariba_hr_force_sync`، `ariba_my_notifications`، `ariba_mark_notifications_read` | `ariba_my_notifications`، `ariba_mark_notifications_read` |

(أسماء مثل `ariba_ui_lang` و`ariba_ui_theme` و`ariba_hr_tabs` و`ariba_eye` و`ariba_payroll_archive_v58` هي مفاتيح تخزين محلي أو أسماء قنوات/عناصر وليست دوالاً.)

### 5.3 جداول مذكورة مباشرة
- **HR:** `supa.from('employees')` — لكن `supa` غير معرّف في HR فلا يُنفَّذ (كود ميت).
- **الموظف:** `from('employees')`، `from('attendance')`، `from('leave_requests')` — عبر كائن `supa` «بديل» (stub) يرجع بيانات فارغة؛ الحقيقي هو RPC.

### 5.4 الكائنات الرئيسية وحقولها (من الكود)
- **الموظف (`hr7_emps`):** id, empNo, username, password, nameAr, nameEn, employer, nationality, isSaudi, gender, dob, dept, jobTitle, managerId, mobile, email, bank, iban, sponsor, religion, iqamaNo/Expiry, passportNo/Expiry, insuranceCo/Class/Expiry, contractNature (fixed/indefinite), contractType, contractDuration, contractJoin, contractEnd, leaveDaysContract, salary, housingAllowance, transportAllowance, projectAllowance, otherAllowance, extraAllowance, otherDeductions, salaryTotal, insuranceSub, insuranceComp, netSalary, insSystem (new/old), wpsType, currency, exchRate, payMethod, leaveBalance, leaveUsed2023..2026, leaveHistoryByYear, leaveEosExcess, isTerminated/term, terminationReason, lastDay, empType, excelCategory, excludeFromPayroll, workLocationIds, photoUrl, dependents (محلي فقط).
- **طلب الإجازة (`hr7_lvs`):** id, empId, type, from, to, days, notes, status (pending/approved/rejected), createdAt.
- **الحضور (`hr7_att`):** empId, date, checkIn, checkOut, status (present/late/remote/absent), late_minutes, early_minutes, hours, location, notes.
- **الموقع:** name, name_en, employer, type (office/remote), latitude, longitude, radius_m, active.
- **طلب سير العمل (سحابي):** id, request_type, payload, status, current_stage (manager/hr/ceo), employee, history.
- **صف المسير:** انظر 4.6 (أعمدة A..AW كما في ملف Excel).

---

## 6. تدفق الطلبات ومسارات الاعتماد بين البوابتين

### 6.1 المسار العام (نص الكود)
**«الموظف ← المدير المباشر ← الموارد البشرية ← الرئيس التنفيذي ← الموظف»**
- الحالات المعروضة للموظف: «بانتظار المدير المباشر»، «بانتظار الموارد البشرية»، «بانتظار الرئيس التنفيذي»، «موافق»، «مرفوض».
- المرحلة الحالية `current_stage` تُدار في الخادم. **أي مراحل تُتخطى لأي نوع طلب = منطق خادم غير ظاهر في الملفات — (يحتاج توضيح من موظف الموارد البشرية).**

### 6.2 من يرفع ماذا
| الطلب | من بوابة الموظف | من HR |
|---|---|---|
| إجازة (سنوية، مرضية، طارئة، وفاة، زواج، أبوة، أمومة، عمرة، حج، عن بعد، مهمة) | `ariba_submit_request` {from,to,days,notes} | تسجيل مباشر محلياً ثم `ariba_hr_record_leave` (يظهر في «طلباتي» لدى الموظف، **بدون** مسار اعتماد) |
| استئذان | {date,time,dur} | محلي |
| سلفة | {amount} | — |
| عمل إضافي | {date,hours,notes} | `ariba_hr_submit_overtime` |
| نسيان بصمة (`forgot_punch`) | {kind in/out/both, date ≤ اليوم, time, time2, notes} — **يذهب مباشرة للموارد البشرية**، وعند الموافقة يُسجَّل في الحضور تلقائياً | — |
| مستندات شخصية (هوية، جواز، شهادة، خبرة، تأمينات، عنوان وطني، سيرة) | رفع ≤ 12 ميجابايت | عرض |

### 6.3 الاعتماد
- **المدير/HR/الرئيس التنفيذي في تطبيق الموظف:** تبويب «الموافقات» (`ariba_staff_queue`) ← موافقة أو رفض (الرفض يتطلب سبباً) عبر `ariba_workflow_action`.
- **HR في البرنامج:** قائمة «الطلبات المعلقة» تُحدَّث كل 20 ثانية.
  - في مرحلة `hr`: موافقة/رفض عادي.
  - في أي مرحلة أخرى: «اعتماد نيابة عن المدير» مع سبب ← `ariba_hr_override_workflow` (ينقل للمرحلة التالية).
  - «اعتماد نهائي» (V116) ← `ariba_hr_final_approve` يعتمد كل المراحل المتبقية دفعة واحدة مع تسجيل ذلك.
  - السجل المحلي «الطلبات السابقة (قرارات الموارد البشرية)» يحفظ آخر 200 ويعرض 20.
- **الحذف (V124):** `ariba_delete_request`. حذف إجازة معتمدة يعيد الرصيد. حذف نسيان البصمة لا يحذف سجل الحضور الذي أُنشئ.
- **أثر اعتماد الإجازة السنوية محلياً:** يُخصم من `leaveBalance` ويُضاف إلى `leaveUsed<سنة>` (4.3.8).

### 6.4 النماذج المرسلة للموظف (V71)
HR يرسل (مباشرة عمل، استلام عهدة، تمديد تجربة، إنهاء تجربة) ← `ariba_hr_send_template` ← يظهر في تبويب «مستندات» لدى الموظف ← «موافقة» أو «اعتراض» بسبب ≥ 3 أحرف (`ariba_employee_ack_template`) ← تظهر الحالة في بطاقة HR «حالة النماذج المُرسلة للموظفين» (⏳ بانتظار الموظف / ✅ تمت الموافقة / ⚠️ معترَض عليه + السبب).

### 6.5 المسير والراتب
اعتماد المسير في HR ← `ariba_sync_payroll` (p_approved=true) ← يظهر للموظف في «الراتب» ككشف للشهر المعتمد (يتحدث كل 10 ثوانٍ). البيانات الأساسية للراتب في تطبيق الموظف من «ملف الموظف الرئيسي» في HR.

### 6.6 الحضور
الموظف يبصم (`ariba_attendance`) ← الخادم يتحقق من النطاق والساعات المرنة ويحسب التأخير ← HR يقرأ (`ariba_staff_attendance`، `ariba_hr_attendance_range`). HR يستطيع التسجيل اليدوي (`sAtt`، يُرفع بـ`ariba_sync_attendance`). إعدادات بداية الدوام والسماح والساعات المرنة تُرفع من HR للخادم.

### 6.7 الإشعارات
جرس في البوابتين (`ariba_my_notifications`) بأنواع: نموذج، طلب، موافقة، رفض؛ مع عداد و«تعليم الكل كمقروء».

### 6.8 مزامنة الموظفين
HR هو **المصدر**: يرفع بيانات الموظف (`ariba_sync_employee`) ويعيد الرفع القسري (`ariba_hr_force_sync`). السحب من السحابة إلى HR **معطّل عمداً** منذ V87 (اعتراض `fetch`). التخزين الأساسي لـ HR هو `localStorage` على جهاز المستخدم، لذا **بيانات HR تعتمد على المتصفح/الجهاز** — (يحتاج توضيح: هل يعمل HR من جهاز واحد فقط؟).

---

## 7. التصميم والهوية البصرية

### 7.1 ألوان الهوية (اريبا)
| اللون | الكود | الاستخدام |
|---|---|---|
| أخضر داكن | `#014D3D` | الشريط العلوي والجانبي، الأزرار الأساسية، أول لون في الرسوم |
| أخضر | `#29B35E` | النجاح، الأزرار الخضراء، ثاني لون في الرسوم |
| بيج | `#E4E4BC` | تمييز، تنبيه في الوضع الداكن |
| ورقي | `#F4F0E4` | خلفيات فاتحة |
| أسود | `#231F20` | نصوص |
| فحمي | `#202522` | بطاقات الوضع الداكن |
| رمادي | `#6B7280` / `#D6D3C7` | نصوص ثانوية وحدود |

### 7.2 برنامج HR — طبقات الألوان (الأخيرة تغلب)
1. `:root` الأصلي (السطر 74 في الأصل) ← `css/` أول ملف.
2. سمة الهوية (السطر 498) داكن/فاتح عبر `data-ariba-theme` (الافتراضي **داكن**، مفتاح `ariba_ui_theme`).
3. `brand-final-v41` ثم `cohesive-v42` (بـ`!important`).
4. لوحة V50 «Excel»: الفاتح كريمي `#F5F3EA` ونص `#1F2522` وشريط علوي/جانبي `#014D3D` بنص أبيض؛ الداكن خلفية `#171c19`، شريط علوي `#103f34`، جانبي `#202a26`، بطاقات `#202522`، حقول `#1d2521`، مؤشرات `#213b32`.
- **ألوان الرسوم:** الجنسيات (سعودي داكن، مصري أخضر، أردني بيج، سوداني `#D6D3C7`، سوري `#6B7280`، غيره `#E8ECEA`)؛ جهات العمل (اريبا داكن، الجيوميكانية أخضر، أوبتيموم بيج، غيرها `#D6D3C7`). يوجد لون مخصص بالاسم لـ«ليلى/ليليى» = `#014D3D`.
- **حالات الوثائق:** منتهي/≤30 يوماً أحمر، ≤90 أصفر، غير ذلك أخضر.

### 7.3 تطبيق الموظف
- اللوحة الأساسية (داكن كحلي): `--bg #0b0f1a`، `--c #1a2235`، `--bl #3b82f6`، `--gr #10b981`، `--rd #ef4444`، `--am #f59e0b`، `--tx #e2e8f0`.
- سمة V12 (تغلب): **الفاتح (الافتراضي)** `--bg #F4F0E6`، `--c #FFFDF8`، `--bl #014D3D`، `--gr #29B35E`، `--rd #B54A4A`، `--am #9B7A32`، `--tx #17201D`؛ **الداكن** `--bg #014D3D`، `--c #013D31`، `--c2 #075444`، `--bd #176A58`، أخضر `#29B35E`، أحمر `#F07A7A`، بيج `#E4E4BC`، نص أبيض. مفتاح `ariba_employee_theme`، وأزرار «ليلي/نهاري» واللغة في الرأس.
- PWA: `theme-color #0b0f1a`، العنوان «تطبيق الموظف - اريبا» / «ARIBA Employee».
- شريط تنقل سفلي: الرئيسية، الحضور، الإجازات، الراتب، فريقي، ملفي (+ الإضافي، الموافقات، المستندات حسب الدور).

### 7.4 الخطوط والمكونات
- الخط: **ARIBA Two** (Light/Medium/Bold) من `./fonts/ARIBA_TWO_*.ttf` — **الملفات غير موجودة في المجلد** فيرجع المتصفح للخط البديل؛ النماذج المطبوعة تحتوي الخطوط مضمّنة (base64) مع ترويسة وتذييل الشركة كصورة.
- حجم الخط الأساسي 13px في HR. الأيقونات: Tabler Icons 3.19. الرسوم: Chart.js 4.4.
- الاتجاه RTL (`dir="rtl"`) مع ترجمة إنجليزية جزئية (`ariba_ui_lang`).
- مكونات HR: شريط جانبي ثابت يمين بعرض 220px (`.sb`، `.ni`)، بطاقات `.card`، مؤشرات `.kpi`، شارات `.b` (bg/br/ba/bb/bp/bk/bc)، أزرار `.btn` (bpl أساسي، bgl أخضر، brl أحمر، bsm صغير)، شبكة نماذج `.fg`، نوافذ `.modal`، تنبيهات `.al`، إشعارات `.toast`، شارة الإصدار أسفل اليسار.
- الطباعة: نماذج A4 بترويسة الشركة؛ المخالصة تُصغَّر تلقائياً لتناسب صفحة واحدة (حتى 55%).

---

## 8. تقرير التحقق

### 8.1 الملفات الأصلية
لم تُعدَّل. البصمة (md5) قبل العمل وبعده متطابقة:
- `1_HR_…_V114 1.html` (15,009 سطراً) ← `27a11e07fa9bddf3c2ea268f50e71cf0`
- `2_EMPLOYEE_…_V114 2.html` (4,464 سطراً) ← `a3aa514f2330813c1e7efba3978b2fd9`

### 8.2 «كل سطر انتقل، لا شيء حُذف أو تكرر»
أداة `rebuild.py` تعيد تركيب الملف الأصلي من الملفات المقسمة: تستبدل كل `<link …href="css/…">` بمحتوى ملفه داخل `<style>` بنفس السمات، وكل `<script src="js/…">` بمحتواه داخل `<script>`، وتعيد دمج أجزاء السكربت الرئيسي.
| البوابة | النتيجة | ملفات مستخدمة | ملفات غير مستخدمة |
|---|---|---|---|
| HR | **مطابق بايت ببايت** | 168 | 0 |
| الموظف | **مطابق بايت ببايت** | 61 | 0 |

### 8.3 ترتيب التحميل
- كل سكربت في مكانه الأصلي بالضبط، بدون `defer` أو `async` أو `module`.
- أجزاء السكربت الرئيسي متتالية بلا فواصل.
- فحص `hoist.js` (acorn) يتأكد من أن أي دالة أو متغير على مستوى الملف لا يُستخدم قبل تعريفه بسبب التقسيم (`function` و`const`/`let`):
  - HR: 141 ملف JS، **0 مشاكل**.
  - الموظف: 47 ملفاً، **0 مشاكل**.

### 8.4 التشغيل الفعلي والمقارنة (Playwright / Chromium)
**بيئة الاختبار:**
- ساعة مثبتة على 2026-10-05 09:00 بتوقيت الرياض.
- **حجب كل اتصالات Supabase**، فلم يُرسل أي شيء للخادم الحقيقي.
- 3 موظفين تجريبيين (101/102/103).

**المقارنة:** النسخة الأصلية مقابل النسخة المقسمة على `http://localhost`.

| الفحص | HR | الموظف |
|---|---|---|
| DOM الشاشة الأولى | متطابق | متطابق |
| الأنماط المحسوبة | متطابقة (2,545 عنصراً) | متطابقة (103) |
| المتغيرات والدوال العامة (مع نص الدوال) | متطابقة (1,655) | متطابقة (1,325) |
| 13 صفحة: لوحة التحكم، الموظفون، الحضور، المواقع، الإجازات، المسير، كشف الراتب، نهاية الخدمة، المخالصة، المستندات، التقارير، الإعدادات | DOM وأنماط متطابقة | — |
| صفحة «النماذج» | فرق توقيت (انظر 8.5) | — |
| **مخرجات المعادلات** | **متطابقة** | **متطابقة** |
| رسائل الـ Console | فروق غير حتمية (انظر 8.5) | متطابقة |

**المعادلات التي قورنت مخرجاتها:**
- `calcEOS`
- `calcIns` لقاعدتي 2026 و2027 (سعودي يطابق، سعودي لا يطابق ≥55 مع سقف الأجر، غير سعودي)
- دفاتر الإجازات وأرصدتها وأيام العمل
- `addMonthsSafe`
- `buildPayrollRows` و`recalcRow` ومحرك `PAYX` لكل الأعمدة
- المخالصة لستة أسباب إنهاء
- صفحة نهاية الخدمة
- التفقيط

### 8.5 الفروق المتبقية وتفسيرها
1. **رسائل الـ Console في HR:** نص مسار الملف في رسائل الخطأ (`hr.html:LINE` مقابل `js/…/file.js:LINE`)، وفرق ±1 في عدد طلبات الشبكة المحجوبة حسب التوقيت.
2. **صفحة النماذج:** سمة `data-v114` تُضاف بمؤقت، فتختلف لحظة الالتقاط. الحجم متطابق (256,427 حرفاً).

**الدليل على أن الفرقين ليسا من التقسيم:** تشغيل **الأصلي مقابل الأصلي** (`rt_self.js`) أعطى نفس الفروق بالضبط، فهي عشوائية توقيت وليست اختلافاً في الكود.

### 8.6 ما لم يُتحقق منه
- **الموقع المنشور لم يُستعرض:**
  - رابط Netlify غير موجود في الملفات ولم يصل.
  - لم أُدخل كلمة المرور بنفسي التزاماً بقواعد الأمان.
  - لم يُنفذ أي إجراء على بيانات حقيقية، ولم يُتصل بقاعدة البيانات.
- **سلوك الخادم (دوال RPC) غير مختبر:** حُجب في الاختبار.
- **ملفات خارجية مفقودة في الأصل والمقسم معاً (ليست من التقسيم):**
  - `fonts/ARIBA_TWO_*.ttf`
  - `manifest.webmanifest`
  - `icons/icon-192.png`
  - `sw.js`
- **التشغيل:** يجب تشغيل النسخة المقسمة عبر خادم (`http://`)، مثل Netlify أو `python3 -m http.server`. فتحها مباشرة بـ `file://` قد يمنع بعض الموارد في بعض المتصفحات.

---

## 9. أسئلة لموظف الموارد البشرية (يحتاج توضيح)

### 9.1 الإجازات
1. **ترحيل 2024:** الكود يرحّل لعام 2024 **الفائض فوق 10 أيام** من رصيد نهاية 2023 (`close2023 − 10`)، بينما بقية السنوات ترحّل **10 أيام كحد أقصى**. هل هذا مقصود؟ (مثال: رصيد نهاية 2023 = 31 ← يُرحَّل 21.)
2. **الاستحقاق بعد 5 سنوات:** المحرك يستخدم `leaveDaysContract` (افتراضي 21) ولا يرفعه إلى 30 تلقائياً بعد 5 سنوات، بينما محرك المسير يحسب 30 يوماً بعد 5 سنوات. أيهما المعتمد؟
3. **أيام الطلب في تطبيق الموظف:** تستبعد العطلة الرسمية فقط إذا طابق يوم بدايتها، بينما HR يستبعد كل أيامها. وأي رقم هو المعتمد: الذي يحسبه التطبيق أم الخادم؟
4. **الرصيد الأولي للموظف الجديد:** 21 يوماً ثابتة (`leaveBalance:21`) قبل أول حساب. هل هذا صحيح؟
5. **الرصيد في تطبيق الموظف:** هل الرقم المعروض من الخادم (V112) مطابق دائماً لرقم HR؟

### 9.2 نهاية الخدمة والمخالصة
6. **وعاء المكافأة يختلف بين ثلاث شاشات:**
   - صفحة نهاية الخدمة = الأساسي + السكن.
   - المخالصة = الإجمالي كاملاً.
   - المسير = T (الأساسي + كل البدلات).

   أيها الصحيح؟
7. **الاستقالة القسرية (م.75/م.81):** تُحسب بالثلث/الثلثين في صفحة نهاية الخدمة والمخالصة، لكنها مكافأة كاملة في المسير. أيهما الصحيح؟
8. **حدود شرائح الاستقالة:** المسير يستخدم «حتى 5» و«حتى 10» شاملة (≤)، والحاسبات الأقدم «أقل من 5» و«أقل من 10». ما الحكم لمن خدم 5 سنوات بالضبط؟
9. **كسور الأيام في المسير:** تُقسم على 365 لمن خدم 5 سنوات فأكثر، وعلى 360 لمن خدم أقل. هل هذا مطابق لملف Excel المعتمد؟
10. **بدل الإجازة في المخالصة:** يُحسب = سنوات الخدمة × الاستحقاق − المأخوذ، وليس من دفتر الأرصدة السنوي. هل هذا مقصود؟
11. **التعويض في م.77:** يُحسب بالأكبر من (راتب شهرين) و(15 يوماً عن كل سنة). العقود محددة المدة (المتبقي من العقد) غير مغطاة. هل تحتاجونها؟
12. **راتب الفترة في المخالصة:** إن لم تُدخل أيام الحضور يُحتسب راتب شهر كامل. هل هذا صحيح؟
13. **مدة الخدمة في المسير:** إن لم يُكتب آخر يوم تُحسب حتى نهاية **العقد الأصلي** (تاريخ المباشرة + مدة العقد)، حتى لو جُدّد العقد. هل هذا صحيح؟

### 9.3 الرواتب والتأمينات
14. **وعاء التأمينات في المسير:** = الأساسي + 25% منه ثابتاً، بينما في بيانات الموظف وكشف الراتب = الأساسي + السكن الفعلي. أيهما المعتمد؟
15. **معنى «يطابق/لا يطابق»:** ما المقصود بالضبط؟ وهل النسب في الجدول (4.2.1) معتمدة من المحاسب؟
16. **عمر الموظف بلا تاريخ ميلاد:** يُعتبر 30 في الحسبة العامة، و0 في المسير. هل يجب إلزام إدخال تاريخ الميلاد؟
17. **الاستقطاعات في كشف الراتب:** يُعرض إما «استقطاعات أخرى» أو «السلف» وليس مجموعهما. هل هذا خطأ؟
18. **سعر صرف الدولار:** 3.755 في مكان و3.75 في مكان آخر. ما المعتمد؟
19. **الإعفاء التلقائي من التأمينات (V130):** يعتمد على كلمات في المسمى أو جهة العمل (تمهير، استشاري، متدرب، تدريب). هل القائمة كاملة؟
20. **بدل المشروع:** غير مشمول في إجمالي خطاب تعريف الراتب. هل هذا مقصود؟
21. **المسير القديم:** يحسب بأسعار اليوم وليس بتاريخ الشهر. هل ما زال مستخدماً أم يُكتفى بـ V119؟

### 9.4 الحضور والمواقع
22. **نطاق البصمة:** الحفظ يفرض 1000 متر لكل موقع، والواجهة تقول 50–5000 (افتراضي 200). ما النطاق المطلوب؟
23. **وقت نهاية الدوام:** مكتوب ثابتاً 16:00 في سجل HR الأساسي، و15:45 في التطبيق القديم، بينما الخادم يحسب حسب الإعدادات. هل يمكن الاعتماد كلياً على الخادم؟
24. **الغياب:** أي يوم عمل بدون بصمة ولا إجازة معتمدة = غائب، حتى لمن عمله «عن بعد» دون طلب. هل هذا صحيح؟
25. **الساعات:** لا تُحسب ساعات الجلسات المغلقة تلقائياً. هل هذا صحيح؟

### 9.5 الموظفون والبيانات
26. **أسماء مكتوبة حرفياً داخل الكود:**
   - «عبد الله المصرياني» مستبعد.
   - «وسيم بن محمد صالح بن كريم» منتهي الخدمة قسرياً.
   - «البوصيري» مستبعد من المسير والتقارير.
   - «زينب محمد شاكر» عقدها مجدد حتى 2027-08-18.
   - التوقيعات: عبد الله العنبر / مطر المطر / حسام الحوراني.

   هل ما زالت صحيحة؟ وهل تُنقل لإعدادات بدل الكود؟
27. **دمج الجهات (V121):** دُمجت «الجيوميكانية» في «اريبا». هل هذا نهائي؟
28. **المرافقون (التابعون):** محفوظون على الجهاز فقط وليس في السحابة. هل هذا مقبول؟
29. **إعداد «نظام العمل» في الإعدادات:** ليس له أي أثر في الحسابات. هل يُحذف أم يُفعّل؟
30. **تحديد الجنس:** في لوحة التحكم يعتمد على قائمة أسماء أنثوية إن لم يُعبأ حقل الجنس. هل نلزم تعبئة الحقل؟
31. **كلمة المرور الافتراضية:** = آخر 4 أرقام من الهوية. هل هذا مقبول أمنياً؟
32. **بيانات HR محلية:** بيانات HR الأساسية في `localStorage`، أي على جهاز واحد. هل يعمل الموظف من أكثر من جهاز؟

### 9.6 سير العمل
33. **مراحل الاعتماد:** ما المراحل لكل نوع طلب؟ هل كل الطلبات تمر على الرئيس التنفيذي؟
34. **الاعتماد النهائي من HR:** «الاعتماد النهائي» يتخطى المدير والرئيس التنفيذي. من له هذه الصلاحية؟
35. **الإجازات المسجلة من HR:** لا تمر بمسار الاعتماد. هل هذا مقصود؟
