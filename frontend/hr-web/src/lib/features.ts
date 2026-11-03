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

const ui = (ar: string, en: string): Feature => ({ status: "ui", waits: { ar, en } });
const backend = (ar: string, en: string): Feature => ({ status: "backend", waits: { ar, en } });

export const FEATURES = {
  // ---- the design's menu entries that we did not have (Phase 2c ports the `ui` ones) ----
  cand: backend("مرحلة المرشحين وصفحة التقديم العامة", "the candidates and public application-page stage"),
  bizc: backend("مرحلة بطاقات العمل", "the business-cards stage"),
  ann: ui("نقل شاشة الإعلانات (المرحلة 2c)", "porting the announcements screen (Phase 2c)"),
  goals: ui("نقل شاشة المستهدفات (المرحلة 2c)", "porting the targets screen (Phase 2c)"),
  eval: ui("نقل شاشة التقييم (المرحلة 2c)", "porting the evaluation screen (Phase 2c)"),
  team: ui("نقل شاشة توفر الفريق والمهام (المرحلة 2c)", "porting the team & tasks screen (Phase 2c)"),
  insc: ui("نقل حاسبة التأمينات (المرحلة 2c)", "porting the insurance calculator (Phase 2c)"),
  salcalc: ui("نقل حاسبة الراتب (المرحلة 2c)", "porting the salary calculator (Phase 2c)"),
  taxcalc: ui("نقل حاسبة الضريبة (المرحلة 2c)", "porting the tax calculator (Phase 2c)"),
  wps: ui("نقل ملف تحويل الرواتب (المرحلة 2c)", "porting the salary transfer file (Phase 2c)"),
  prov: ui("نقل تقرير المخصصات (المرحلة 2c)", "porting the provisions report (Phase 2c)"),
  assets: backend("مرحلة الأصول والعهد", "the assets and custody stage"),
  audit: backend("مرحلة عارض سجل التعديلات", "the audit-log viewer stage"),
  bin: backend("مرحلة سلة المهملات", "the recycle-bin stage"),
  // ---- buttons inside existing screens (Phase 2b) ----
  /** employees list: delete an employee (the design archives it to the recycle bin) */
  empDelete: backend("مرحلة سلة المهملات", "the recycle-bin stage"),
  /** employees list: import employees from an Excel file */
  empImport: ui("نقل شاشة الاستيراد من Excel (المرحلة 2c)", "porting the Excel import screen (Phase 2c)"),
  /** documents: the design's national-address and GOSI-certificate tabs (our registry does not return them yet) */
  docsNationalAddress: backend("إضافة حقل العنوان الوطني إلى سجل الوثائق", "adding the national address to the documents registry"),
  docsGosiCert: backend("إضافة حقل شهادة التأمينات إلى سجل الوثائق", "adding the GOSI certificate to the documents registry"),
  /** reports: the design's custom-report builder, certificates report and comprehensive leave report */
  reportCustom: ui("نقل منشئ التقارير المخصص (المرحلة 2c)", "porting the custom report builder (Phase 2c)"),
  reportCerts: backend("مسار يجمع وثائق كل الموظفين (سجل الشهادات)", "a route listing every employee's documents (certificates)"),
  reportLeaves: ui("نقل تقرير الإجازات الشامل (المرحلة 2c)", "porting the comprehensive leave report (Phase 2c)"),
  /** templates: the design's job-offer letter for a candidate (a printed document, no backend) */
  templatesOffer: ui("نقل خطاب العرض الوظيفي (المرحلة 2c)", "porting the job-offer letter (Phase 2c)"),
  // ---- shell features of the design ----
  /** the design's per-section "recent changes" strip above every page */
  sectionAudit: backend("مرحلة عارض سجل التعديلات", "the audit-log viewer stage"),
  /** the design registers new applicants as employees automatically while HR has the portal open */
  candidateAuto: backend("مرحلة المرشحين", "the candidates stage"),
  /** fingerprint / Face ID sign-in on the web (WebAuthn); not in the owner's list of stages yet */
  biometric: backend("مرحلة الدخول بالبصمة (WebAuthn) — لم تُجدول بعد", "a WebAuthn sign-in stage (not scheduled yet)"),
  /** sending an export by e-mail; e-mail stays off until a sender is approved (FOLLOW_UPS #7) */
  exportEmail: backend("تفعيل إرسال البريد", "e-mail sending being switched on"),
  /** the stamp / signature overlay on an exported PDF (the design's seal studio) */
  exportSeal: ui("نقل استوديو الختم مع شاشة النماذج (المرحلة 2b)", "porting the seal studio with the templates screen (Phase 2b)"),
  /** the daily automatic greetings run, which our /occasions/run-auto already serves (HR only, switch off) */
  occasionsAuto: { status: "ready" } as Feature,
  /** the notification bell in the top bar */
  bell: { status: "ready" } as Feature,
  /** «نسيت كلمة المرور؟» on the sign-in screen: /auth/password-recovery comes with Stage 8 */
  passwordRecovery: { status: "ready" } as Feature,
} satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

export const isReady = (id: FeatureId) => FEATURES[id].status === "ready";
