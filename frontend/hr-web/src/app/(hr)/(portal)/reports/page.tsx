"use client";

// Reports (التقارير) — port of #pg-rpt: the 9 report cards of buildRpts (main/15-reports.js) with the FINAL version of
// each report after the patches: rptLv/rptIq/rptAlerts (main/15), rptPp/rptCt (V60), rptPay/rptAll (V42),
// rptEOS (V44), rptTerm (V62). The V60 standalone medical-insurance card is removed again by V55.
import { useEffect, useRef, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { ddmmyyyy } from "@/lib/format";
import { printHtml } from "@/lib/print";
import { listBalances, type BalanceRow } from "@/lib/leave";
import { listDocRegistry, type DocRow } from "@/lib/registry";
import { fN, getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";

type Fn = "rptLv" | "rptIq" | "rptPp" | "rptCt" | "rptPay" | "rptEOS" | "rptAlerts" | "rptAll" | "rptTerm";
const CARDS: { i: string; ar: string; fn: Fn }[] = [
  { i: "ti-calendar-stats", ar: "أرصدة الإجازات", fn: "rptLv" },
  { i: "ti-id", ar: "الإقامات", fn: "rptIq" },
  { i: "ti-passport", ar: "الجوازات", fn: "rptPp" },
  { i: "ti-file-text", ar: "العقود", fn: "rptCt" },
  { i: "ti-cash", ar: "الرواتب التفصيلي", fn: "rptPay" },
  { i: "ti-award", ar: "نهاية الخدمة", fn: "rptEOS" },
  { i: "ti-alert-triangle", ar: "التنبيهات العاجلة", fn: "rptAlerts" },
  { i: "ti-users", ar: "كل الموظفين الحاليين", fn: "rptAll" },
  { i: "ti-user-off", ar: "المنتهية خدمتهم", fn: "rptTerm" },
];

const ART: Record<string, string> = {
  art_84: "م.84 — إنهاء من الشركة",
  art_74: "م.74 — اتفاق الطرفين",
  art_85: "م.85 — استقالة",
  art_75: "م.75 — استقالة قسرية",
  art_77: "م.77 — فصل تعسفي",
  art_80: "م.80 — فصل تأديبي",
  art_53: "م.53 — تجربة",
  art_74_retirement: "م.74(4) — تقاعد",
  art_74_death: "م.74(3) — وفاة/عجز",
};

const fD = (d: string | null) => (d ? ddmmyyyy(d) : "—");
const date44 = (v: string | null) => (v ? new Date(v).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn") : "—");
const money44 = (v: number) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
const n44 = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const reasonOf = (e: SalaryBasisRow) => e.termination_reason || (e.termination_article ? ART[e.termination_article] : "") || "—";
const consultant = (e: SalaryBasisRow) => e.category === "consultant" || /استشاري/.test(e.job_title ?? "");

function DBadge({ d }: { d: number | null }) {
  if (d === null || d >= 9999) return <span className="b bk">—</span>;
  if (d <= 0) return <span className="b br">منتهي</span>;
  if (d <= 30) return <span className="b br">{d}ي</span>;
  if (d <= 90) return <span className="b ba">{d}ي</span>;
  return <span className="b bg">{d}ي</span>;
}

/** Legacy rptAlerts `left`: ceil((date − today)/day). */
function left(v: string | null): number | null {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - t.getTime()) / 86400000);
}

export default function Page() {
  const [sal, setSal] = useState<SalaryBasisRow[] | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [bal, setBal] = useState<BalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Fn | null>(null);
  const out = useRef<HTMLDivElement>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    let alive = true;
    Promise.all([getSalaryBasis(), listDocRegistry(), listBalances()])
      .then(([s, d, b]) => {
        if (!alive) return;
        setSal(s);
        setDocs(d);
        setBal(b);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (open) out.current?.scrollIntoView({ behavior: "smooth" });
  }, [open]);

  if (!sal) return <div className="pg on" id="pg-rpt"><PageState loading={!error} error={error} /></div>;

  const current = sal.filter((e) => !e.is_terminated);
  const terminated = sal.filter((e) => e.is_terminated);
  const byId = new Map(sal.map((e) => [e.id, e]));

  function report(): { title: string; body: React.ReactNode } | null {
    switch (open) {
      case "rptLv": {
        const years = Array.from({ length: Math.max(1, year - 2023 + 1) }, (_, i) => String(2023 + i));
        return {
          title: "أرصدة الإجازات",
          body: (
            <table>
              <tbody>
                <tr>
                  <th>#</th><th>الموظف</th><th>جهة العمل</th><th>المستحق</th>
                  {years.map((y) => <th key={y}>{y}</th>)}
                  <th>الرصيد</th>
                </tr>
                {bal.map((b) => {
                  const e = byId.get(b.employee_id);
                  return (
                    <tr key={b.employee_id}>
                      <td>{e?.emp_no ?? ""}</td>
                      <td>{b.name_ar}</td>
                      <td>{e?.workplace ?? "—"}</td>
                      <td>{b.annual}</td>
                      {years.map((y) => <td key={y}>{b.override_used?.[y] ?? 0}</td>)}
                      <td style={{ fontWeight: 700, color: b.current > 0 ? "var(--gr)" : "var(--rd)" }}>{b.current.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ),
        };
      }
      case "rptIq": {
        const a = docs.filter((e) => e.national_id).sort((x, y) => (x.national_id_days ?? 9999) - (y.national_id_days ?? 9999));
        return {
          title: "تقرير الإقامات",
          body: (
            <table>
              <tbody>
                <tr><th>#</th><th>الموظف</th><th>رقم الإقامة</th><th>جهة العمل</th><th>الانتهاء</th><th>المتبقي</th></tr>
                {a.map((e) => (
                  <tr key={e.id}><td>{e.emp_no}</td><td>{e.name_ar}</td><td>{e.national_id}</td><td>{e.workplace}</td><td>{fD(e.national_id_expiry)}</td><td><DBadge d={e.national_id_days ?? 9999} /></td></tr>
                ))}
              </tbody>
            </table>
          ),
        };
      }
      case "rptPp":
        return {
          title: "تقرير الجوازات",
          body: (
            <table>
              <tbody>
                <tr><th>#</th><th>الموظف</th><th>الجواز</th><th>الجنسية</th><th>الانتهاء</th><th>المتبقي</th></tr>
                {docs.map((e) => (
                  <tr key={e.id}><td>{e.emp_no}</td><td>{e.name_ar}</td><td>{e.passport_no || "—"}</td><td>{e.nationality || "—"}</td><td>{fD(e.passport_expiry)}</td><td>{e.passport_expiry ? <DBadge d={e.passport_days} /> : "غير مكتمل"}</td></tr>
                ))}
              </tbody>
            </table>
          ),
        };
      case "rptCt":
        return {
          title: "تقرير العقود",
          body: (
            <table>
              <tbody>
                <tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>النوع</th><th>المباشرة</th><th>الانتهاء</th><th>المتبقي</th></tr>
                {docs.map((e) => (
                  <tr key={e.id}><td>{e.emp_no}</td><td>{e.name_ar}</td><td>{e.workplace || "—"}</td><td>{e.contract_type || "—"}</td><td>{fD(e.join_date)}</td><td>{fD(e.contract_end_date)}</td><td>{e.contract_end_date ? <DBadge d={e.contract_days} /> : "مفتوح"}</td></tr>
                ))}
              </tbody>
            </table>
          ),
        };
      case "rptPay": {
        const ws = current.filter((e) => !(e.exclude_from_payroll || consultant(e) || e.wps_type === "external" || e.wps_type === "consultant"));
        const tot = ws.reduce((s, e) => s + Number(e.total_salary), 0);
        const ins = ws.reduce((s, e) => s + Number(e.gosi_employee), 0);
        const net = ws.reduce((s, e) => s + Number(e.net_salary), 0);
        return {
          title: "تقرير الرواتب",
          body: (
            <table>
              <tbody>
                <tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>الأساسي</th><th>الإجمالي</th><th>تأمين موظف</th><th>الصافي</th></tr>
                {ws.map((e) => (
                  <tr key={e.id}>
                    <td>{e.emp_no}</td><td>{e.name_ar}</td><td>{e.workplace}</td>
                    <td>{fN(e.basic_salary)} ر.س</td>
                    <td style={{ color: "var(--gr)" }}>{fN(e.total_salary)} ر.س</td>
                    <td style={{ color: "var(--rd)" }}>{e.is_saudi ? "-" + fN(e.gosi_employee) : "لا يوجد"}</td>
                    <td style={{ color: "var(--cy)", fontWeight: 700 }}>{fN(e.net_salary)} ر.س</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4}>المجموع</td><td style={{ color: "var(--gr)" }}>{fN(tot)}</td><td style={{ color: "var(--rd)" }}>-{fN(ins)}</td><td style={{ color: "var(--cy)" }}>{fN(net)}</td></tr>
              </tfoot>
            </table>
          ),
        };
      }
      case "rptEOS": {
        const a = terminated
          .filter((x) => !/البوصيري|bosiri|bosairy/.test(n44(x.name_ar)) && !/وسيم|wassim/.test(n44(x.name_ar)) && Number(x.eos_basic) > 0)
          .map((x) => ({ x, amount: Number(x.eos_basic) }))
          .sort((p, q) => q.amount - p.amount);
        return {
          title: "تقرير مكافأة نهاية الخدمة — الموظفون الذين لهم مكافأة مسجلة فقط",
          body: (
            <>
              <div style={{ padding: "8px 0 12px", fontWeight: 700 }}>يظهر هنا فقط الموظفون المنتهية خدماتهم الذين لديهم مبلغ مكافأة نهاية خدمة مسجل بأكثر من صفر.</div>
              <table>
                <tbody>
                  <tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>آخر يوم عمل</th><th>السبب / بند الاستحقاق</th><th>مكافأة نهاية الخدمة</th></tr>
                  {a.map(({ x, amount }) => (
                    <tr key={x.id}><td>{x.emp_no}</td><td>{x.name_ar}</td><td>{x.workplace || "—"}</td><td>{date44(x.termination_date || x.contract_end_date)}</td><td>{reasonOf(x)}</td><td style={{ color: "var(--gr)", fontWeight: 700 }}>{money44(amount)}</td></tr>
                  ))}
                </tbody>
              </table>
              {!a.length && <div style={{ padding: 20, textAlign: "center", color: "var(--mu)" }}>لا يوجد موظف منتهي الخدمة لديه مكافأة نهاية خدمة مسجلة بأكثر من صفر.</div>}
            </>
          ),
        };
      }
      case "rptAlerts": {
        const al: { id: string; name: string; employer: string; type: string; date: string; days: number }[] = [];
        docs.forEach((e) => {
          ([["national_id_expiry", "الهوية / الإقامة"], ["passport_expiry", "الجواز"], ["contract_end_date", "العقد"]] as const).forEach(([k, label]) => {
            const v = e[k];
            const d = left(v);
            if (d !== null && d <= 90) al.push({ id: e.id + k, name: e.name_ar, employer: e.workplace || "—", type: label, date: v!, days: d });
          });
        });
        al.sort((a, b) => a.days - b.days);
        return {
          title: `التنبيهات العاجلة (${al.length})`,
          body: (
            <table>
              <tbody>
                <tr><th>الموظف</th><th>جهة العمل</th><th>النوع</th><th>الانتهاء</th><th>المتبقي</th></tr>
                {al.map((a) => (
                  <tr key={a.id}><td>{a.name}</td><td>{a.employer}</td><td>{a.type}</td><td>{fD(a.date)}</td><td>{a.days <= 0 ? <span className="b br">منتهي</span> : <DBadge d={a.days} />}</td></tr>
                ))}
              </tbody>
            </table>
          ),
        };
      }
      case "rptAll":
        return {
          title: `الموظفون الحاليون (${current.length})`,
          body: (
            <table>
              <tbody>
                <tr><th>#</th><th>الاسم</th><th>جهة العمل</th><th>الجنسية</th><th>القسم</th><th>المباشرة</th><th>الراتب</th></tr>
                {current.map((e, i) => (
                  <tr key={e.id}><td>{i + 1}</td><td>{e.name_ar}</td><td>{e.workplace}</td><td>{e.nationality}</td><td>{e.department}</td><td>{fD(e.join_date)}</td><td style={{ color: "var(--gr)" }}>{fN(e.total_salary)}</td></tr>
                ))}
              </tbody>
            </table>
          ),
        };
      case "rptTerm":
        return {
          title: `المنتهية خدماتهم (${terminated.length})`,
          body: (
            <table>
              <tbody>
                <tr><th>#</th><th>الاسم</th><th>جهة العمل</th><th>الجنسية</th><th>آخر يوم عمل</th><th>السبب / البند</th></tr>
                {terminated.map((x, i) => (
                  <tr key={x.id}><td>{x.emp_no || i + 1}</td><td>{x.name_ar}</td><td>{x.workplace || "—"}</td><td>{x.nationality || "—"}</td><td>{fD(x.termination_date || x.contract_end_date)}</td><td>{reasonOf(x)}</td></tr>
                ))}
              </tbody>
            </table>
          ),
        };
      default:
        return null;
    }
  }

  const r = report();

  return (
    <div className="pg on" id="pg-rpt">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: 10, marginBottom: 14 }} id="RG">
        {CARDS.map((c) => (
          <div
            key={c.fn}
            onClick={() => setOpen(c.fn)}
            className="rpt-card"
            style={{ background: "var(--c)", border: `1px solid ${open === c.fn ? "var(--bl)" : "var(--bd)"}`, borderRadius: 10, padding: 14, cursor: "pointer", transition: "all .15s" }}
          >
            <i className={"ti " + c.i} style={{ fontSize: 22, color: "var(--bl)", display: "block", marginBottom: 7 }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>{c.ar}</div>
          </div>
        ))}
      </div>
      {r && (
        <div className="card" id="RO" ref={out}>
          <div className="ch">
            <div className="ct" id="RT">
              {r.title}
            </div>
            <button type="button" className="btn bsm" onClick={() => printHtml(r.title, document.getElementById("RC")?.innerHTML ?? "")}>
              <i className="ti ti-printer" />
            </button>
          </div>
          <div id="RC" className="tw">
            {r.body}
          </div>
        </div>
      )}
    </div>
  );
}
