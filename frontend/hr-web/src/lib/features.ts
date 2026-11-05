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
  annTemplates: { status: "ready" } as Feature,
  goals: { status: "ready" } as Feature,
  eval: { status: "ready" } as Feature,
  /** evaluation: HR writes an evaluation (owner decision b; its own backend stage, rules first) */
  evalHrWrite: { status: "ready" } as Feature,
  team: { status: "ready" } as Feature,
  insc: { status: "ready" } as Feature,
  salcalc: { status: "ready" } as Feature,
  taxcalc: { status: "ready" } as Feature,
  wps: { status: "ready" } as Feature,
  prov: { status: "ready" } as Feature,
  /** Stage 10: `backend/app/routers/assets.py` (backend-new-ui) + the assets page and the employee form's custody tab */
  assets: { status: "ready" } as Feature,
  audit: { status: "ready" } as Feature,
  bin: { status: "ready" } as Feature,
  // ---- buttons inside existing screens (Phase 2b) ----
  /** employees list: delete an employee (the design archives it to the recycle bin; the bin screen exists, the
   *  `DELETE /employees/{id}` route that would put a row in it does not yet) */
  empDelete: { status: "ready" } as Feature,
  /** employees list: import employees from an Excel file */
  empImport: { status: "ready" } as Feature,
  /** documents: the design's national-address and GOSI-certificate tabs (our registry does not return them yet) */
  docsNationalAddress: { status: "ready" } as Feature,
  docsGosiCert: { status: "ready" } as Feature,
  /** reports: the design's custom-report builder, certificates report and comprehensive leave report */
  reportCustom: { status: "ready" } as Feature,
  reportCerts: { status: "ready" } as Feature,
  reportLeaves: { status: "ready" } as Feature,
  /** templates: the design's job-offer letter for a candidate (a printed document, no backend) */
  templatesOffer: { status: "ready" } as Feature,
  /** attendance: the design's shift schedule (official / Ramadan hours) behind lateness, required hours and the shift
   *  column — Stage 20 (`backend/app/services/schedule.py`, GET/PUT /settings/schedule, components/hr/schedule-settings.tsx) */
  attSchedule: { status: "ready" } as Feature,
  /** leaves: HR returns a request to the direct manager with a note (the design's hr_return_to_manager) */
  lvReturn: { status: "ready" } as Feature,
  /** leaves: HR cancels an approved leave, keeps it as «ملغاة» and returns its days (hr_leave_cancel) */
  lvCancel: { status: "ready" } as Feature,
  /** leaves: undo the last balance save (the design keeps the last ten saves) */
  lvBalanceUndo: { status: "ready" } as Feature,
  /** payroll: HR prepares the month and sends it to finance, who approves (the design's prepare / status steps) */
  payPrepare: { status: "ready" } as Feature,
  /** employee form: a certificate with its type, title, issuer and dates (the design's EmpCerts; needs document metadata) */
  empCerts: { status: "ready" } as Feature,
  /** employee form: a per-employee probation period or end date */
  empProbation: { status: "ready" } as Feature,
  /** employee form: an allowance kept as a percentage of the basic salary */
  empAllowPct: { status: "ready" } as Feature,
  /** employee form: the accounts still on a default / temporary password (owner decision a) */
  pwDefaultList: { status: "ready" } as Feature,
  // ---- settings cards of the design whose backend stage is not done (Phase 2b) ----
  /** HR saves the brand colours (owner decision c: a plain colour picker with the design's presets) */
  brandColors: { status: "ready" } as Feature,
  /** uploading the letterhead header / footer images */
  letterhead: { status: "ready" } as Feature,
  /** the carry cap, accrual method and special-type entitlements — Stage 20 (`services/leave_rules.py`,
   *  GET/PUT /settings/leave-rules, the LeaveRulesCard in components/hr/leave-settings.tsx) */
  leaveRules: { status: "ready" } as Feature,
  /** the image behind the employee app's punch button */
  punchLogo: { status: "ready" } as Feature,
  /** per-type approvers, escalation deadlines and approval circles */
  wfConfig: { status: "ready" } as Feature,
  /** mail account settings (saved without the password, sending stays off) */
  mailSettings: { status: "ready" } as Feature,
  /** the daily expiry-alerts run */
  expiryAlerts: { status: "ready" } as Feature,
  /** the editable role × page permission matrix */
  /** Stage 11: `backend/app/routers/permissions.py` + components/hr/perms-card.tsx and lib/permissions.ts */
  rolesMatrix: { status: "ready" } as Feature,
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
  /** «نسيت كلمة المرور؟» on the sign-in screen: /auth/password-recovery comes with Stage 8, parked on the
   *  `stage-8-on-hold` branch (owner, 4 Nov 2026) until e-mail can be sent */
  passwordRecovery: backend("استعادة كلمة المرور (المرحلة 8، موقوفة حتى تفعيل البريد)", "password recovery (Stage 8, on hold until e-mail is switched on)"),
} satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

export const isReady = (id: FeatureId) => FEATURES[id].status === "ready";
