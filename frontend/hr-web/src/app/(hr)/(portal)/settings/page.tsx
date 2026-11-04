"use client";

// Settings (الإعدادات) in the updated design's form (its pages/settings/index.jsx): ten numbered sections that open
// and close (remembered in this browser), a search that hides the cards without the text, and the design's cards in
// its order. Our cards keep their behaviour: company (+ attendance sync), logo, flexible hours, signer and stamp, GOSI
// rates, payroll exclusion, notification links, lists, roles, passwords. Added on OUR Stage 2/5/6 routes: manager
// permissions with the team-salary switch, document signing, push. Every design card whose backend stage is not done
// shows what it waits for (lib/features.ts). Editing for HR and admin; everyone else sees the page read-only.
import { useCallback, useEffect, useRef, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { PasswordDialog } from "@/components/common/password-dialog";
import { PasswordReveal } from "@/components/hr/password-reveal";
import { useToast } from "@/components/common/toast";
import { request } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FEATURES, type FeatureId } from "@/lib/features";
import { useLocale } from "@/lib/i18n/locale";
import { accountForEmployee, createAccount, issueTemporaryPassword } from "@/lib/auth";
import { getLookups, listAllEmployees } from "@/lib/employees";
import type { EmployeeListItem, Lookups } from "@/lib/api";
import { getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import {
  addListItem,
  getAppLinks,
  getAttendanceSettings,
  getCompany,
  getGosi,
  getSheet,
  GOSI_KEYS,
  listAccounts,
  putAppLinks,
  putAttendanceSettings,
  putCompany,
  putGosi,
  putSheet,
  removeListItem,
  setPayrollExclusion,
  setRole,
  type Account,
  type AppLinks,
  type AttendanceSettings,
  type Company,
  type GosiSettings,
} from "@/lib/settings";
import { DateField, TimeField } from "@/components/common/date-time-field";

const ROLE_LABELS: Record<string, string> = {
  employee: "موظف عادي",
  manager: "مدير",
  finance: "مالية",
  hr: "موارد بشرية",
  ceo: "رئيس تنفيذي",
  admin: "مدير عام (كل الصلاحيات)",
};
const GOSI_HEAD = ["يطابق أقل من العمر", "يطابق العمر فأكثر", "شركة يطابق أقل", "شركة يطابق فأكثر", "لا يطابق موظف أقل", "لا يطابق موظف فأكثر", "لا يطابق شركة أقل", "لا يطابق شركة فأكثر", "غير سعودي شركة"];
const hhmm = (t: string) => (t || "").slice(0, 5);
const card: React.CSSProperties = { marginTop: 12, maxWidth: 1200 };

function readImage(file: File, maxW: number): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("تعذر قراءة الصورة"));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error("تعذر قراءة الصورة"));
      im.onload = () => {
        const sc = Math.min(1, maxW / im.width);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * sc));
        c.height = Math.max(1, Math.round(im.height * sc));
        c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/png"));
      };
      im.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

export default function Page() {
  const toast = useToast();
  const { hasRole } = useAuth();
  const ro = !hasRole("hr", "admin");
  const [company, setCompany] = useState<Company | null>(null);
  const [att, setAtt] = useState<AttendanceSettings | null>(null);
  const [gosi, setGosi] = useState<GosiSettings | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [basis, setBasis] = useState<SalaryBasisRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [links, setLinks] = useState<AppLinks | null>(null);
  const [signer, setSigner] = useState<{ name_ar: string; title_ar: string; title_en: string; signature: string | null; stamp: string | null }>({
    name_ar: "عبد الله العنبر",
    title_ar: "مدير الموارد البشرية",
    title_en: "HR Manager",
    signature: null,
    stamp: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getCompany(),
      getAttendanceSettings(),
      getGosi(),
      getLookups(),
      listAllEmployees({ tab: "active", sort: "name_ar" }),
      getSalaryBasis(),
      listAccounts(),
      getSheet<string>("company_logo").catch(() => ({ data: null })),
      getSheet<typeof signer>("hr_signer").catch(() => ({ data: null })),
      getAppLinks(),
    ])
      .then(([c, a, g, l, p, b, acc, lg, sg, al]) => {
        if (!alive) return;
        setCompany(c);
        setAtt(a);
        setGosi(g);
        setLookups(l);
        setEmps(p.items);
        setBasis(b);
        setAccounts(acc);
        setLogo(lg.data);
        setLinks(al);
        if (sg.data) setSigner((s) => ({ ...s, ...sg.data }));
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [tick]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok, "ok");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  };

  if (!company || !att || !gosi || !lookups)
    return (
      <div className="pg on" id="pg-set">
        <PageState loading={!error} error={error} onRetry={reload} />
      </div>
    );

  const W = (icon: string, title: string, en: string, what: [string, string], id: FeatureId, key: string) => <WaitCard key={key} icon={icon} title={title} en={en} what={what} id={id} />;
  const sections: Record<string, React.ReactNode[]> = {
    company: [
      <CompanyCard key="co" company={company} att={att} run={run} />,
      <LogoCard key="lg" logo={logo} run={run} />,
      W("ti-palette", "ألوان الهوية", "Brand colours", ["لوحة ألوان البوابة وتطبيق الموظف، مع ألوان التصميم الجاهزة (أخضر، أزرق، بني، بنفسجي، فيروزي، رمادي).", "The portal and employee-app colours, with the design's presets (green, blue, brown, purple, teal, slate)."], "brandColors", "br"),
    ],
    print: [
      W("ti-file-text", "الورق الرسمي (الترويسة والتذييل)", "Letterhead (header and footer)", ["رفع صورة الترويسة والتذييل للمطبوعات الرسمية بدل الصور الحالية.", "Upload the header and footer images used on official prints, replacing the current ones."], "letterhead", "lh"),
      <SignerCard key={"hs" + JSON.stringify(signer).length + signer.name_ar} signer={signer} emps={emps} run={run} />,
    ],
    att: [
      W("ti-calendar-time", "جدول الدوام (رسمي + رمضان)", "Working schedule (official + Ramadan)", ["الحضور يتحسب على الجدول المُطبَّق: الدوام الرسمي في الأيام العادية، ودوام رمضان تلقائياً مع دخول رمضان.", "Attendance is calculated on the applied schedule: official hours normally, Ramadan hours automatically during Ramadan."], "attSchedule", "sc"),
      <FlexCard key={"fx" + JSON.stringify(att)} att={att} run={run} />,
    ],
    leave: [
      W("ti-arrow-back-up", "سياسة الإجازات (إلغاء الإجازة المعتمدة)", "Leave policy (cancelling an approved leave)", ["هل تقدر الموارد البشرية تلغي إجازة معتمدة وترجع رصيدها.", "Whether HR may cancel an approved leave and return its days."], "lvCancel", "lpol"),
      W("ti-calendar-repeat", "ترحيل الرصيد وطريقة الاستحقاق والاستحقاقات الخاصة", "Carry-over, accrual method and special entitlements", ["حد الترحيل للسنة التالية، طريقة احتساب الاستحقاق (تقويمي / أيام عمل / شهري)، واستحقاق الاستشاري والتمهير والتدريب. الحالي: 21 يومًا، أيام العمل، ترحيل 10 أيام.", "The carry cap, the accrual method (calendar / working days / monthly) and the entitlement of consultants, Tamheer and trainees. Today: 21 days, working days, 10 days carried."], "leaveRules", "lc"),
    ],
    app: [
      W("ti-palette", "ألوان تطبيق الموظف", "Employee-app colours", ["ألوان تطبيق الموظف من نفس لوحة الهوية.", "The employee app's colours, from the same brand palette."], "brandColors", "brapp"),
      W("ti-fingerprint", "شعار خلف زر البصمة (تطبيق الموظف)", "Logo behind the punch button (employee app)", ["صورة باهتة خلف دائرة الحضور والانصراف بشفافية تختارها.", "A faint image behind the check-in circle, with an opacity you choose."], "punchLogo", "pw"),
      W("ti-route", "مسار اعتماد الطلبات ودوائر الاعتماد", "Request workflow and approval circles", ["من يعتمد كل نوع طلب، المهلة قبل التصعيد، ودوائر الاعتماد المتعددة.", "Who approves each request type, the escalation deadline, and multi-step approval circles."], "wfConfig", "wf"),
      <DocSignCard key="ds" run={run} />,
      <PushCard key="push" run={run} />,
    ],
    fin: [
      <GosiCard key={"ins" + JSON.stringify(gosi)} initial={gosi} run={run} />,
      <ExclusionCard key="ex" basis={basis} run={run} />,
    ],
    mail: [
      W("ti-mail-cog", "حسابات البريد (الشخصي والشركة)", "Mail accounts (personal and company)", ["حفظ بيانات حساب البريد (الخادم، المنفذ، المستخدم، المرسل) بدون كلمة المرور؛ الإرسال يظل متوقفًا.", "Saving the mail account (host, port, user, sender) without the password; sending stays off."], "mailSettings", "mm"),
      <AppLinksCard key={"al" + JSON.stringify(links)} initial={links} run={run} />,
      W("ti-send", "طريقة الإرسال", "Sending mode", ["إرسال التقارير والإشعارات بالبريد.", "Sending reports and notifications by e-mail."], "exportEmail", "mo"),
    ],
    lists: [<ListsCard key="ml" lookups={lookups} run={run} />],
    alerts: [
      W("ti-bell-ringing", "تنبيهات انتهاء الوثائق", "Document-expiry alerts", ["فحص يومي لانتهاء الإقامات والجوازات والعقود والتأمين، ومن يستلم التنبيه وقبلها بكم يوم.", "A daily check of expiring iqamas, passports, contracts and insurance, who receives it and how many days before."], "expiryAlerts", "alr"),
    ],
    access: [
      <PasswordsCard key="pwd" emps={emps} />,
      W("ti-user-plus", "صفحة التقديم العامة للوظائف", "Public job-application page", ["تشغيل وإيقاف صفحة التقديم وتغيير رابطها.", "Switching the application page on or off and rotating its link."], "cand", "apl"),
      W("ti-shield-lock", "مصفوفة الصلاحيات حسب الدور", "Permission matrix by role", ["تحديد ما يراه ويعدّله كل دور في كل صفحة.", "Setting what each role may see and change on every page."], "rolesMatrix", "pm"),
      <RolesCard key="rl" emps={emps} accounts={accounts} run={run} />,
      <ManagerPermsCard key="mp" run={run} />,
    ],
  };

  return (
    <div className="pg on" id="pg-set">
      <Organizer sections={sections} ro={ro} />
    </div>
  );
}

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

// روابط الإشعارات: أيميل الجرس بيوجّه الموارد البشرية لبوابة HR وباقي الموظفين لتطبيق الموظف.
function AppLinksCard({ initial, run }: { initial: AppLinks | null; run: Run }) {
  const [form, setForm] = useState<{ hr: string; emp: string; fallback: string }>(
    initial ?? { hr: "", emp: "", fallback: "" },
  );
  return (
    <div className="card" style={{ ...card, maxWidth: 900 }}>
      <div className="ct" style={{ marginBottom: 12 }}>
        <i className="ti ti-link" /> <span>روابط الإشعارات</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8 }}>
        الروابط التي تُرسل داخل إيميلات الإشعارات: الموارد البشرية تستلم رابط بوابة HR، وباقي الموظفين رابط تطبيق الموظف.
        اتركها فارغة لاستخدام الرابط الافتراضي{form.fallback ? ` (${form.fallback})` : ""}.
      </div>
      <div className="fg">
        <div>
          <label>رابط بوابة الموارد البشرية</label>
          <input
            id="AL_HR"
            value={form.hr}
            placeholder={form.fallback}
            onChange={(e) => setForm({ ...form, hr: e.target.value })}
          />
        </div>
        <div>
          <label>رابط تطبيق الموظف</label>
          <input
            id="AL_EMP"
            value={form.emp}
            placeholder={form.fallback}
            onChange={(e) => setForm({ ...form, emp: e.target.value })}
          />
        </div>
      </div>
      <button
        type="button"
        className="btn bpl"
        style={{ marginTop: 12 }}
        onClick={() => run(() => putAppLinks({ hr: form.hr, emp: form.emp }), "تم حفظ الروابط")}
      >
        <i className="ti ti-check" /> <span>حفظ</span>
      </button>
    </div>
  );
}

function ListsCard({ lookups, run }: { lookups: Lookups; run: Run }) {
  const [dep, setDep] = useState("");
  const [wp, setWp] = useState("");
  const list = (kind: "workplaces" | "departments", items: { id: string; name_ar: string }[]) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {items.map((x) => (
        <span key={x.id} className="b bb" style={{ fontSize: 11, display: "inline-flex", gap: 6, alignItems: "center" }}>
          {x.name_ar}
          <button type="button" onClick={() => window.confirm(`حذف "${x.name_ar}"؟`) && run(() => removeListItem(kind, x.id), "تم الحذف")} style={{ background: "none", border: "none", color: "var(--rd)", cursor: "pointer" }}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
  return (
    <div className="card" style={{ ...card, maxWidth: 900 }}>
      <div className="ct" style={{ marginBottom: 10 }}>إدارة الأقسام وجهات العمل</div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 10 }}>أضف أي قسم أو جهة عمل جديدة، وستظهر مباشرة في نموذج الموظف والفلاتر ومسير الرواتب.</div>
      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label>الأقسام</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={dep} onChange={(e) => setDep(e.target.value)} placeholder="اسم القسم" />
            <button type="button" className="btn bpl bsm" onClick={() => dep.trim() && run(() => addListItem("departments", dep.trim()), "تمت الإضافة").then(() => setDep(""))}>
              إضافة
            </button>
          </div>
          {list("departments", lookups.departments)}
        </div>
        <div>
          <label>جهات العمل</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={wp} onChange={(e) => setWp(e.target.value)} placeholder="اسم جهة العمل" />
            <button type="button" className="btn bpl bsm" onClick={() => wp.trim() && run(() => addListItem("workplaces", wp.trim()), "تمت الإضافة").then(() => setWp(""))}>
              إضافة
            </button>
          </div>
          {list("workplaces", lookups.workplaces)}
        </div>
      </div>
    </div>
  );
}

function GosiCard({ initial, run }: { initial: GosiSettings; run: Run }) {
  const toast = useToast();
  const [s, setS] = useState<GosiSettings>(initial);
  const set = (i: number, k: string, v: string) => setS({ ...s, effectiveRules: s.effectiveRules.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  function add() {
    const last = s.effectiveRules[s.effectiveRules.length - 1];
    setS({ ...s, effectiveRules: [...s.effectiveRules, { ...last, date: "" }] });
  }
  function del(i: number) {
    if (s.effectiveRules.length <= 1) return toast("يجب الإبقاء على فترة واحدة على الأقل", "err");
    setS({ ...s, effectiveRules: s.effectiveRules.filter((_, j) => j !== i) });
  }
  function save() {
    if (s.effectiveRules.some((r) => !r.date)) return toast("أدخل تاريخ سريان لكل فترة", "err");
    const body: GosiSettings = {
      wageCap: Number(s.wageCap) || 45000,
      ageThreshold: Number(s.ageThreshold) || 55,
      effectiveRules: [...s.effectiveRules]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((r) => ({ ...r, ...Object.fromEntries(GOSI_KEYS.map((k) => [k, Number(r[k]) || 0])) })),
    };
    run(() => putGosi(body), "تم حفظ إعدادات التأمينات");
  }
  return (
    <div className="card" style={card}>
      <div className="ct">
        <i className="ti ti-shield-check" /> التأمينات الاجتماعية — إعدادات النسب
      </div>
      <div className="al alb" style={{ marginTop: 8 }}>
        <i className="ti ti-info-circle" />
        <span>النسب هنا مطابقة لمنطق معادلة Excel الخاصة باريبا. التاريخ يحدد النسبة التي يستخدمها مسير الرواتب تلقائيًا.</span>
      </div>
      <div id="INS_RULES_BOX">
        <div className="g2" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>حد أجر الاشتراك</label>
            <input id="INS_CAP" type="number" min={0} step={1} value={s.wageCap} onChange={(e) => setS({ ...s, wageCap: e.target.value })} />
          </div>
          <div>
            <label>حد العمر</label>
            <input id="INS_AGE" type="number" min={0} step={1} value={s.ageThreshold} onChange={(e) => setS({ ...s, ageThreshold: Number(e.target.value) })} />
          </div>
        </div>
        <div className="tw" style={{ marginTop: 12, maxHeight: 420, overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>تاريخ السريان</th>
                {GOSI_HEAD.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {s.effectiveRules.map((r, i) => (
                <tr key={i}>
                  <td>
                    <DateField value={String(r.date || "")} onChange={(v) => set(i, "date", v)} />
                  </td>
                  {GOSI_KEYS.map((k) => (
                    <td key={k}>
                      <input type="number" step="0.01" value={String(r[k] ?? "")} onChange={(e) => set(i, k, e.target.value)} style={{ width: 80 }} />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="btn bd bsm" onClick={() => del(i)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="btn" onClick={add}>
            + إضافة فترة جديدة
          </button>
          <button type="button" className="btn bpl" onClick={save}>
            حفظ إعدادات التأمينات
          </button>
        </div>
        <div className="al alb" style={{ marginTop: 10 }}>
          <i className="ti ti-info-circle" />
          <span>النسب المدخلة هنا هي النسب الإجمالية المستخدمة في معادلة اريبا وتشمل المعاشات وساند، وحصة الشركة تشمل الأخطار المهنية وفق النسبة التي تدخلها. لا يتم تعديل النسب التاريخية عند إضافة فترة جديدة.</span>
        </div>
      </div>
    </div>
  );
}

function RolesCard({ emps, accounts, run }: { emps: EmployeeListItem[]; accounts: Account[]; run: Run }) {
  const toast = useToast();
  const [emp, setEmp] = useState("");
  const [role, setRoleSel] = useState("employee");
  async function save() {
    if (!emp) return toast("اختر الموظف أولاً", "err");
    await run(async () => {
      let userId: string | null = null;
      try {
        userId = (await accountForEmployee(emp)).id;
      } catch {
        userId = null;
      }
      if (userId) await setRole(userId, role);
      else await createAccount(emp, role as never);
    }, "تم ضبط الصلاحية: " + ROLE_LABELS[role]);
  }
  return (
    <div className="card" style={{ ...card, maxWidth: 900 }}>
      <div className="ct" style={{ marginBottom: 8 }}>
        <i className="ti ti-shield-lock" /> صلاحيات المستخدمين
      </div>
      <div className="fg">
        <div>
          <label>الموظف</label>
          <select value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">اختر الموظف</option>
            {emps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name_ar} — {e.emp_no}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>الصلاحية الجديدة</label>
          <select value={role} onChange={(e) => setRoleSel(e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" className="btn bpl" style={{ marginTop: 10 }} onClick={save}>
        حفظ
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div className="ct" style={{ fontSize: 12 }}>الصلاحيات الحالية لكل المستخدمين</div>
        <button type="button" className="btn bsm" onClick={() => run(async () => undefined, "تم تحديث القائمة")}>تحديث القائمة</button>
      </div>
      <div className="tw" style={{ marginTop: 6 }}>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>اليوزر</th>
              <th>الصلاحية</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "var(--mu)", textAlign: "center" }}>لا توجد بيانات</td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.user_id}>
                  <td>{a.name_ar}</td>
                  <td>{a.username}</td>
                  <td>
                    <b>{ROLE_LABELS[a.role] ?? a.role}</b>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PasswordsCard({ emps }: { emps: EmployeeListItem[] }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [emp, setEmp] = useState("");
  const [mine, setMine] = useState(false);
  const [reveal, setReveal] = useState<{ password: string; username: string } | null>(null);
  const list = emps.filter((e) => !q || e.name_ar.includes(q) || e.emp_no.includes(q));
  async function reset() {
    const e = emps.find((x) => x.id === emp);
    if (!e) return toast("اختر الموظف الأول", "err");
    if (!window.confirm(`سيتم إنشاء كلمة مرور مؤقتة جديدة للموظف ${e.name_ar}، وسيتم إلغاء كلمة المرور الحالية. هل أنت متأكد؟`)) return;
    try {
      let t;
      try {
        const u = await accountForEmployee(e.id);
        t = await issueTemporaryPassword(u.id);
      } catch {
        t = await createAccount(e.id, "employee");
      }
      setReveal({ password: t.temporary_password, username: t.user.username });
    } catch (x) {
      toast(x instanceof Error ? x.message : String(x), "err");
    }
  }
  return (
    <div className="card" style={{ ...card, maxWidth: 900 }}>
      <div className="ct">
        <i className="ti ti-lock" /> كلمات المرور والأمان
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 10 }}>
        <div>
          <b>كلمة مرور حسابي</b>
          <div style={{ fontSize: 11, color: "var(--mu)", margin: "4px 0 8px" }}>غيّر كلمة مرور دخولك للبرنامج في أي وقت.</div>
          <button type="button" className="btn bpl bsm" onClick={() => setMine(true)}>
            تغيير كلمة مرور حسابي
          </button>
        </div>
        <div>
          <b>إعادة تعيين كلمة مرور موظف</b>
          <div style={{ fontSize: 11, color: "var(--mu)", margin: "4px 0 8px" }}>بتطلع كلمة مرور مؤقتة، والقديمة بتبطل، والموظف بيغيّرها أول ما يدخل تطبيق الموظف.</div>
          <input placeholder="بحث بالاسم أو الرقم الوظيفي" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
          <select value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">اختر الموظف</option>
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name_ar} — {e.emp_no}
              </option>
            ))}
          </select>
          <button type="button" className="btn bsm" style={{ marginTop: 6, background: "var(--am)", color: "#fff" }} onClick={reset}>
            إعادة تعيين كلمة المرور
          </button>
        </div>
      </div>
      {mine && <PasswordDialog forced={false} onClose={() => setMine(false)} onDone={() => { setMine(false); toast("تم تغيير كلمة المرور", "ok"); }} />}
      {reveal && <PasswordReveal password={reveal.password} username={reveal.username} onClose={() => setReveal(null)} />}
    </div>
  );
}

function ExclusionCard({ basis, run }: { basis: SalaryBasisRow[]; run: Run }) {
  const toast = useToast();
  const [id, setId] = useState("");
  const current = basis.filter((e) => !e.is_terminated);
  const e = current.find((x) => x.id === id);
  return (
    <div className="card" style={{ ...card, maxWidth: 900 }}>
      <div className="ct" style={{ marginBottom: 8 }}>
        <i className="ti ti-user-off" /> استبعاد موظف من مسير الرواتب
      </div>
      <select value={id} onChange={(ev) => setId(ev.target.value)}>
        <option value="">اختر الموظف</option>
        {current.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name_ar}
            {x.exclude_from_payroll ? " (مستبعد حاليًا)" : ""}
          </option>
        ))}
      </select>
      {e && (
        <div className={"al " + (e.exclude_from_payroll ? "alr" : "alg")} style={{ marginTop: 8 }}>
          <i className="ti ti-info-circle" />
          <span>{e.exclude_from_payroll ? "هذا الموظف مستبعد حاليًا من مسير الرواتب." : "هذا الموظف مُدرج حاليًا في مسير الرواتب."}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn bsm" style={{ background: "var(--rd)", color: "#fff" }} onClick={() => (id ? run(() => setPayrollExclusion(id, true), "تم استبعاد الموظف من المسير") : toast("اختر الموظف أولاً", "err"))}>
          استبعاد من المسير
        </button>
        <button type="button" className="btn bsm" style={{ background: "var(--gr)", color: "#fff" }} onClick={() => (id ? run(() => setPayrollExclusion(id, false), "تم إرجاع الموظف لمسير الرواتب") : toast("اختر الموظف أولاً", "err"))}>
          إرجاع للمسير
        </button>
      </div>
    </div>
  );
}

type Signer = { name_ar: string; title_ar: string; title_en: string; signature: string | null; stamp: string | null; show_signature?: boolean; show_stamp?: boolean };

function SignerCard({ signer, emps, run }: { signer: Signer; emps: EmployeeListItem[]; run: Run }) {
  const toast = useToast();
  const [s, setS] = useState<Signer>(signer);
  const pick = async (k: "signature" | "stamp", f?: File) => {
    if (!f) return;
    try {
      setS({ ...s, [k]: await readImage(f, 500) });
    } catch (x) {
      toast(x instanceof Error ? x.message : String(x), "err");
    }
  };
  return (
    <div className="card" style={{ ...card, maxWidth: 900 }}>
      <div className="ct" style={{ marginBottom: 8 }}>
        <i className="ti ti-signature" /> مدير الموارد البشرية والتوقيع والختم (لكل النماذج)
      </div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 10, lineHeight: 1.7 }}>
        الاسم والمسمى والتوقيع والختم اللي هنا بيظهروا في كل النماذج وخطابات الراتب بعد كده (على يسار الورقة في العربي، وعلى اليمين في الإنجليزي). الافتراضي: عبد الله العنبر بتوقيعه الأصلي والختم الرسمي.
      </div>
      <div className="fg">
        <div>
          <label>المدير</label>
          <select value={s.name_ar} onChange={(e) => setS({ ...s, name_ar: e.target.value })}>
            <option value="عبد الله العنبر">عبد الله العنبر (الافتراضي)</option>
            {emps.map((e) => (
              <option key={e.id} value={e.name_ar}>
                {e.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>المسمى بالعربي</label>
          <input value={s.title_ar} onChange={(e) => setS({ ...s, title_ar: e.target.value })} />
        </div>
        <div>
          <label>المسمى بالإنجليزي</label>
          <input value={s.title_en} onChange={(e) => setS({ ...s, title_en: e.target.value })} />
        </div>
        <div>
          <label>توقيع المدير المختار</label>
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => pick("signature", e.target.files?.[0])} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.signature ? <img src={s.signature} alt="" style={{ maxHeight: 50, marginTop: 6, background: "#fff" }} /> : <div style={{ fontSize: 10, color: "var(--mu)" }}>لسه ما اترفعش توقيع للمدير ده — هيظهر اسمه بخط للتوقيع لحد ما ترفعه.</div>}
        </div>
        <div>
          <label>ختم الشركة</label>
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => pick("stamp", e.target.files?.[0])} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.stamp && <img src={s.stamp} alt="" style={{ maxHeight: 60, marginTop: 6, background: "#fff" }} />}
          {s.stamp && (
            <button type="button" className="btn bsm" onClick={() => setS({ ...s, stamp: null })}>
              الرجوع للختم الرسمي الافتراضي
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={s.show_signature !== false} onChange={(e) => setS({ ...s, show_signature: e.target.checked })} /> إظهار التوقيع
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={s.show_stamp !== false} onChange={(e) => setS({ ...s, show_stamp: e.target.checked })} /> إظهار ختم الشركة
        </label>
        {s.signature && (
          <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => setS({ ...s, signature: null })}>
            حذف توقيع المدير المختار
          </button>
        )}
      </div>
      <button type="button" className="btn bpl" style={{ marginTop: 10 }} onClick={() => run(() => putSheet("hr_signer", s), "اتحفظ على السيرفر")}>
        حفظ
      </button>
    </div>
  );
}

// ===================== the updated design's layout: ten numbered sections, search, open state in this browser =====================

const SECS: [string, string, string, string, string][] = [
  ["company", "1", "بيانات الشركة والهوية", "Company & identity", "ti-building"],
  ["print", "2", "الورق الرسمي والتوقيع", "Letterhead & signature", "ti-file-text"],
  ["att", "3", "الحضور والدوام", "Attendance & working hours", "ti-clock"],
  ["leave", "4", "الإجازات والأرصدة", "Leaves & balances", "ti-calendar-repeat"],
  ["app", "5", "تطبيق الموظف", "Employee app", "ti-device-mobile"],
  ["fin", "6", "المالية والتأمينات", "Finance & insurance", "ti-cash"],
  ["mail", "7", "البريد والإشعارات", "Email & notifications", "ti-mail"],
  ["lists", "8", "القوائم والبيانات الأساسية", "Lists & master data", "ti-list-details"],
  ["alerts", "9", "التنبيهات", "Alerts", "ti-bell-ringing"],
  ["access", "10", "المستخدمون والصلاحيات والأمان", "Users, permissions & security", "ti-shield-lock"],
];
const OPEN_KEY = "ariba_set_open_v1";

function Organizer({ sections, ro }: { sections: Record<string, React.ReactNode[]>; ro: boolean }) {
  const { lang } = useLocale();
  const en = lang === "en";
  const [open, setOpen] = useState<Record<string, number>>({ company: 1 });
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const org = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(OPEN_KEY) || "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (o && typeof o === "object") setOpen(o);
    } catch { /* ignore */ }
  }, []);
  const persist = (n: Record<string, number>) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; };
  const toggle = (k: string) => setOpen((o) => persist({ ...o, [k]: o[k] ? 0 : 1 }));
  const jump = (k: string) => {
    setOpen((o) => persist({ ...o, [k]: 1 }));
    setTimeout(() => org.current?.querySelector(`.so-sec[data-sec="${k}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  // the design's search: hide the cards that do not contain the text, open the sections that do
  useEffect(() => {
    const root = org.current;
    if (!root) return;
    const s = q.trim().toLowerCase();
    let any = false;
    const c: Record<string, number> = {};
    const op: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>(".so-sec").forEach((sec) => {
      const k = sec.dataset.sec ?? "";
      let shown = 0;
      let total = 0;
      sec.querySelectorAll<HTMLElement>(".so-body > .card").forEach((card) => {
        total++;
        const ok = !s || (card.textContent ?? "").toLowerCase().includes(s);
        card.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      c[k] = total;
      if (s && shown) op[k] = 1;
      sec.style.display = shown || (!s && total) ? "" : "none";
      if (shown) any = true;
    });
    const em = root.querySelector<HTMLElement>("#SO_EMPTY");
    if (em) em.style.display = s && !any ? "block" : "none";
    // the counts and the opened sections come from the rendered cards, so they are read back from the page
    setCounts((prev) => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s && Object.keys(op).some((k) => !open[k])) setOpen((o) => ({ ...o, ...op }));
  }, [q, open, sections]);
  const T = (a: string, b: string) => (en ? b : a);
  return (
    <>
      {ro && <div style={{ margin: "6px 0", fontSize: 11.5, color: "var(--am)" }}>👁 {T("اطلاع فقط — مفيش تعديل في الصفحة دي", "View only — no editing on this page")}</div>}
      <fieldset disabled={ro} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <div id="SET_ORG" ref={org} data-l={en ? "en" : "ar"}>
          <div className="so-bar">
            <input className="so-search" id="SO_Q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("ابحث في الإعدادات…", "Search settings…")} />
            {SECS.map((s) => (
              <span key={s[0]} className="so-chip" data-sec={s[0]} style={{ display: counts[s[0]] ? "" : "none" }} onClick={() => jump(s[0])}><b>{s[1]}</b>{en ? s[3] : s[2]}</span>
            ))}
          </div>
          {SECS.map((s) => (
            <section key={s[0]} className={"so-sec" + (open[s[0]] ? "" : " closed")} data-sec={s[0]}>
              <div className="so-head" onClick={() => toggle(s[0])}>
                <span className="n">{s[1]}</span><i className={"ti " + s[4]} /><span>{en ? s[3] : s[2]}</span>
                <span className="cnt">{counts[s[0]] ? counts[s[0]] + " " + T("إعداد", "item(s)") : ""}</span><i className="ti ti-chevron-down ar" />
              </div>
              <div className="so-body">{sections[s[0]]}</div>
            </section>
          ))}
          <div className="so-empty" id="SO_EMPTY">{T("مفيش نتائج مطابقة", "No matching settings")}</div>
        </div>
      </fieldset>
    </>
  );
}

/** A design card whose backend stage is not done yet: its title, what it does, and what it waits for. */
function WaitCard({ icon, title, en: enTitle, what, id }: { icon: string; title: string; en: string; what: [string, string]; id: FeatureId }) {
  const { lang } = useLocale();
  const en = lang === "en";
  return (
    <div className="card" style={{ ...card, maxWidth: 900, padding: 14, opacity: 0.85 }}>
      <div className="ct" style={{ marginBottom: 8 }}><i className={"ti " + icon} /> <span>{en ? enTitle : title}</span></div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>{en ? what[1] : what[0]}</div>
      <div className="al alb" style={{ margin: 0 }}><i className="ti ti-hourglass" /><div><strong>{en ? "Not available yet" : "غير متاح بعد"}</strong><div>{(en ? "Opens after " : "يُفتح بعد ") + (en ? FEATURES[id].waits?.en : FEATURES[id].waits?.ar)}</div></div></div>
    </div>
  );
}

function CompanyCard({ company, att, run }: { company: Company; att: AttendanceSettings; run: Run }) {
  const [c, setC] = useState(company);
  const [a, setA] = useState(att);
  return (
    <div className="card" style={{ maxWidth: 900, padding: 14 }} id="CO_CARD">
      <div className="ct" style={{ marginBottom: 14 }}><i className="ti ti-settings" /> <span>إعدادات الشركة</span></div>
      <div className="fg">
        <div><label>اسم الشركة بالعربي</label><input id="CN_AR" maxLength={120} value={c.company_name_ar} onChange={(e) => setC({ ...c, company_name_ar: e.target.value })} /></div>
        <div><label>اسم الشركة بالإنجليزي</label><input id="CN_EN" maxLength={120} style={{ direction: "ltr" }} value={c.company_name_en} onChange={(e) => setC({ ...c, company_name_en: e.target.value })} /></div>
        <div>
          <label>نظام العمل</label>
          <select id="CO_LAW" value={c.labour_law_country} onChange={(e) => setC({ ...c, labour_law_country: e.target.value })}>
            <option value="SA">المملكة العربية السعودية</option>
            <option value="EG">مصر</option>
            <option value="AE">الإمارات</option>
          </select>
        </div>
        <div><label>وقت بدء العمل</label><TimeField id="CO_ST" value={hhmm(a.work_start)} onChange={(v) => setA({ ...a, work_start: v })} /></div>
        <div><label>هامش التأخير (دقيقة)</label><input type="number" id="CO_TOL" min={0} max={240} value={a.tolerance_minutes} onChange={(e) => setA({ ...a, tolerance_minutes: Number(e.target.value) || 0 })} /></div>
        <div><label>حد العمل عن بعد (يوم/سنة)</label><input type="number" id="CO_RMT" min={0} max={366} value={a.remote_days_per_year} onChange={(e) => setA({ ...a, remote_days_per_year: Number(e.target.value) || 0 })} /></div>
      </div>
      <button type="button" className="btn bpl" id="CO_SAVE" style={{ marginTop: 12 }} onClick={() => run(async () => { await putCompany(c); await putAttendanceSettings({ ...att, work_start: a.work_start, tolerance_minutes: a.tolerance_minutes, remote_days_per_year: a.remote_days_per_year }); }, "✓ اتحفظت بيانات الشركة")}>
        <i className="ti ti-check" /> <span>حفظ</span>
      </button>
    </div>
  );
}

function LogoCard({ logo, run }: { logo: string | null; run: Run }) {
  const toast = useToast();
  return (
    <div className="card" style={{ ...card, maxWidth: 900, padding: 14 }}>
      <div className="ct" style={{ marginBottom: 12 }}><i className="ti ti-photo" /> <span>شعار الشركة</span></div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8 }}>بيستبدل اللوجو الظاهر في الشريط الجانبي وفي طباعة المسير، ويتحفظ على السيرفر.</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 160, height: 70, border: "1px dashed var(--bd)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo || "/brand/ariba-logo.png"} alt="logo" style={{ maxWidth: 150, maxHeight: 60 }} />
        </div>
        <span className="b bb">{logo ? "شعار مخصص" : "الشعار الافتراضي"}</span>
        <label className="btn bsm" style={{ cursor: "pointer" }}>
          اختار صورة الشعار
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = await readImage(f, 600);
                await run(() => putSheet("company_logo", data), "اتغيّر الشعار");
              } catch (x) {
                toast(x instanceof Error ? x.message : String(x), "err");
              }
            }}
          />
        </label>
        {logo && <button type="button" className="btn bsm" onClick={() => run(() => putSheet("company_logo", null), "رجع الشعار الافتراضي")}>رجوع للشعار الافتراضي</button>}
      </div>
    </div>
  );
}

function FlexCard({ att, run }: { att: AttendanceSettings; run: Run }) {
  const [a, setA] = useState(att);
  return (
    <div className="card" style={{ ...card, maxWidth: 900, padding: 14 }}>
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-clock-hour-4" /> الساعة المرنة</div>
      <div className={"al " + (att.flexible_enabled ? "alg" : "alb")} style={{ marginBottom: 8 }}>
        <i className="ti ti-info-circle" />
        <span>{att.flexible_enabled ? `الساعة المرنة مفعّلة الآن — نطاق ${hhmm(att.window_start)} إلى ${hhmm(att.window_end)} — ${Number(att.shift_hours)} ساعات دوام` : "الساعة المرنة غير مفعّلة (وقت حضور ثابت)"}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8, lineHeight: 1.7 }}>
        لما تتفعّل، الموظف يدخل أي وقت داخل نطاق الدوام المحدد تحت، ووقت انصرافه المفروض = وقت دخوله + عدد الساعات (مثال: نطاق 8 إلى 5، دوام 8 ساعات ← دخل 8 يمشي 4، دخل 9 يمشي 5). لو الدخول هيخلي الانصراف يعدي نهاية النطاق، البصمة بترفض.
      </div>
      <div className="fg">
        <div><label>من الساعة</label><TimeField id="V86_FROM" value={hhmm(a.window_start)} onChange={(v) => setA({ ...a, window_start: v })} /></div>
        <div><label>إلى الساعة</label><TimeField id="V86_TO" value={hhmm(a.window_end)} onChange={(v) => setA({ ...a, window_end: v })} /></div>
        <div><label>عدد ساعات الدوام</label><input type="number" id="V86_HOURS" min={1} max={16} step={0.5} value={a.shift_hours} onChange={(e) => setA({ ...a, shift_hours: e.target.value })} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn bpl" onClick={() => run(() => putAttendanceSettings({ ...a, flexible_enabled: true }), `اتفعّلت الساعة المرنة (${Number(a.shift_hours)} ساعات)`)}>تفعيل الساعة المرنة</button>
        <button type="button" className="btn" onClick={() => run(() => putAttendanceSettings({ ...a, flexible_enabled: false }), "اتلغت الساعة المرنة، رجعنا لوقت الحضور الثابت")}>إلغاء الساعة المرنة</button>
      </div>
    </div>
  );
}

const MGR_PERM_KEYS: [string, string, string][] = [
  ["approve_requests", "اعتماد / رفض طلبات فريقه", "Approve / reject team requests"],
  ["view_team", "رؤية قائمة فريقه", "See team list"],
  ["view_team_data", "بيانات الفريق (الوظيفية)", "Team employment data"],
  ["view_team_leaves", "إجازات وأرصدة الفريق", "Team leaves & balances"],
  ["view_team_requests", "طلبات الفريق وحالتها", "Team requests & status"],
  ["view_team_attendance", "حضور الفريق", "Team attendance"],
  ["view_team_salary", "رواتب الفريق", "Team salaries"],
  ["manage_targets", "إدخال مستهدفات الفريق", "Set team targets"],
  ["evaluate_team", "تقييم الفريق واعتماد التقييم", "Evaluate team & approve"],
  ["submit_for_team", "تقديم طلبات بالنيابة (بعد تفويض الموظف)", "Submit on behalf (after employee delegation)"],
];
type MgrRow = { manager_id: string; name: string; job: string | null; team: number; perms: Record<string, boolean>; dirty?: boolean };

/** The design's ManagerPermsCard on OUR /settings/manager-perms, with OUR company-wide team-salary switch (Stage 2). */
function ManagerPermsCard({ run }: { run: Run }) {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const [rows, setRows] = useState<MgrRow[] | null>(null);
  const [salary, setSalary] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => {
    request<{ managers: MgrRow[]; team_salary_visible: boolean }>("/settings/manager-perms")
      .then((r) => { setRows(r.managers); setSalary(r.team_salary_visible); })
      .catch(() => setRows([]));
  }, []);
  useEffect(() => load(), [load]);
  const toggle = (mid: string, k: string) => setRows((rs) => rs && rs.map((r) => (r.manager_id !== mid ? r : { ...r, perms: { ...r.perms, [k]: !r.perms[k] }, dirty: true })));
  async function save(r: MgrRow) {
    setBusy(r.manager_id);
    const full: Record<string, boolean> = {};
    MGR_PERM_KEYS.forEach(([k]) => { full[k] = !!r.perms[k]; });
    await run(() => request(`/settings/manager-perms/${r.manager_id}`, { method: "PUT", body: { perms: full } }), "✓ " + T("اتحفظت صلاحيات ", "Saved permissions for ") + r.name);
    setBusy("");
    load();
  }
  return (
    <div className="card" style={{ ...card, maxWidth: 1100, padding: 14 }} id="MGR_PERMS">
      <div className="ct" style={{ marginBottom: 12 }}><i className="ti ti-users-group" /> <span>{T("صلاحيات المديرين المباشرين", "Direct-manager permissions")}</span></div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>{T("المدير يرى بيانات فريقه فقط، وبالقدر الذي تحدده هنا. التقديم بالنيابة يتطلب أيضاً تفعيل الموظف «تفويض المدير المباشر» من تطبيقه.", "A manager sees only their own team, limited to what you tick here. Submitting on behalf also requires the employee to enable delegation in the app.")}</div>
      {salary !== null && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
          <input type="checkbox" checked={salary} onChange={(e) => { const v = e.target.checked; setSalary(v); void run(() => request("/settings/team-salary", { method: "PUT", body: { visible: v } }), v ? T("✓ رواتب الفريق ظاهرة للمديرين المسموح لهم", "✓ Team salaries visible to permitted managers") : T("✓ رواتب الفريق مخفية عن كل المديرين", "✓ Team salaries hidden from every manager")); }} />
          {T("إظهار رواتب الفريق للمديرين (مع صلاحية «رواتب الفريق» لكل مدير) — مخفية افتراضيًا", "Show team salaries to managers (with each manager's «Team salaries» permission) — hidden by default")}
        </label>
      )}
      {rows === null && <div style={{ color: "var(--mu)" }}>…</div>}
      {rows && !rows.length && <div style={{ color: "var(--mu)", fontSize: 12 }}>{T("لا يوجد مديرون مباشرون (لا موظفين لهم مدير مُعيَّن).", "No direct managers (no employee has a manager assigned).")}</div>}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", fontSize: 12 }}>
            <thead><tr><th>{T("المدير", "Manager")}</th><th>{T("الفريق", "Team")}</th>{MGR_PERM_KEYS.map(([k, a, e]) => <th key={k} style={{ fontSize: 10.5 }}>{en ? e : a}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.manager_id}>
                  <td><b>{r.name}</b><div style={{ fontSize: 10, color: "var(--mu)" }}>{r.job || ""} #{r.manager_id}</div></td>
                  <td>{r.team}</td>
                  {MGR_PERM_KEYS.map(([k]) => <td key={k} style={{ textAlign: "center" }}><input type="checkbox" checked={!!r.perms[k]} onChange={() => toggle(r.manager_id, k)} /></td>)}
                  <td><button type="button" className="btn bpl bsm" disabled={busy === r.manager_id || !r.dirty} onClick={() => save(r)}>{T("حفظ", "Save")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SIGN_TYPES: [string, string, string][] = [
  ["onboarding", "مباشرة عمل", "Start of employment"],
  ["custody", "استلام عهدة تقنية", "IT equipment custody"],
  ["extension", "تمديد فترة التجربة", "Probation extension"],
  ["termination", "إشعار إنهاء فترة التجربة", "Probation termination notice"],
  ["*", "كل المستندات", "All documents"],
];

/** The design's DocSignCard on OUR /settings/doc-sign (Stage 5), with OUR «HR closes» switch (off by default). */
function DocSignCard({ run }: { run: Run }) {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const [cfg, setCfg] = useState<{ hr_closes: boolean; manager_types: string[] } | null>(null);
  useEffect(() => {
    request<{ hr_closes: boolean; manager_types: string[] }>("/settings/doc-sign").then(setCfg).catch(() => setCfg({ hr_closes: false, manager_types: [] }));
  }, []);
  const tog = (k: string) => setCfg((c) => c && { ...c, manager_types: c.manager_types.includes(k) ? c.manager_types.filter((x) => x !== k) : [...c.manager_types, k] });
  return (
    <div className="card" style={{ ...card, maxWidth: 900, padding: 14 }} id="DOC_SIGN">
      <div className="ct" style={{ marginBottom: 12 }}><i className="ti ti-signature" /> <span>{T("توقيع المدير المباشر على المستندات", "Direct-manager signature on documents")}</span></div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>{T("عند «موافق مع التوقيع» يدمج تطبيق الموظف توقيعه في المستند تلقائياً. المستندات المحددة هنا تقف عند مديره المباشر حتى يوقّع، ثم تذهب للموارد البشرية. توقيع الموظف نفسه محفوظ في تطبيقه فقط ولا تراه الموارد البشرية — تصلها نسخة المستند الموقّعة فقط.", "When an employee approves with signature, the app places it on the document. Types ticked here stop at the direct manager until signed, then go to HR. The stored signature stays in the employee app; HR only receives the signed document.")}</div>
      {cfg && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SIGN_TYPES.map(([k, a, e]) => <label key={k} style={{ fontSize: 13 }}><input type="checkbox" checked={cfg.manager_types.includes(k)} onChange={() => tog(k)} /> {en ? e : a}</label>)}
          <label style={{ fontSize: 13, marginTop: 6, borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
            <input type="checkbox" checked={cfg.hr_closes} onChange={(e) => setCfg({ ...cfg, hr_closes: e.target.checked })} /> {T("خطوة إغلاق أخيرة من الموارد البشرية بعد التوقيع (متوقفة افتراضيًا)", "A final HR closing step after signing (off by default)")}
          </label>
        </div>
      )}
      <button type="button" className="btn bpl" style={{ marginTop: 10 }} disabled={!cfg} onClick={() => cfg && run(() => request("/settings/doc-sign", { method: "PUT", body: cfg }), "✓ " + T("تم الحفظ", "Saved"))}>{T("حفظ", "Save")}</button>
    </div>
  );
}

/** OUR push switch (Stage 6): notifications to the employee app; nothing is sent while no sender exists. */
function PushCard({ run }: { run: Run }) {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const [s, setS] = useState<{ enabled: boolean; devices: number } | null>(null);
  useEffect(() => {
    request<{ enabled: boolean; devices: number }>("/settings/push").then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  return (
    <div className="card" style={{ ...card, maxWidth: 900, padding: 14 }} id="PUSH_CARD">
      <div className="ct" style={{ marginBottom: 12 }}><i className="ti ti-bell" /> <span>{T("إشعارات تطبيق الموظف (Push)", "Employee-app notifications (push)")}</span></div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>{T("الأجهزة المسجّلة: ", "Registered devices: ")}<b>{s.devices}</b>. {T("الإرسال نفسه غير مفعّل بعد (لا يوجد مُرسِل)؛ هذا المفتاح يحفظ الرغبة فقط.", "Sending itself is not switched on yet (no sender); this switch only stores the choice.")}</div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
        <input type="checkbox" checked={s.enabled} onChange={(e) => { const v = e.target.checked; setS({ ...s, enabled: v }); void run(() => request("/settings/push", { method: "PUT", body: { enabled: v } }), "✓ " + T("تم الحفظ", "Saved")); }} />
        {T("تفعيل إشعارات الجوال", "Enable phone notifications")}
      </label>
    </div>
  );
}
