"use client";

// Forms & letters (النماذج) — port of the legacy #pg-forms (V70 page + V71 send/status + V114 Arabic forms & contract-end
// notice + V117 salary certificate + V120 HR signer). One shared employee selector; each card prints on the company
// letterhead and can be sent to the employee to approve or object in their app.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { getEmployee, listAllEmployees } from "@/lib/employees";
import type { Employee, EmployeeListItem } from "@/lib/api";
import { request } from "@/lib/api";
import { getSheet } from "@/lib/settings";
import { buildEnglish, buildSalaryCertEn } from "@/lib/calc/forms-en";
import {
  acctFromIban,
  buildClearance,
  buildContractEnd,
  buildCustody,
  buildEvaluation,
  buildExperience,
  buildExtension,
  buildOnboarding,
  buildSalaryCert,
  buildTermination,
  CE_LAWS,
  consumeRef,
  EVAL_CRITERIA,
  nextRef,
  printDoc,
  salaryCertMissing,
  type Built,
  type FormEmp,
  type Signer,
} from "@/lib/calc/forms";

const STY: React.CSSProperties = { padding: 6, border: "1px solid var(--bd)", borderRadius: 6, background: "var(--c2)", color: "var(--tx)", fontSize: 12, width: "100%" };
const DEFAULT_SIGNER: Signer = { name_ar: "عبد الله العنبر", title_ar: "مدير الموارد البشرية", title_en: "HR Manager", signature: null, stamp: null };
const TYPE_AR: Record<string, string> = {
  onboarding: "مباشرة عمل",
  custody: "استلام عهدة تقنية",
  extension: "إشعار تمديد فترة التجربة",
  termination: "إشعار إنهاء فترة التجربة",
  clearance: "إخلاء طرف",
  experience: "شهادة خبرة",
  evaluation: "تقييم فترة التجربة",
  contract_end: "إشعار انتهاء عقد العمل",
  salary_cert: "تعريف بالراتب",
};
const STATUS: Record<string, React.ReactNode> = {
  pending: <span className="b ba">⏳ بانتظار الموظف</span>,
  approved: <span className="b bg">✅ تمت الموافقة</span>,
  rejected: <span className="b br">⚠️ معترَض عليه</span>,
};

interface LetterRow { id: string; employee_name: string; type: string; title: string; status: string; rejection_reason: string | null; created_at: string }

function toFormEmp(e: Employee): FormEmp {
  const s = e.salary;
  return {
    id: e.id,
    nameAr: e.name_ar,
    nameEn: e.name_en ?? "",
    nationality: e.nationality?.name_ar ?? "",
    iqamaNo: e.national_id ?? "",
    nationalityEn: e.nationality?.name_en ?? "",
    departmentEn: e.department?.name_en ?? "",
    empNo: e.emp_no,
    department: e.department?.name_ar ?? "",
    jobTitle: e.job_title ?? "",
    contractJoin: e.join_date ?? "",
    manager: e.manager?.name_ar ?? "",
    iban: s?.iban ?? "",
    bank: s?.bank_name ?? "",
    salary: Number(s?.basic_salary ?? 0),
    housingAllowance: Number(s?.housing_allowance ?? 0),
    transportAllowance: Number(s?.transport_allowance ?? 0),
    otherAllowance: Number(s?.other_allowances ?? 0),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, color: "var(--mu)", fontWeight: 600, display: "block", marginBottom: 2 }}>{label}</label>
      {children}
    </div>
  );
}

function Buttons({ label, onPrint, onSend }: { label: string; onPrint: () => void; onSend: () => void }) {
  return (
    <>
      <button type="button" className="btn bgr bsm" style={{ marginTop: 8 }} onClick={onPrint}>
        <i className="ti ti-printer" /> {label}
      </button>
      <button type="button" className="btn bsm" style={{ background: "#0a5c9e", color: "#fff", marginTop: 6, width: "100%" }} onClick={onSend}>
        <i className="ti ti-send" /> إرسال للموظف للتوقيع
      </button>
    </>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="ct" style={{ marginBottom: 8 }}>
        <i className={"ti " + icon} /> {title}
      </div>
      {children}
    </div>
  );
}

function BulkCard({ emps, onSend }: { emps: EmployeeListItem[]; onSend: (k: string, ids: string[], setStat: (s: string) => void) => Promise<void> }) {
  const [k, setK] = useState("onboarding");
  const [q, setQ] = useState("");
  const [dep, setDep] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [stat, setStat] = useState("");
  const [busy, setBusy] = useState(false);
  const deps = [...new Set(emps.map((e) => e.department?.name_ar).filter(Boolean))] as string[];
  const list = emps.filter((e) => (!dep || e.department?.name_ar === dep) && (!q || `${e.name_ar} ${e.name_en ?? ""} ${e.emp_no}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="card" style={{ marginTop: 12, padding: 12 }}>
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-users-group" /> إرسال نموذج لعدة موظفين دفعة واحدة</div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8 }}>كل موظف بياناته من ملفه، والحقول العامة (مثل التواريخ والجهة) من كروت النماذج فوق.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <select value={k} onChange={(e) => setK(e.target.value)}>{Object.entries(TYPE_AR).filter(([t]) => t !== "evaluation").map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select>
        <input placeholder="بحث بالاسم أو الرقم الوظيفي" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <select value={dep} onChange={(e) => setDep(e.target.value)}><option value="">كل الأقسام</option>{deps.map((d) => <option key={d}>{d}</option>)}</select>
        <button type="button" className="btn bgr bsm" onClick={() => setSel(new Set([...sel, ...list.map((e) => e.id)]))}>تحديد الظاهر</button>
        <button type="button" className="btn bgr bsm" onClick={() => setSel(new Set())}>إلغاء الكل</button>
      </div>
      <div style={{ maxHeight: 200, overflow: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: "2px 10px", border: "1px solid var(--bd)", borderRadius: 8, padding: 8 }}>
        {list.map((e) => (
          <label key={e.id} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={sel.has(e.id)} onChange={(ev) => { const s2 = new Set(sel); if (ev.target.checked) s2.add(e.id); else s2.delete(e.id); setSel(s2); }} /> {e.name_ar}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" className="btn bsm" disabled={busy} style={{ background: "#0a5c9e", color: "#fff" }} onClick={async () => { setBusy(true); await onSend(k, [...sel], setStat); setBusy(false); }}>
          <i className="ti ti-send" /> إرسال للمحدّدين
        </button>
        <span style={{ fontSize: 11, color: "var(--mu)" }}>{sel.size} موظف محدد</span>
        {stat && <span style={{ fontSize: 11 }}>{stat}</span>}
      </div>
    </div>
  );
}

export default function Page() {
  const toast = useToast();
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [empId, setEmpId] = useState("");
  const [emp, setEmp] = useState<FormEmp | null>(null);
  const [signer, setSigner] = useState<Signer>(DEFAULT_SIGNER);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // card fields
  const [f1, setF1] = useState({ manager: "", join: "", first: true, leaveType: "" });
  const [custody, setCustody] = useState([{ n: "", s: "", c: "" }]);
  const [f3, setF3] = useState({ join: "", end: "" });
  const [f4, setF4] = useState({ join: "", last: "" });
  const [f5, setF5] = useState({ join: "", last: "", reason: "resign", other: "" });
  const [f6, setF6] = useState({ start: "", still: true, end: "", nature: "دوام كامل", no: "" });
  const [f7, setF7] = useState({ join: "", end: "", rec: "", decision: "", scores: [70, 70, 70, 70, 70] });
  const [ce, setCe] = useState({ join: "", last: "", law: "", other: "", ref: "", notes: "" });
  const [sc, setSc] = useState({ to: "", toEn: "", place: "", placeEn: "", bankOn: false, seal: true, ref: "", lang: "ar" });

  useEffect(() => {
    let alive = true;
    Promise.all([
      listAllEmployees({ sort: "name_ar" }),
      getSheet<Signer>("hr_signer").catch(() => ({ data: null })),
      request<LetterRow[]>("/letters").catch(() => []),
    ]).then(([p, s, l]) => {
      if (!alive) return;
      setEmps(p.items);
      if (s.data) setSigner({ ...DEFAULT_SIGNER, ...s.data });
      setLetters(l);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    let alive = true;
    if (!empId) return;
    getEmployee(empId)
      .then((e) => alive && setEmp(toFormEmp(e)))
      .catch((x) => toast(x instanceof Error ? x.message : String(x), "err"));
    return () => {
      alive = false;
    };
  }, [empId, toast]);

  function need(): FormEmp | null {
    if (!emp || emp.id !== empId) {
      toast("اختر الموظف أولاً", "err");
      return null;
    }
    return emp;
  }
  function certData(e: FormEmp, ref?: string) {
    return {
      to: sc.to, toEn: sc.toEn || sc.to, nameAr: e.nameAr, nameEn: e.nameEn || e.nameAr, empNo: e.empNo, join: e.contractJoin, natAr: e.nationality,
      natEn: e.nationalityEn || e.nationality, jobAr: e.jobTitle, jobEn: e.jobTitle, id: e.iqamaNo, placeAr: sc.place, placeEn: sc.placeEn || sc.place,
      basic: e.salary, housing: e.housingAllowance, transport: e.transportAllowance, other: e.otherAllowance, bankOn: sc.bankOn, iban: e.iban,
      bank: e.bank, acct: acctFromIban(e.iban), ref: ref || sc.ref || nextRef(), seal: sc.seal,
    };
  }
  /** Arabic copy + <!--ARIBA_EN--> + English copy (legacy V117 send). */
  function withEnglish(b: Built, e: FormEmp): string {
    const fields = { f1, custody, f3, f4, f5, f6, f7, ce };
    const en = b.type === "salary_cert" ? buildSalaryCertEn(certData(e), signer) : buildEnglish(b.type, e, fields, signer);
    return en ? b.html + "<!--ARIBA_EN-->" + en.html : b.html;
  }

  function out(b: Built | string | null, mode: "print" | "send") {
    if (!b) return;
    if (typeof b === "string") return toast(b, "err");
    if (mode === "print") {
      if (b.type === "salary_cert" && sc.lang === "en" && emp) {
        const en = buildSalaryCertEn(certData(emp, b.html.match(/AR-\d{8}-\d+/)?.[0]), signer);
        printDoc(`${en.title} — ${emp.nameEn || emp.nameAr}`, en.html);
        consumeRef();
        return;
      }
      printDoc(`${b.title} — ${emp?.nameAr ?? ""}`, b.html);
      if (b.type === "salary_cert") consumeRef();
      return;
    }
    if (!window.confirm(`هيتبعت "${b.title}" لـ ${emp?.nameAr ?? ""} في تطبيقه عشان يوافق أو يعترض. متأكد؟`)) return;
    request("/letters", { method: "POST", body: { employee_id: empId, type: b.type, title: b.title, html: emp ? withEnglish(b, emp) : b.html } })
      .then(() => {
        toast("✅ اتبعت للموظف وبيقدر يوافق أو يعترض من تطبيقه", "ok");
        if (b.type === "salary_cert") consumeRef();
        refresh();
      })
      .catch((x) => toast("⚠️ " + (x instanceof Error ? x.message : String(x)), "err"));
  }

  const builders: Record<string, () => Built | string | null> = {
    onboarding: () => {
      const e = need();
      return e && buildOnboarding(e, f1, signer);
    },
    custody: () => {
      const e = need();
      return e && buildCustody(e, custody);
    },
    extension: () => {
      const e = need();
      return e && buildExtension(e, f3, signer);
    },
    termination: () => {
      const e = need();
      return e && buildTermination(e, f4, signer);
    },
    clearance: () => {
      const e = need();
      return e && buildClearance(e, f5, signer);
    },
    experience: () => {
      const e = need();
      return e && buildExperience(e, f6, signer);
    },
    evaluation: () => {
      const e = need();
      return e && buildEvaluation(e, f7, signer);
    },
    contract_end: () => {
      const e = need();
      return e && buildContractEnd(e, ce, signer);
    },
    salary_cert: () => {
      const e = need();
      if (!e) return null;
      const d = {
        to: sc.to,
        nameAr: e.nameAr,
        empNo: e.empNo,
        join: e.contractJoin,
        natAr: e.nationality,
        jobAr: e.jobTitle,
        id: e.iqamaNo,
        placeAr: sc.place,
        basic: e.salary,
        housing: e.housingAllowance,
        transport: e.transportAllowance,
        other: e.otherAllowance,
        bankOn: sc.bankOn,
        iban: e.iban,
        bank: e.bank,
        acct: acctFromIban(e.iban),
        ref: sc.ref || nextRef(),
        seal: sc.seal,
      };
      const m = salaryCertMissing(d);
      if (m.length) return "بيانات ناقصة: " + m.join("، ");
      return buildSalaryCert(d, signer);
    },
  };

  function buildFor(k: string, e: FormEmp): Built | string | null {
    switch (k) {
      case "onboarding": return buildOnboarding(e, { ...f1, join: "" }, signer);
      case "custody": return buildCustody(e, custody);
      case "extension": return buildExtension(e, { ...f3, join: "" }, signer);
      case "termination": return buildTermination(e, { ...f4, join: "" }, signer);
      case "clearance": return buildClearance(e, f5, signer);
      case "experience": return buildExperience(e, f6, signer);
      case "contract_end": return buildContractEnd(e, { ...ce, join: "" }, signer);
      case "salary_cert": {
        const d = { to: sc.to, nameAr: e.nameAr, empNo: e.empNo, join: e.contractJoin, natAr: e.nationality, jobAr: e.jobTitle, id: e.iqamaNo, placeAr: sc.place,
          basic: e.salary, housing: e.housingAllowance, transport: e.transportAllowance, other: e.otherAllowance, bankOn: sc.bankOn, iban: e.iban, bank: e.bank,
          acct: acctFromIban(e.iban), ref: nextRef(), seal: sc.seal };
        const m = salaryCertMissing(d);
        return m.length ? "بيانات ناقصة: " + m.join("، ") : buildSalaryCert(d, signer);
      }
    }
    return null;
  }

  async function bulkSend(k: string, ids: string[], setStat: (s: string) => void) {
    if (!ids.length) return toast("اختر موظفًا واحدًا على الأقل", "err");
    if (!window.confirm(`هيتبعت "${TYPE_AR[k]}" لـ ${ids.length} موظف دفعة واحدة. متأكد؟`)) return;
    let ok = 0;
    const fail: string[] = [];
    for (const id of ids) {
      try {
        const e = toFormEmp(await getEmployee(id));
        const b = buildFor(k, e);
        if (!b || typeof b === "string") throw new Error(typeof b === "string" ? b : "تعذر بناء النموذج");
        await request("/letters", { method: "POST", body: { employee_id: id, type: b.type, title: b.title, html: withEnglish(b, e) } });
        if (b.type === "salary_cert") consumeRef();
        ok++;
      } catch (x) {
        fail.push((emps.find((y) => y.id === id)?.name_ar ?? id) + ": " + (x instanceof Error ? x.message : String(x)));
      }
      setStat(`تم ${ok} من ${ids.length}`);
    }
    setStat(`✅ اتبعت لـ ${ok} موظف` + (fail.length ? ` — ⚠️ تعذر ${fail.length}: ${fail.join(" | ")}` : ""));
    refresh();
  }

  return (
    <div className="pg on" id="pg-forms">
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="ct" style={{ marginBottom: 8 }}>
          <i className="ti ti-user-search" /> اختر الموظف (مشترك لكل النماذج)
        </div>
        <select id="TFE" value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ maxWidth: 420, width: "100%" }}>
          <option value="">— اختر الموظف —</option>
          {emps.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name_ar}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
        <Card title="مباشرة عمل" icon="ti-login-2">
          <Field label="اسم المدير المباشر"><input id="TF1_MGR" style={STY} value={f1.manager} onChange={(e) => setF1({ ...f1, manager: e.target.value })} /></Field>
          <Field label="تاريخ المباشرة"><input type="date" id="TF1_JOIN" style={STY} value={f1.join} onChange={(e) => setF1({ ...f1, join: e.target.value })} /></Field>
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <input type="checkbox" checked={f1.first} onChange={(e) => setF1({ ...f1, first: e.target.checked })} /> مباشرة لأول مرة
          </label>
          <Field label="نوع الإجازة (لو عائد من إجازة)"><input placeholder="سنوية / مرضية / أمومة..." style={STY} value={f1.leaveType} onChange={(e) => setF1({ ...f1, leaveType: e.target.value })} /></Field>
          <Buttons label="طباعة نموذج المباشرة" onPrint={() => out(builders.onboarding(), "print")} onSend={() => out(builders.onboarding(), "send")} />
        </Card>

        <Card title="استلام عهدة تقنية" icon="ti-device-laptop">
          <div id="TF2_ROWS">
            {custody.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6, marginBottom: 6 }}>
                <input placeholder="اسم العهدة (لابتوب، جوال...)" style={{ ...STY, fontSize: 11 }} value={r.n} onChange={(e) => setCustody(custody.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} />
                <input placeholder="الموديل / الرقم التسلسلي" style={{ ...STY, fontSize: 11 }} value={r.s} onChange={(e) => setCustody(custody.map((x, j) => (j === i ? { ...x, s: e.target.value } : x)))} />
                <input placeholder="الحالة (جديد/مستعمل)" style={{ ...STY, fontSize: 11 }} value={r.c} onChange={(e) => setCustody(custody.map((x, j) => (j === i ? { ...x, c: e.target.value } : x)))} />
                <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => setCustody(custody.filter((_, j) => j !== i))}>
                  <i className="ti ti-trash" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn bsm" onClick={() => setCustody([...custody, { n: "", s: "", c: "" }])} style={{ color: "var(--gr)", marginTop: 4 }}>
            <i className="ti ti-plus" /> إضافة عهدة
          </button>
          <Buttons label="طباعة نموذج العهدة" onPrint={() => out(builders.custody(), "print")} onSend={() => out(builders.custody(), "send")} />
        </Card>

        <Card title="تمديد فترة التجربة" icon="ti-calendar-plus">
          <Field label="تاريخ بداية العقد"><input type="date" style={STY} value={f3.join} onChange={(e) => setF3({ ...f3, join: e.target.value })} /></Field>
          <Field label="تاريخ نهاية التمديد الجديد"><input type="date" style={STY} value={f3.end} onChange={(e) => setF3({ ...f3, end: e.target.value })} /></Field>
          <Buttons label="طباعة إشعار التمديد" onPrint={() => out(builders.extension(), "print")} onSend={() => out(builders.extension(), "send")} />
        </Card>

        <Card title="إشعار بإنتهاء التعاقد (فترة التجربة)" icon="ti-calendar-x">
          <Field label="تاريخ بداية العقد"><input type="date" style={STY} value={f4.join} onChange={(e) => setF4({ ...f4, join: e.target.value })} /></Field>
          <Field label="تاريخ آخر يوم عمل"><input type="date" style={STY} value={f4.last} onChange={(e) => setF4({ ...f4, last: e.target.value })} /></Field>
          <Buttons label="طباعة إشعار الإنهاء" onPrint={() => out(builders.termination(), "print")} onSend={() => out(builders.termination(), "send")} />
        </Card>

        <Card title="إخلاء طرف" icon="ti-logout">
          <Field label="تاريخ المباشرة"><input type="date" style={STY} value={f5.join} onChange={(e) => setF5({ ...f5, join: e.target.value })} /></Field>
          <Field label="تاريخ آخر يوم عمل"><input type="date" style={STY} value={f5.last} onChange={(e) => setF5({ ...f5, last: e.target.value })} /></Field>
          <Field label="سبب إخلاء الطرف">
            <select style={STY} value={f5.reason} onChange={(e) => setF5({ ...f5, reason: e.target.value })}>
              <option value="resign">استقالة</option>
              <option value="end">انتهاء العقد</option>
              <option value="other">أخرى</option>
            </select>
          </Field>
          <Field label="توضيح (لو أخرى)"><input style={STY} value={f5.other} onChange={(e) => setF5({ ...f5, other: e.target.value })} /></Field>
          <Buttons label="طباعة إخلاء الطرف" onPrint={() => out(builders.clearance(), "print")} onSend={() => out(builders.clearance(), "send")} />
        </Card>

        <Card title="شهادة خبرة" icon="ti-certificate">
          <Field label="تاريخ بداية التعاقد"><input type="date" style={STY} value={f6.start} onChange={(e) => setF6({ ...f6, start: e.target.value })} /></Field>
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}>
            <input type="checkbox" checked={f6.still} onChange={(e) => setF6({ ...f6, still: e.target.checked })} /> لا يزال على رأس العمل
          </label>
          <Field label="تاريخ نهاية التعاقد (لو انتهى)"><input type="date" disabled={f6.still} style={STY} value={f6.end} onChange={(e) => setF6({ ...f6, end: e.target.value })} /></Field>
          <Field label="طبيعة التعاقد"><input style={STY} value={f6.nature} onChange={(e) => setF6({ ...f6, nature: e.target.value })} /></Field>
          <Field label="رقم الشهادة الصادر"><input placeholder="AR-000-2026" style={STY} value={f6.no} onChange={(e) => setF6({ ...f6, no: e.target.value })} /></Field>
          <Buttons label="طباعة شهادة الخبرة" onPrint={() => out(builders.experience(), "print")} onSend={() => out(builders.experience(), "send")} />
        </Card>

        <Card title="نموذج تقييم فترة التجربة" icon="ti-clipboard-check">
          <Field label="تاريخ بداية العقد"><input type="date" style={STY} value={f7.join} onChange={(e) => setF7({ ...f7, join: e.target.value })} /></Field>
          <Field label="تاريخ نهاية فترة التجربة"><input type="date" style={STY} value={f7.end} onChange={(e) => setF7({ ...f7, end: e.target.value })} /></Field>
          <div id="TF7_ROWS" style={{ marginTop: 6 }}>
            {EVAL_CRITERIA.map((c, i) => (
              <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: 11 }}>{c}</div>
                <select value={f7.scores[i]} onChange={(e) => setF7({ ...f7, scores: f7.scores.map((x, j) => (j === i ? Number(e.target.value) : x)) })} style={{ ...STY, fontSize: 11, width: 170 }}>
                  <option value={0}>غير مرضٍ (0%)</option>
                  <option value={50}>أقل من التوقعات (50%)</option>
                  <option value={70}>يحقق التوقعات (70%)</option>
                  <option value={90}>يفوق التوقعات (90%)</option>
                  <option value={100}>متميز (100%)</option>
                </select>
              </div>
            ))}
          </div>
          <Field label="توصيات المدير المباشر"><textarea rows={2} style={STY} value={f7.rec} onChange={(e) => setF7({ ...f7, rec: e.target.value })} /></Field>
          <div style={{ fontSize: 11, display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            {[["appoint", "تثبيت"], ["terminate", "إنهاء"], ["extend", "تمديد"]].map(([v, l]) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" name="tf7dec" checked={f7.decision === v} onChange={() => setF7({ ...f7, decision: v })} /> {l}
              </label>
            ))}
          </div>
          <Buttons label="طباعة نموذج التقييم" onPrint={() => out(builders.evaluation(), "print")} onSend={() => out(builders.evaluation(), "send")} />
        </Card>

        <Card title="إشعار انتهاء عقد العمل" icon="ti-file-off">
          <Field label="تاريخ بداية العقد (لو فاضي ياخده من ملف الموظف)"><input type="date" style={STY} value={ce.join} onChange={(e) => setCe({ ...ce, join: e.target.value })} /></Field>
          <Field label="تاريخ آخر يوم عمل"><input type="date" style={STY} value={ce.last} onChange={(e) => setCe({ ...ce, last: e.target.value })} /></Field>
          <Field label="السند النظامي (من مواد نظام العمل)">
            <select style={STY} value={ce.law} onChange={(e) => setCe({ ...ce, law: e.target.value })}>
              <option value="">— اختر —</option>
              {Object.entries(CE_LAWS).map(([k, v]) => (
                <option key={k} value={k}>
                  م.{v.art} — {v.ar}
                </option>
              ))}
              <option value="other">أخرى (اكتب المادة)</option>
            </select>
          </Field>
          {ce.law === "other" && <Field label="المادة / السند (نص حر)"><input style={STY} value={ce.other} onChange={(e) => setCe({ ...ce, other: e.target.value })} /></Field>}
          <Field label="تاريخ الاستقالة / الاتفاق (اختياري)"><input type="date" style={STY} value={ce.ref} onChange={(e) => setCe({ ...ce, ref: e.target.value })} /></Field>
          <Field label="ملاحظات (اختياري)"><textarea rows={2} style={STY} value={ce.notes} onChange={(e) => setCe({ ...ce, notes: e.target.value })} /></Field>
          <Buttons label="طباعة إشعار انتهاء العقد" onPrint={() => out(builders.contract_end(), "print")} onSend={() => out(builders.contract_end(), "send")} />
        </Card>

        <Card title="خطاب تعريف راتب" icon="ti-file-certificate">
          <Field label="السادة / الجهة الموجّه إليها الخطاب"><input style={STY} value={sc.to} onChange={(e) => setSc({ ...sc, to: e.target.value })} placeholder="مثال: بنك الراجحي" /></Field>
          <Field label="الجهة بالإنجليزي (للنسخة الإنجليزية)"><input style={STY} value={sc.toEn} onChange={(e) => setSc({ ...sc, toEn: e.target.value })} placeholder="Al Rajhi Bank" /></Field>
          <Field label="مكان إصدار الهوية"><input style={STY} value={sc.place} onChange={(e) => setSc({ ...sc, place: e.target.value })} placeholder="الرياض" /></Field>
          <Field label="مكان الإصدار بالإنجليزي"><input style={STY} value={sc.placeEn} onChange={(e) => setSc({ ...sc, placeEn: e.target.value })} placeholder="Riyadh" /></Field>
          <Field label="لغة الخطاب">
            <select style={STY} value={sc.lang} onChange={(e) => setSc({ ...sc, lang: e.target.value })}>
              <option value="ar">عربي</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="رقم الصادر (تلقائي بتاريخ اليوم)"><input style={STY} value={sc.ref} onChange={(e) => setSc({ ...sc, ref: e.target.value })} placeholder={nextRef()} /></Field>
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}>
            <input type="checkbox" checked={sc.bankOn} onChange={(e) => setSc({ ...sc, bankOn: e.target.checked })} /> إدراج بيانات الحساب البنكي (IBAN) في الخطاب
          </label>
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}>
            <input type="checkbox" checked={sc.seal} onChange={(e) => setSc({ ...sc, seal: e.target.checked })} /> إدراج التوقيع وختم الشركة من الإعدادات
          </label>
          {emp && (
            <div style={{ fontSize: 11, color: "var(--mu)" }}>
              الإجمالي (محسوب) = الأساسي + السكن + المواصلات + البدلات الأخرى = {(emp.salary + emp.housingAllowance + emp.transportAllowance + emp.otherAllowance).toLocaleString("en-US")} ر.س
            </div>
          )}
          <Buttons label="طباعة خطاب تعريف الراتب" onPrint={() => out(builders.salary_cert(), "print")} onSend={() => out(builders.salary_cert(), "send")} />
        </Card>
      </div>

      <BulkCard emps={emps} onSend={bulkSend} />

      <div className="card" style={{ marginTop: 12 }} id="TF_STATUS_BOX">
        <div className="ch">
          <div className="ct">
            <i className="ti ti-list-check" /> حالة النماذج المُرسلة للموظفين
          </div>
          <button type="button" className="btn bpl bsm" onClick={refresh}>
            تحديث
          </button>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>النموذج</th>
                <th>تاريخ الإرسال</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {letters.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--mu)" }}>لا توجد نماذج مرسلة</td>
                </tr>
              ) : (
                letters.map((l) => (
                  <tr key={l.id}>
                    <td>{l.employee_name}</td>
                    <td>{TYPE_AR[l.type] ?? l.title}</td>
                    <td>{new Date(l.created_at).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}</td>
                    <td>
                      {STATUS[l.status] ?? l.status}
                      {l.rejection_reason && <div style={{ fontSize: 10, color: "var(--rd)" }}>{l.rejection_reason}</div>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn bsm"
                        style={{ color: "var(--rd)" }}
                        onClick={() =>
                          window.confirm("حذف النموذج المرسل؟") &&
                          request(`/letters/${l.id}`, { method: "DELETE" }).then(refresh).catch((x) => toast(x instanceof Error ? x.message : String(x), "err"))
                        }
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
