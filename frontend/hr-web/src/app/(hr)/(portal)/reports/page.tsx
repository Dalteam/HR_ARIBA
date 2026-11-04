"use client";

// Reports (التقارير) in the updated design's form (its pages/reports/index.jsx): 11 report cards; every report is
// data (headings + rows) so the viewer can show, hide and reorder columns, report on all or on chosen employees,
// show totals, print and save to Excel. The rows come from OUR API (salary basis, documents registry, leave
// balances). The design's custom-report builder and comprehensive leave report open above the cards
// (components/hr/extra-reports.tsx); the certificates report waits for its step (lib/features.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomReport, LeaveReport } from "@/components/hr/extra-reports";
import { PageState } from "@/components/hr/not-built";
import { saveBlob } from "@/lib/exporter";
import { FEATURES, isReady, type FeatureId } from "@/lib/features";
import { ddmmyyyy } from "@/lib/format";
import { listBalances, type BalanceRow } from "@/lib/leave";
import { printHtml } from "@/lib/print";
import { listDocRegistry, type DocRow } from "@/lib/registry";
import { getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import { buildXlsx } from "@/lib/xlsx";

type Days = { d: number | null };
type Cell = string | number | Days;
type Report = { k: string; i: string; t: string; h: string[]; rows: Cell[][]; tot?: number[] };

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
/** The design's default probation: 90 days from the joining date (labour law art. 53). */
const PROBATION_DAYS = 90;
const NO_EOS = ["consultant", "tamheer", "training"];

const fD = (d: string | null | undefined) => (d ? ddmmyyyy(d) : "—");
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
const money = (v: number) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
const reasonOf = (e: SalaryBasisRow) => e.termination_reason || (e.termination_article ? ART[e.termination_article] : "") || "—";
const consultant = (e: SalaryBasisRow) => e.category === "consultant" || /استشاري/.test(e.job_title ?? "");
const isDays = (c: Cell): c is Days => typeof c === "object" && c !== null;
const cap = (d: number | null) => (d == null ? "—" : d <= 0 ? "منتهي" : d + "ي");
const plain = (c: Cell) => (isDays(c) ? cap(c.d) : c);
function daysLeft(v: string | null | undefined): number | null {
  if (!v) return null;
  const d = new Date(v + "T00:00:00"), t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - t.getTime()) / 86400000);
}
function Dd({ d }: { d: number | null }) {
  if (d == null) return <span className="b bk">—</span>;
  if (d <= 0) return <span className="b br">منتهي</span>;
  return <span className={"b " + (d <= 30 ? "br" : d <= 90 ? "ba" : "bg")}>{d}ي</span>;
}

/** The three report tools of the design that are not ported yet; each opens with its reason. */
const TOOLS: { id: FeatureId; i: string; t: string }[] = [
  { id: "reportCustom", i: "ti-adjustments-horizontal", t: "منشئ التقارير المخصص" },
  { id: "reportCerts", i: "ti-certificate", t: "تقرير الشهادات والمرفقات" },
  { id: "reportLeaves", i: "ti-calendar-stats", t: "تقرير الإجازات الشامل" },
];

export default function Page() {
  const [sal, setSal] = useState<SalaryBasisRow[] | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [bal, setBal] = useState<BalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState("");
  const [prEmp, setPrEmp] = useState("");
  const [tool, setTool] = useState<FeatureId | null>(null);
  const out = useRef<HTMLDivElement>(null);

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

  const cat = useMemo<Report[]>(() => {
    if (!sal) return [];
    const byNo = (x: { emp_no: string }, y: { emp_no: string }) => String(x.emp_no).localeCompare(String(y.emp_no), "en", { numeric: true });
    const a = sal.filter((e) => !e.is_terminated).sort(byNo);
    const term = sal.filter((e) => e.is_terminated);
    const d = [...docs].sort(byNo);
    const byId = new Map(sal.map((e) => [e.id, e]));
    const yr = new Date().getFullYear();
    const years = [yr - 3, yr - 2, yr - 1, yr].map(String);
    return [
      {
        k: "lv", i: "ti-calendar-stats", t: "أرصدة الإجازات",
        h: ["الموظف", "جهة العمل", "المستحق", ...years, "الرصيد"],
        rows: bal.map((b) => [byId.get(b.employee_id)?.emp_no ?? "", b.name_ar, byId.get(b.employee_id)?.workplace ?? "—", b.annual, ...years.map((y) => b.override_used?.[y] ?? 0), r2(b.current)]),
      },
      {
        k: "pr", i: "ti-hourglass", t: "انتهاء فترة التجربة",
        h: ["الموظف", "جهة العمل", "المباشرة", "المدة (يوم)", "الانتهاء", "المتبقي"],
        rows: a
          .filter((e) => e.join_date && (!prEmp || e.id === prEmp))
          .map((e) => {
            const j = new Date(e.join_date + "T00:00:00");
            const end = new Date(j.getFullYear(), j.getMonth(), j.getDate() + PROBATION_DAYS).toISOString().slice(0, 10);
            return { e, end, n: daysLeft(end) };
          })
          .filter((x) => x.n !== null && x.n >= 0)
          .sort((x, y) => x.n! - y.n!)
          .map(({ e, end, n }) => [e.emp_no, e.name_ar, e.workplace || "—", fD(e.join_date), PROBATION_DAYS, fD(end), { d: n || 1 }]),
      },
      {
        k: "iq", i: "ti-id", t: "الإقامات",
        h: ["الموظف", "رقم الإقامة", "جهة العمل", "الانتهاء", "المتبقي"],
        rows: d.filter((e) => e.national_id).sort((x, y) => (x.national_id_days ?? 9999) - (y.national_id_days ?? 9999))
          .map((e) => [e.emp_no, e.name_ar, e.national_id ?? "", e.workplace || "", fD(e.national_id_expiry), { d: e.national_id_days }]),
      },
      {
        k: "pp", i: "ti-passport", t: "الجوازات",
        h: ["الموظف", "الجواز", "الجنسية", "الانتهاء", "المتبقي"],
        rows: d.map((e) => [e.emp_no, e.name_ar, e.passport_no || "—", e.nationality || "—", fD(e.passport_expiry), { d: e.passport_expiry ? e.passport_days : null }]),
      },
      {
        k: "ct", i: "ti-file-text", t: "العقود",
        h: ["الموظف", "جهة العمل", "النوع", "المباشرة", "الانتهاء", "المتبقي"],
        rows: d.map((e) => [e.emp_no, e.name_ar, e.workplace || "—", e.contract_type || "—", fD(e.join_date), fD(e.contract_end_date), { d: e.contract_end_date ? e.contract_days : null }]),
      },
      {
        k: "pay", i: "ti-cash", t: "الرواتب التفصيلي", tot: [3, 4, 5, 6],
        h: ["الموظف", "جهة العمل", "الأساسي", "الإجمالي", "تأمين موظف", "الصافي"],
        rows: a
          .filter((e) => e.category !== "hourly" && !(e.exclude_from_payroll || consultant(e) || e.wps_type === "external" || e.wps_type === "consultant"))
          .map((e) => {
            const st = num(e.total_salary), ins = num(e.gosi_employee);
            return [e.emp_no, e.name_ar, e.workplace || "", r2(num(e.basic_salary)), r2(st), r2(ins), r2(st - ins - num(e.other_deductions))];
          }),
      },
      {
        k: "eos", i: "ti-award", t: "نهاية الخدمة (المنتهية خدمتهم)", tot: [5],
        h: ["الموظف", "جهة العمل", "آخر يوم عمل", "السبب", "المكافأة"],
        rows: term
          .filter((e) => !NO_EOS.includes(e.category) && num(e.eos_basic) > 0)
          .sort((x, y) => num(y.eos_basic) - num(x.eos_basic))
          .map((e) => [e.emp_no, e.name_ar, e.workplace || "—", fD(e.termination_date || e.contract_end_date), reasonOf(e), r2(num(e.eos_basic))]),
      },
      {
        k: "al", i: "ti-alert-triangle", t: "التنبيهات العاجلة",
        h: ["الموظف", "جهة العمل", "النوع", "الانتهاء", "المتبقي"],
        rows: d
          .flatMap((e) =>
            ([["national_id_expiry", "الهوية / الإقامة"], ["passport_expiry", "الجواز"], ["insurance_expiry", "التأمين الطبي"], ["contract_end_date", "العقد"]] as const)
              .map(([k, label]) => ({ e, label, v: e[k], n: daysLeft(e[k]) }))
              .filter((x) => x.n !== null && x.n <= 90),
          )
          .sort((x, y) => x.n! - y.n!)
          .map((x, i) => [i + 1, x.e.name_ar, x.e.workplace || "—", x.label, fD(x.v), { d: x.n }]),
      },
      {
        k: "all", i: "ti-users", t: "كل الموظفين الحاليين", tot: [6],
        h: ["الاسم", "جهة العمل", "الجنسية", "القسم", "المباشرة", "الراتب"],
        rows: a.map((e, i) => [i + 1, e.name_ar, e.workplace || "", e.nationality || "", e.department || "", fD(e.join_date), r2(num(e.total_salary))]),
      },
      {
        k: "term", i: "ti-user-off", t: "المنتهية خدمتهم",
        h: ["الاسم", "جهة العمل", "الجنسية", "آخر يوم عمل", "السبب / البند"],
        rows: term.map((e, i) => [e.emp_no || i + 1, e.name_ar, e.workplace || "—", e.nationality || "—", fD(e.termination_date || e.contract_end_date), reasonOf(e)]),
      },
      {
        k: "in", i: "ti-heart-rate-monitor", t: "التأمين الطبي",
        h: ["الموظف", "شركة التأمين", "الفئة", "رقم البطاقة", "الانتهاء", "المتبقي"],
        rows: d.map((e) => [e.emp_no, e.name_ar, e.insurance_company || "—", e.insurance_class || "—", e.insurance_card_no || "—", fD(e.insurance_expiry), { d: e.insurance_expiry ? e.insurance_days : null }]),
      },
    ];
  }, [sal, docs, bal, prEmp]);

  const R = cat.find((c) => c.k === sel) ?? null;
  // the design's column and employee chooser: every column on, all employees, totals on — reset when the report changes
  const H = useMemo(() => (R ? ["#", ...R.h] : []), [R]);
  const [ord, setOrd] = useState<number[]>([]);
  const [rmode, setRmode] = useState<"all" | "pick">("all");
  const [rsel, setRsel] = useState<Record<string, boolean>>({});
  const [rq, setRq] = useState("");
  const [rtot, setRtot] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrd(H.map((_, i) => i));
    setRmode("all");
    setRsel({});
    setRq("");
  }, [sel, H]);
  useEffect(() => {
    if (sel) out.current?.scrollIntoView({ behavior: "smooth" });
  }, [sel]);

  if (!sal) return <div className="pg on" id="pg-rpt"><PageState loading={!error} error={error} /></div>;

  const ordv = (ord.length ? ord : H.map((_, i) => i)).filter((i) => i < H.length);
  const rkey = (r: Cell[]) => String(r[0]) + "|" + String(isDays(r[1]) ? "" : r[1]);
  const rlabel = (r: Cell[]) => (isDays(r[1]) ? "" : String(r[1])) + " #" + String(r[0]);
  const rowsV = R ? R.rows.filter((r) => rmode === "all" || rsel[rkey(r)]) : [];
  const toggleC = (i: number) => setOrd((o) => { const c = o.length ? o : H.map((_, k) => k); return c.includes(i) ? c.filter((x) => x !== i) : [...c, i]; });
  const moveC = (p: number, dir: number) =>
    setOrd((o) => {
      const n = [...(o.length ? o : H.map((_, k) => k))], j = p + dir;
      if (j < 0 || j >= n.length) return n;
      [n[p], n[j]] = [n[j], n[p]];
      return n;
    });
  const totPos = R?.tot ? ordv.map((ci, p) => (R.tot!.includes(ci) ? p : -1)).filter((p) => p >= 0) : [];
  const totV = totPos.map((p) => ({ p, v: rowsV.reduce((s, r) => s + num(r[ordv[p]]), 0) }));
  const title = R ? R.t + " (" + rowsV.length + ")" : "";
  const cellTxt = (r: Cell[], p: number) => { const c = r[ordv[p]]; return typeof c === "number" && R?.tot?.includes(ordv[p]) ? money(c) : String(plain(c)); };
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

  function print() {
    const th = "background:#014D3D;color:#fff;padding:4px 6px;font-size:10px;border:1px solid #014D3D", td = "padding:3px 6px;border:1px solid #d9e3df;font-size:10px;text-align:center";
    const total = rtot && totV.length
      ? '<tr style="font-weight:800;background:#eef4f2"><td style="' + td + '" colspan="' + totV[0].p + '">المجموع</td>' +
        ordv.slice(totV[0].p).map((_, q) => { const t2 = totV.find((x) => x.p === totV[0].p + q); return '<td style="' + td + '">' + esc(t2 ? money(t2.v) : "") + "</td>"; }).join("") + "</tr>"
      : "";
    printHtml(title,
      '<table style="width:100%;border-collapse:collapse"><thead><tr>' + ordv.map((i) => '<th style="' + th + '">' + esc(H[i]) + "</th>").join("") + "</tr></thead><tbody>" +
      rowsV.map((r) => "<tr>" + ordv.map((_, p) => '<td style="' + td + '">' + esc(cellTxt(r, p)) + "</td>").join("") + "</tr>").join("") + total + "</tbody></table>");
  }
  function xlsx() {
    if (!R) return;
    const blob = buildXlsx([{ name: R.t.slice(0, 30), widths: [8, 28, 16, 16, 16, 16, 16, 16], rows: [[title], [], ordv.map((i) => H[i]), ...rowsV.map((r) => ordv.map((_, p) => plain(r[ordv[p]])))] }]);
    saveBlob({ blob, name: "report_" + R.k + ".xlsx", mime: blob.type });
  }

  return (
    <div className="pg on" id="pg-rpt">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: 10, marginBottom: 10 }}>
        {TOOLS.map((x) => (
          <div key={x.id} onClick={() => setTool(tool === x.id ? null : x.id)} style={{ background: "var(--c)", border: (isReady(x.id) ? "1px solid " : "1px dashed ") + (tool === x.id ? "var(--bl)" : "var(--bd)"), borderRadius: 10, padding: 12, cursor: "pointer", opacity: isReady(x.id) ? 1 : 0.75 }}>
            <i className={"ti " + x.i} style={{ fontSize: 20, color: "var(--bl)", display: "block", marginBottom: 6 }} />
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{x.t}</div>
          </div>
        ))}
      </div>
      {tool === "reportCustom" && isReady(tool) && <CustomReport />}
      {tool === "reportLeaves" && isReady(tool) && <LeaveReport />}
      {tool && !isReady(tool) && (
        <div className="al alb" style={{ marginBottom: 12 }}>
          <i className="ti ti-hourglass" aria-hidden />
          <div><strong>غير متاح بعد</strong><div>يُفتح بعد {FEATURES[tool].waits?.ar}</div></div>
        </div>
      )}
      <div id="RG" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: 10, marginBottom: 14 }}>
        {[...cat.filter((c) => c.k !== "in"), ...cat.filter((c) => c.k === "in")].map((c) => (
          <div key={c.k} data-rpt={c.k} onClick={() => setSel(c.k)} style={{ background: "var(--c)", border: "1px solid " + (sel === c.k ? "var(--bl)" : "var(--bd)"), borderRadius: 10, padding: 14, cursor: "pointer", transition: "all .15s" }}>
            {c.k === "in" ? (
              <>
                <div style={{ fontWeight: 800 }}>🩺 {c.t}</div>
                <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 5 }}>طباعة تقرير التأمين الطبي منفردًا</div>
              </>
            ) : (
              <>
                <i className={"ti " + c.i} style={{ fontSize: 22, color: "var(--bl)", display: "block", marginBottom: 7 }} />
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.k === "eos" ? "نهاية الخدمة" : c.t}</div>
              </>
            )}
          </div>
        ))}
      </div>
      {sel === "pr" && (
        <div className="card" style={{ marginBottom: 10, padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
          <b>الموظف:</b>
          <select id="PR_EMP" value={prEmp} onChange={(ev) => setPrEmp(ev.target.value)}>
            <option value="">كل الموظفين</option>
            {sal.filter((e) => !e.is_terminated).map((e) => <option key={e.id} value={e.id}>{e.emp_no} — {e.name_ar}</option>)}
          </select>
          <span style={{ color: "var(--mu)" }}>تُحسب النهاية من تاريخ المباشرة ({PROBATION_DAYS} يومًا)، ويختفي الموظف تلقائيًا بعدها.</span>
        </div>
      )}
      {R && (
        <div className="card crx" id="RO" ref={out}>
          <div className="ch">
            <div className="ct" id="RT">{title}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button type="button" className="btn bsm" onClick={print} title="طباعة"><i className="ti ti-printer" /></button>
              <button type="button" className="btn bsm" style={{ background: "var(--pu)", color: "#fff" }} onClick={xlsx}><i className="ti ti-file-spreadsheet" /> Excel</button>
            </div>
          </div>
          <div className="cr-sec" style={{ margin: "0 12px 10px" }}>
            <div className="cr-ot">الأعمدة (اضغط لإظهار/إخفاء — الترتيب بالأسهم)</div>
            <div className="cr-chips" style={{ margin: "6px 0" }}>
              {H.map((x, i) => (
                <label key={i} className={"cr-chip" + (ordv.includes(i) ? " on" : "")}>
                  <input type="checkbox" data-rc={i} checked={ordv.includes(i)} onChange={() => toggleC(i)} />
                  {x}
                </label>
              ))}
            </div>
            <div className="cr-ol">
              {ordv.map((ci, p) => (
                <span key={ci} className="cr-oi">
                  <button type="button" disabled={p === 0} onClick={() => moveC(p, -1)}>›</button>
                  <b>{p + 1}.</b> {H[ci]}
                  <button type="button" disabled={p === ordv.length - 1} onClick={() => moveC(p, 1)}>‹</button>
                </span>
              ))}
            </div>
            <div className="cr-row" style={{ marginTop: 8 }}>
              {([["all", "كل الموظفين"], ["pick", "موظف / موظفون محددون"]] as const).map(([k, l]) => (
                <label key={k} className={"cr-radio" + (rmode === k ? " on" : "")}>
                  <input type="radio" name="rpm" checked={rmode === k} onChange={() => setRmode(k)} /> {l}
                </label>
              ))}
              {totPos.length > 0 && (
                <label className={"cr-radio" + (rtot ? " on" : "")}>
                  <input type="checkbox" checked={rtot} onChange={(e) => setRtot(e.target.checked)} /> إظهار المجموع
                </label>
              )}
            </div>
            {rmode === "pick" && (
              <div style={{ marginTop: 8 }}>
                <div className="cr-row">
                  <input id="RO_Q" placeholder="ابحث…" value={rq} onChange={(e) => setRq(e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="btn bsm" onClick={() => setRsel((m) => { const n = { ...m }; R.rows.filter((r) => !rq || rlabel(r).includes(rq)).forEach((r) => { n[rkey(r)] = true; }); return n; })}>
                    تحديد الظاهر
                  </button>
                  <button type="button" className="btn bsm" onClick={() => setRsel({})}>مسح</button>
                </div>
                <div className="cr-emps">
                  {R.rows.filter((r) => !rq || rlabel(r).includes(rq)).map((r) => (
                    <label key={rkey(r)}>
                      <input type="checkbox" checked={!!rsel[rkey(r)]} onChange={() => setRsel((m) => ({ ...m, [rkey(r)]: !m[rkey(r)] }))} /> {rlabel(r)}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="tw" id="RC">
            <table>
              <thead><tr>{ordv.map((ci, p) => <th key={p}>{H[ci]}</th>)}</tr></thead>
              <tbody>
                {rowsV.map((r, ri) => (
                  <tr key={ri}>
                    {ordv.map((ci, p) => {
                      const c = r[ci];
                      return <td key={p}>{isDays(c) ? <Dd d={c.d} /> : typeof c === "number" && R.tot?.includes(ci) ? money(c) : c}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              {rtot && totV.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={totV[0].p}>المجموع</td>
                    {ordv.slice(totV[0].p).map((_, q) => { const t2 = totV.find((x) => x.p === totV[0].p + q); return <td key={q}>{t2 ? money(t2.v) : ""}</td>; })}
                  </tr>
                </tfoot>
              )}
            </table>
            {!rowsV.length && <div style={{ padding: 20, textAlign: "center", color: "var(--mu)" }}>لا توجد بيانات</div>}
          </div>
        </div>
      )}
    </div>
  );
}
