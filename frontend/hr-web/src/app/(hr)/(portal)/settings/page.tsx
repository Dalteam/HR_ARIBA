"use client";

// Settings (الإعدادات) — port of #pg-set and the cards later patches add to it:
// company (+V85 attendance sync), V129 logo, V60 departments/workplaces, GOSI rates (calculations/05 rInsSettings),
// V86 flexible hours, V83 permissions, V114 passwords, V72 exclusion from payroll, V120 HR signer & stamp.
import { useCallback, useEffect, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { PasswordDialog } from "@/components/common/password-dialog";
import { PasswordReveal } from "@/components/hr/password-reveal";
import { useToast } from "@/components/common/toast";
import { accountForEmployee, createAccount, issueTemporaryPassword } from "@/lib/auth";
import { getLookups, listAllEmployees } from "@/lib/employees";
import type { EmployeeListItem, Lookups } from "@/lib/api";
import { getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import {
  addListItem,
  getAttendanceSettings,
  getCompany,
  getGosi,
  getSheet,
  GOSI_KEYS,
  listAccounts,
  putAttendanceSettings,
  putCompany,
  putGosi,
  putSheet,
  removeListItem,
  setPayrollExclusion,
  setRole,
  type Account,
  type AttendanceSettings,
  type Company,
  type GosiSettings,
} from "@/lib/settings";

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
  const [company, setCompany] = useState<Company | null>(null);
  const [att, setAtt] = useState<AttendanceSettings | null>(null);
  const [gosi, setGosi] = useState<GosiSettings | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [basis, setBasis] = useState<SalaryBasisRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
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
    ])
      .then(([c, a, g, l, p, b, acc, lg, sg]) => {
        if (!alive) return;
        setCompany(c);
        setAtt(a);
        setGosi(g);
        setLookups(l);
        setEmps(p.items);
        setBasis(b);
        setAccounts(acc);
        setLogo(lg.data);
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

  return (
    <div className="pg on" id="pg-set">
      {/* إعدادات الشركة (+ V85: بداية الدوام والسماح تتحفظ على السيرفر) */}
      <div className="card" style={{ maxWidth: 900 }}>
        <div className="ct" style={{ marginBottom: 14 }}>
          <i className="ti ti-settings" /> <span>إعدادات الشركة</span>
        </div>
        <div className="fg">
          <div>
            <label>اسم الشركة بالعربي</label>
            <input id="CN_AR" value={company.company_name_ar} onChange={(e) => setCompany({ ...company, company_name_ar: e.target.value })} />
          </div>
          <div>
            <label>اسم الشركة بالإنجليزي</label>
            <input id="CN_EN" value={company.company_name_en} onChange={(e) => setCompany({ ...company, company_name_en: e.target.value })} />
          </div>
          <div>
            <label>نظام العمل</label>
            <select id="CO_LAW" value={company.labour_law_country} onChange={(e) => setCompany({ ...company, labour_law_country: e.target.value })}>
              <option value="SA">المملكة العربية السعودية</option>
              <option value="EG">مصر</option>
              <option value="AE">الإمارات</option>
            </select>
          </div>
          <div>
            <label>وقت بدء العمل</label>
            <input type="time" id="CO_ST" value={hhmm(att.work_start)} onChange={(e) => setAtt({ ...att, work_start: e.target.value })} />
          </div>
          <div>
            <label>هامش التأخير (دقيقة)</label>
            <input type="number" id="CO_TOL" value={att.tolerance_minutes} onChange={(e) => setAtt({ ...att, tolerance_minutes: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <label>حد العمل عن بعد (يوم/سنة)</label>
            <input type="number" id="CO_RMT" value={att.remote_days_per_year} onChange={(e) => setAtt({ ...att, remote_days_per_year: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <button
          type="button"
          className="btn bpl"
          style={{ marginTop: 12 }}
          onClick={() => run(async () => { await putCompany(company); await putAttendanceSettings(att); }, "✓ تم حفظ الإعدادات")}
        >
          <i className="ti ti-check" /> <span>حفظ</span>
        </button>
      </div>

      {/* V129 شعار الشركة */}
      <div className="card" style={{ ...card, maxWidth: 900 }}>
        <div className="ct" style={{ marginBottom: 12 }}>
          <i className="ti ti-photo" /> <span>شعار الشركة</span>
        </div>
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
                  await run(() => putSheet("company_logo", data), "✓ اتغيّر الشعار");
                } catch (x) {
                  toast(x instanceof Error ? x.message : String(x), "err");
                }
              }}
            />
          </label>
          {logo && (
            <button type="button" className="btn bsm" onClick={() => run(() => putSheet("company_logo", null), "رجع الشعار الافتراضي")}>
              رجوع للشعار الافتراضي
            </button>
          )}
        </div>
      </div>

      {/* V60 إدارة الأقسام وجهات العمل */}
      <ListsCard lookups={lookups} run={run} />

      {/* التأمينات الاجتماعية — إعدادات النسب */}
      <GosiCard key={JSON.stringify(gosi)} initial={gosi} run={run} />

      {/* V86 الساعة المرنة */}
      <div className="card" style={{ ...card, maxWidth: 900 }}>
        <div className="ct" style={{ marginBottom: 8 }}>
          <i className="ti ti-clock-hour-4" /> الساعة المرنة
        </div>
        <div className={"al " + (att.flexible_enabled ? "alg" : "alb")} style={{ marginBottom: 8 }}>
          <i className="ti ti-info-circle" />
          <span>
            {att.flexible_enabled
              ? `الساعة المرنة مفعّلة الآن — نطاق ${hhmm(att.window_start)} إلى ${hhmm(att.window_end)} — ${Number(att.shift_hours)} ساعات دوام`
              : "الساعة المرنة غير مفعّلة (وقت حضور ثابت)"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8, lineHeight: 1.7 }}>
          لما تتفعّل، الموظف يدخل أي وقت داخل نطاق الدوام المحدد تحت، ووقت انصرافه المفروض = وقت دخوله + عدد الساعات (مثال: نطاق 8 إلى 5، دوام 8 ساعات ← دخل 8 يمشي 4، دخل 9 يمشي 5). لو الدخول هيخلي الانصراف يعدي نهاية النطاق، البصمة بترفض.
        </div>
        <div className="fg">
          <div>
            <label>من الساعة</label>
            <input type="time" id="V86_FROM" value={hhmm(att.window_start)} onChange={(e) => setAtt({ ...att, window_start: e.target.value })} />
          </div>
          <div>
            <label>إلى الساعة</label>
            <input type="time" id="V86_TO" value={hhmm(att.window_end)} onChange={(e) => setAtt({ ...att, window_end: e.target.value })} />
          </div>
          <div>
            <label>عدد ساعات الدوام</label>
            <input type="number" id="V86_HOURS" min={1} max={16} step={0.5} value={att.shift_hours} onChange={(e) => setAtt({ ...att, shift_hours: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="btn bpl"
            onClick={() => run(() => putAttendanceSettings({ ...att, flexible_enabled: true }), `✓ اتفعّلت الساعة المرنة (${Number(att.shift_hours)} ساعات)`)}
          >
            تفعيل الساعة المرنة
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => run(() => putAttendanceSettings({ ...att, flexible_enabled: false }), "اتلغت الساعة المرنة، رجعنا لوقت الحضور الثابت")}
          >
            إلغاء الساعة المرنة
          </button>
        </div>
      </div>

      {/* V83 صلاحيات المستخدمين */}
      <RolesCard emps={emps} accounts={accounts} run={run} />

      {/* V114 كلمات المرور والأمان */}
      <PasswordsCard emps={emps} />

      {/* V72 استبعاد موظف من مسير الرواتب */}
      <ExclusionCard basis={basis} run={run} />

      {/* V120 مدير الموارد البشرية والتوقيع والختم */}
      <SignerCard key={JSON.stringify(signer).length + signer.name_ar} signer={signer} emps={emps} run={run} />
    </div>
  );
}

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

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
            <button type="button" className="btn bpl bsm" onClick={() => dep.trim() && run(() => addListItem("departments", dep.trim()), "✓ تمت الإضافة").then(() => setDep(""))}>
              إضافة
            </button>
          </div>
          {list("departments", lookups.departments)}
        </div>
        <div>
          <label>جهات العمل</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={wp} onChange={(e) => setWp(e.target.value)} placeholder="اسم جهة العمل" />
            <button type="button" className="btn bpl bsm" onClick={() => wp.trim() && run(() => addListItem("workplaces", wp.trim()), "✓ تمت الإضافة").then(() => setWp(""))}>
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
    run(() => putGosi(body), "✓ تم حفظ إعدادات التأمينات");
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
                    <input type="date" value={String(r.date || "")} onChange={(e) => set(i, "date", e.target.value)} />
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
    }, "✓ تم ضبط الصلاحية: " + ROLE_LABELS[role]);
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
        <button type="button" className="btn bsm" onClick={() => run(async () => undefined, "✓ تم تحديث القائمة")}>تحديث القائمة</button>
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
    if (!window.confirm(`هتطلع كلمة مرور مؤقتة جديدة لـ ${e.name_ar}، والقديمة هتبطل. متأكد؟`)) return;
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
      {mine && <PasswordDialog forced={false} onClose={() => setMine(false)} onDone={() => { setMine(false); toast("✓ تم تغيير كلمة المرور", "ok"); }} />}
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
      <button type="button" className="btn bpl" style={{ marginTop: 10 }} onClick={() => run(() => putSheet("hr_signer", s), "✓ اتحفظ على السيرفر")}>
        حفظ
      </button>
    </div>
  );
}
