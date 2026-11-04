// What of the updated design is switched on, and what waits — the ONE list (docs/DESIGN_PORT.md, owner
// decision 1). A screen or shell feature is either `ready`, or waits for a hr-web step (`ui`: the screen is
// still to be ported, our API already serves it) or for its own backend stage (`backend`). Turning one on is
// a one-word change here once its step is done; nothing else hides it.

export type FeatureStatus = "ready" | "ui" | "backend";

export interface Feature {
  status: FeatureStatus;
  /** what it waits for, shown on the "not available yet" screen */
  waits?: { ar: string; en: string };
}

const backend = (ar: string, en: string): Feature => ({ status: "backend", waits: { ar, en } });

// Every entry is `ready` or waits for its own backend stage now: the `ui` status stays in the type for a
// screen ported later, but nothing in this list waits for hr-web work any more (Phase 2c closed the last one,
// `exportSeal`, with the seal studio).

export const FEATURES = {
  // ---- the design's menu entries that we did not have (Phase 3 wires the last four: audit, bin, candidates,
  // business cards — their screens and routes are in `backend/app/routers/{audit_log,recycle_bin,candidates,
  // bizcards}.py` and `src/lib/{audit,bin,candidates,bizcards}.ts`) ----
  cand: { status: "ready" } as Feature,
  bizc: { status: "ready" } as Feature,
  ann: { status: "ready" } as Feature,
  /** announcements: HR's own wording for the automatic birthday / anniversary greetings, and {name} per employee */
  annTemplates: backend("نصوص التهاني التلقائية وإدراج اسم كل موظف", "custom greeting texts and each employee's name in a greeting"),
  goals: { status: "ready" } as Feature,
  eval: { status: "ready" } as Feature,
  /** evaluation: HR writes an evaluation (owner decision b; its own backend stage, rules first) */
  evalHrWrite: backend("مرحلة «الموارد البشرية تكتب التقييم»", "the HR-writes-evaluations stage"),
  team: { status: "ready" } as Feature,
  insc: { status: "ready" } as Feature,
  salcalc: { status: "ready" } as Feature,
  taxcalc: { status: "ready" } as Feature,
  wps: { status: "ready" } as Feature,
  prov: { status: "ready" } as Feature,
  assets: backend("مرحلة الأصول والعهد", "the assets and custody stage"),
  audit: { status: "ready" } as Feature,
  bin: { status: "ready" } as Feature,
  // ---- buttons inside existing screens (Phase 2b) ----
  /** employees list: delete an employee (the design archives it to the recycle bin; the bin screen exists, the
   *  `DELETE /employees/{id}` route that would put a row in it does not yet) */
  empDelete: backend("مسار حذف موظف إلى سلة المهملات", "a delete-employee route that archives to the recycle bin"),
  /** employees list: import employees from an Excel file */
  empImport: { status: "ready" } as Feature,
  /** documents: the design's national-address and GOSI-certificate tabs (our registry does not return them yet) */
  docsNationalAddress: backend("إضافة حقل العنوان الوطني إلى سجل الوثائق", "adding the national address to the documents registry"),
  docsGosiCert: backend("إضافة حقل شهادة التأمينات إلى سجل الوثائق", "adding the GOSI certificate to the documents registry"),
  /** reports: the design's custom-report builder, certificates report and comprehensive leave report */
  reportCustom: { status: "ready" } as Feature,
  reportCerts: backend("مسار يجمع وثائق كل الموظفين (سجل الشهادات)", "a route listing every employee's documents (certificates)"),
  reportLeaves: { status: "ready" } as Feature,
  /** templates: the design's job-offer letter for a candidate (a printed document, no backend) */
  templatesOffer: { status: "ready" } as Feature,
  /** attendance: the design's shift schedule (official / Ramadan hours) behind lateness, required hours and the shift column */
  attSchedule: backend("مرحلة الساعات المرنة ودوام رمضان", "the flexible-hours / Ramadan stage"),
  /** leaves: HR returns a request to the direct manager with a note (the design's hr_return_to_manager) */
  lvReturn: backend("مرحلة إجراءات الإجازات الإضافية للموارد البشرية", "the more-HR-leave-actions stage"),
  /** leaves: HR cancels an approved leave, keeps it as «ملغاة» and returns its days (hr_leave_cancel) */
  lvCancel: backend("مرحلة إجراءات الإجازات الإضافية للموارد البشرية", "the more-HR-leave-actions stage"),
  /** leaves: undo the last balance save (the design keeps the last ten saves) */
  lvBalanceUndo: backend("مرحلة إجراءات الإجازات الإضافية للموارد البشرية", "the more-HR-leave-actions stage"),
  /** payroll: HR prepares the month and sends it to finance, who approves (the design's prepare / status steps) */
  payPrepare: backend("مرحلة تجهيز المسير للمالية (حالة المسير: مسودة ← جاهز ← معتمد)", "the payroll prepare-for-finance stage (draft → prepared → approved)"),
  /** employee form: a certificate with its type, title, issuer and dates (the design's EmpCerts; needs document metadata) */
  empCerts: backend("إضافة اسم الشهادة وجهتها وتواريخها إلى الوثائق", "adding certificate title, issuer and dates to documents"),
  /** employee form: a per-employee probation period or end date */
  empProbation: backend("حقل فترة التجربة لكل موظف", "a per-employee probation field"),
  /** employee form: an allowance kept as a percentage of the basic salary */
  empAllowPct: backend("حفظ البدل كنسبة من الأساسي", "storing an allowance as a percentage of basic"),
  /** employee form: the accounts still on a default / temporary password (owner decision a) */
  pwDefaultList: backend("مرحلة «الحسابات بكلمة مرور مؤقتة»", "the accounts-on-a-temporary-password stage"),
  // ---- settings cards of the design whose backend stage is not done (Phase 2b) ----
  /** HR saves the brand colours (owner decision c: a plain colour picker with the design's presets) */
  brandColors: backend("مرحلة حفظ ألوان الهوية", "the brand-colours save stage"),
  /** uploading the letterhead header / footer images */
  letterhead: backend("حفظ صور الترويسة والتذييل على الخادم", "storing the letterhead images on the server"),
  /** the carry cap, accrual method and special-type entitlements */
  leaveRules: backend("إعدادات قواعد الإجازات على الخادم", "leave-rule settings on the server"),
  /** the image behind the employee app's punch button */
  punchLogo: backend("حفظ شعار زر البصمة وقراءته في تطبيق الموظف", "storing the punch-button logo and reading it in the employee app"),
  /** per-type approvers, escalation deadlines and approval circles */
  wfConfig: backend("مرحلة إجراءات الإجازات الإضافية للموارد البشرية", "the more-HR-leave-actions stage"),
  /** mail account settings (saved without the password, sending stays off) */
  mailSettings: backend("مرحلة إعدادات البريد (حفظ فقط)", "the mail-settings stage (save only)"),
  /** the daily expiry-alerts run */
  expiryAlerts: backend("مرحلة تنبيهات الانتهاء", "the expiry-alerts stage"),
  /** the editable role × page permission matrix */
  rolesMatrix: backend("مرحلة مصفوفة الأدوار والصلاحيات", "the roles and permissions matrix stage"),
  // ---- shell features of the design ----
  /** the design's per-section «recent changes» strip above every page (the log itself is ready at /audit-log) */
  sectionAudit: backend("شريط «آخر التعديلات» أعلى كل صفحة", "the per-section recent-changes strip"),
  /** the design registers new applicants as employees automatically while HR has the portal open */
  candidateAuto: backend("التسجيل التلقائي للمرشحين كموظفين", "automatic registration of applicants as employees"),
  /** fingerprint / Face ID sign-in on the web (WebAuthn); not in the owner's list of stages yet */
  biometric: backend("مرحلة الدخول بالبصمة (WebAuthn) — لم تُجدول بعد", "a WebAuthn sign-in stage (not scheduled yet)"),
  /** sending an export by e-mail; e-mail stays off until a sender is approved (FOLLOW_UPS #7) */
  exportEmail: backend("تفعيل إرسال البريد", "e-mail sending being switched on"),
  /** the stamp / signature overlay on an exported PDF (the design's seal studio, Phase 2c) */
  exportSeal: { status: "ready" } as Feature,
  /** the daily automatic greetings run, which our /occasions/run-auto already serves (HR only, switch off) */
  occasionsAuto: { status: "ready" } as Feature,
  /** the notification bell in the top bar */
  bell: { status: "ready" } as Feature,
  /** «نسيت كلمة المرور؟» on the sign-in screen: /auth/password-recovery comes with Stage 8 */
  passwordRecovery: { status: "ready" } as Feature,
} satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

export const isReady = (id: FeatureId) => FEATURES[id].status === "ready";
