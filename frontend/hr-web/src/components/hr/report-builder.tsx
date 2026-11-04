"use client";

// The updated design's column-chooser report (its reports/CustomReport.jsx and reports/LeaveReport.jsx share this
// shape): grouped columns with presets, column order and templates saved in this browser, all / filtered / hand-picked
// employees, a preview, and the export dialog (PDF / Excel / Word; e-mail waits). `tools` adds the leave report's
// search, sort by a column, group by department, totals and the low-balance filter.
import { useEffect, useMemo, useState } from "react";
import { ExportDialog } from "@/components/hr/page-export";
import { printDoc, tfWrap } from "@/lib/calc/forms";
import { useLocale } from "@/lib/i18n/locale";

export type V = string | number;
export type Col<R, C> = { grp: string; k: string; ar: string; en: string; num?: boolean; get: (r: R, ctx: C) => V };
export type Person = { id: string; empNo: string; nameAr: string; nameEn: string; employer: string; dept: string; terminated: boolean };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const r2 = (n: number) => Math.round(n * 100) / 100;

function St({ n, t, sub, right }: { n: string; t: string; sub?: string; right?: React.ReactNode }) {
  return <div className="cr-st"><span className="cr-n">{n}</span><div style={{ flex: 1 }}><div className="cr-t">{t}</div>{sub && <div className="cr-s">{sub}</div>}</div>{right}</div>;
}

export function ReportBuilder<R extends Person, C>({
  id, icon, title, sub, catalog, groupsEn, groupIcons, presets, defaults, storageKey, rows: all, ctx, top, tools, lowKeys = [], allowTerminated,
}: {
  id: string; icon: string; title: [string, string]; sub: [string, string]; catalog: Col<R, C>[]; groupsEn: Record<string, string>; groupIcons?: Record<string, string>;
  presets: [string, string, string[], string?][]; defaults: string[]; storageKey: string; rows: R[]; ctx: (en: boolean) => C; top?: React.ReactNode; tools?: boolean; lowKeys?: string[]; allowTerminated?: boolean;
}) {
  const { lang } = useLocale();
  const [rl, setRl] = useState("");
  const en = rl ? rl === "en" : lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const [fields, setFields] = useState(defaults);
  const [mode, setMode] = useState<"all" | "pick">("all");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [inclTerm, setInclTerm] = useState(false);
  const [fEmployer, setFEmployer] = useState("");
  const [fDept, setFDept] = useState("");
  const [tpls, setTpls] = useState<{ n: string; f: string[] }[]>([]);
  const [tname, setTname] = useState("");
  const [dlg, setDlg] = useState(false);
  const [tq, setTq] = useState("");
  const [sortI, setSortI] = useState(-1);
  const [sortD, setSortD] = useState(1);
  const [grpBy, setGrpBy] = useState(false);
  const [showTot, setShowTot] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setTpls(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { /* ignore */ }
  }, [storageKey]);
  const saveTpls = (nx: { n: string; f: string[] }[]) => { setTpls(nx); try { localStorage.setItem(storageKey, JSON.stringify(nx)); } catch { /* ignore */ } };
  const groups = [...new Set(catalog.map((c) => c.grp))];
  const employers = useMemo(() => [...new Set(all.map((e) => e.employer).filter(Boolean))], [all]);
  const depts = useMemo(() => [...new Set(all.map((e) => e.dept).filter(Boolean))], [all]);
  const pool = useMemo(
    () => all.filter((e) => (inclTerm || !e.terminated) && (!fEmployer || e.employer === fEmployer) && (!fDept || e.dept === fDept)).sort((a, b) => String(a.empNo).localeCompare(String(b.empNo), "en", { numeric: true })),
    [all, inclTerm, fEmployer, fDept],
  );
  const emps = mode === "all" ? pool : pool.filter((e) => sel[e.id]);
  const byKey = useMemo(() => Object.fromEntries(catalog.map((c) => [c.k, c])), [catalog]);
  const cols = fields.map((k) => byKey[k]).filter(Boolean);
  const c0 = ctx(en);
  const rows = emps.map((e) => ({ e, r: cols.map((c) => { const v = c.get(e, c0); return v == null ? "" : v; }) }));
  const toggle = (k: string) => setFields((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const move = (i: number, d: number) => setFields((f) => { const n = [...f], j = i + d; if (j < 0 || j >= n.length) return f; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const grpAll = (g: string, on: boolean) => setFields((f) => { const ks = catalog.filter((c) => c.grp === g).map((c) => c.k); return on ? [...f, ...ks.filter((k) => !f.includes(k))] : f.filter((k) => !ks.includes(k)); });
  const headers = cols.map((c) => (en ? c.en : c.ar));
  const balI = lowKeys.map((k) => cols.findIndex((c) => c.k === k)).find((i) => i >= 0);
  // the leave report's view: search, low balances, sort, group by department, totals
  const view = (() => {
    let L = rows.filter((x) => (!tq || x.r.some((c) => String(c).toLowerCase().includes(tq.toLowerCase()))) && (!lowOnly || balI == null || (Number(x.r[balI]) || 0) <= 5));
    if (sortI >= 0) L = [...L].sort((a, b) => { const x = a.r[sortI], z = b.r[sortI], nx = Number(x), nz = Number(z); const c = isFinite(nx) && isFinite(nz) && x !== "" && z !== "" ? nx - nz : String(x).localeCompare(String(z), "ar"); return c * sortD; });
    const sums = (list: typeof L) => cols.map((c, i) => (c.num ? r2(list.reduce((s, x) => s + (Number(x.r[i]) || 0), 0)) : ""));
    const out: ({ t: "row"; r: V[] } | { t: "grp"; label: string } | { t: "sub" | "tot"; label: string; cells: V[] })[] = [];
    if (tools && grpBy) {
      const gs: Record<string, typeof L> = {};
      L.forEach((x) => { const d = x.e.dept || T("بدون قسم", "No department"); (gs[d] = gs[d] || []).push(x); });
      Object.keys(gs).sort((m, n) => m.localeCompare(n, "ar")).forEach((d) => { out.push({ t: "grp", label: d + " (" + gs[d].length + ")" }); gs[d].forEach((x) => out.push({ t: "row", r: x.r })); if (showTot) out.push({ t: "sub", label: T("إجمالي ", "Subtotal ") + d, cells: sums(gs[d]) }); });
    } else L.forEach((x) => out.push({ t: "row", r: x.r }));
    if (tools && showTot) out.push({ t: "tot", label: T("الإجمالي العام", "Grand total"), cells: sums(L) });
    return out;
  })();
  const shownRows = view.filter((it): it is { t: "row"; r: V[] } => it.t === "row").map((it) => it.r.map(String));
  const spec = { title: T(title[0], title[1]), sub: new Date().toLocaleDateString(en ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn") + " — " + emps.length + T(" موظف", " employees"), headers, rows: shownRows, name: id.toLowerCase(), dir: (en ? "ltr" : "rtl") as "ltr" | "rtl" };
  const ok = cols.length > 0 && emps.length > 0;
  const list = pool.filter((e) => !q || e.nameAr.includes(q) || e.nameEn.toLowerCase().includes(q.toLowerCase()) || String(e.empNo).includes(q));
  const balCls = (j: number, v: V) => (j === balI ? (Number(v) < 0 ? "lvr-neg" : Number(v) <= 5 ? "lvr-low" : "") : "");
  function print() {
    const th = "background:#014D3D;color:#fff;padding:5px 5px;font-size:9.5px;border:1px solid #014D3D", td = "padding:3px 5px;border:1px solid #d9e3df;font-size:9.5px;text-align:center";
    let k = 0, body = "";
    view.forEach((it) => {
      if (it.t === "row") { k++; body += '<tr style="background:' + (k % 2 ? "#fff" : "#f4f8f6") + '"><td style="' + td + '">' + k + "</td>" + it.r.map((c, j) => '<td style="' + td + (j === balI && Number(c) < 0 ? ";background:#fde8e8;color:#b42318;font-weight:700" : j === balI && Number(c) <= 5 ? ";background:#fff4e0;color:#9a5b00;font-weight:700" : "") + '">' + esc(c) + "</td>").join("") + "</tr>"; }
      else if (it.t === "grp") body += '<tr><td colspan="' + (cols.length + 1) + '" style="background:#e3eeea;color:#014D3D;font-weight:800;padding:4px 6px;font-size:10px;text-align:right">' + esc(it.label) + "</td></tr>";
      else body += '<tr style="font-weight:800;background:' + (it.t === "tot" ? "#d5e6df" : "#eef4f2") + '"><td style="' + td + '" colspan="2">' + esc(it.label) + "</td>" + it.cells.slice(1).map((c) => '<td style="' + td + '">' + esc(c) + "</td>").join("") + "</tr>";
    });
    const h = '<div dir="' + (en ? "ltr" : "rtl") + '" style="font-family:Tahoma,Arial,sans-serif"><div style="text-align:center;font-size:10px;color:#5b7a72;margin-bottom:6px">' + esc(spec.sub) + (fDept ? " — " + esc(fDept) : "") + '</div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + th + '">#</th>' + headers.map((x) => '<th style="' + th + '">' + esc(x) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table>" + (balI != null ? '<div style="margin-top:10px;font-size:10px;color:#5b7a72">' + esc(T("الأرصدة المنخفضة: أصفر ≤ 5 أيام، أحمر سالب", "Low: amber ≤ 5 days, red negative")) + "</div>" : "") + "</div>";
    printDoc(spec.title, tfWrap(spec.title, "", h));
  }
  return (
    <div className="card crx" id={id} style={{ marginBottom: 14 }}>
      <div className="ch">
        <div className="ct"><i className={"ti " + icon} /> <span>{T(title[0], title[1])}</span></div>
        <span style={{ fontSize: 11, color: "var(--mu)" }}>{T(sub[0], sub[1])}</span>
      </div>
      <div className="cr-wrap">
        <div className="cr-side">
          <div className="cr-sec">
            <St n="1" t={T("اختر الأعمدة", "Choose columns")} sub={T("ابدأ بقالب جاهز أو اختر بنفسك", "Start from a preset or pick your own")}
              right={<><span className="b bb">{cols.length}</span><button type="button" className="btn bsm" onClick={() => setFields(catalog.map((c) => c.k))}>{T("الكل", "All")}</button><button type="button" className="btn bsm" onClick={() => setFields([])}>{T("مسح", "None")}</button></>} />
            {top}
            <div className="cr-pre">
              {presets.map(([a, b, ks, ic]) => <button type="button" key={a} className="cr-pbtn" onClick={() => setFields(ks)}>{ic && <i className={"ti " + ic} />} {en ? b : a}</button>)}
              {tpls.map((t) => <span key={t.n} className="cr-pbtn cr-tpl"><button type="button" onClick={() => setFields(t.f)}><i className="ti ti-bookmark" /> {t.n}</button><button type="button" title={T("حذف القالب", "Delete")} onClick={() => saveTpls(tpls.filter((x) => x.n !== t.n))}>×</button></span>)}
            </div>
            <div className="cr-groups">
              {groups.map((g) => {
                const items = catalog.filter((c) => c.grp === g), n = items.filter((c) => fields.includes(c.k)).length;
                return (
                  <div key={g} className="cr-g">
                    <div className="cr-gh">{groupIcons?.[g] && <i className={"ti " + groupIcons[g]} />} <b>{en ? groupsEn[g] ?? g : g}</b><span className="cr-gc">{n}/{items.length}</span>
                      <button type="button" className="cr-gl" onClick={() => grpAll(g, n < items.length)}>{n < items.length ? T("تحديد الكل", "All") : T("إلغاء", "None")}</button></div>
                    <div className="cr-chips">{items.map((c) => <label key={c.k} className={"cr-chip" + (fields.includes(c.k) ? " on" : "")}><input type="checkbox" checked={fields.includes(c.k)} onChange={() => toggle(c.k)} />{en ? c.en : c.ar}</label>)}</div>
                  </div>
                );
              })}
            </div>
            {cols.length > 0 && (
              <div className="cr-order"><div className="cr-ot">{T("ترتيب الأعمدة في التقرير", "Column order")}</div>
                <div className="cr-ol">{cols.map((c, i) => <span key={c.k} className="cr-oi"><button type="button" disabled={i === 0} onClick={() => move(i, -1)} title={T("تقديم", "Earlier")}>›</button><b>{i + 1}.</b> {en ? c.en : c.ar}<button type="button" disabled={i === cols.length - 1} onClick={() => move(i, 1)} title={T("تأخير", "Later")}>‹</button></span>)}</div></div>
            )}
            <div className="cr-save"><input placeholder={T("احفظ هذه الأعمدة كقالب باسم…", "Save as template…")} value={tname} onChange={(e) => setTname(e.target.value)} /><button type="button" className="btn bsm" disabled={!tname.trim() || !fields.length} onClick={() => { const n = tname.trim(); saveTpls([...tpls.filter((t) => t.n !== n), { n, f: fields }]); setTname(""); }}><i className="ti ti-device-floppy" /> {T("حفظ", "Save")}</button></div>
          </div>
          <div className="cr-sec">
            <St n="2" t={T("اختر الموظفين", "Choose employees")} sub={T("الكل أو تصفية بجهة العمل/القسم أو اختيار يدوي", "All, filtered, or hand-picked")} />
            <div className="cr-row">
              {([["all", T("كل الموظفين", "All employees")], ["pick", T("موظف / موظفون محددون", "Selected employees")]] as const).map(([k, l]) => <label key={k} className={"cr-radio" + (mode === k ? " on" : "")}><input type="radio" name={id + "_m"} checked={mode === k} onChange={() => setMode(k)} /> {l}</label>)}
              {allowTerminated && <label className={"cr-radio" + (inclTerm ? " on" : "")}><input type="checkbox" checked={inclTerm} onChange={(e) => setInclTerm(e.target.checked)} /> {T("مع المنتهية خدمتهم", "Include terminated")}</label>}
            </div>
            <div className="cr-row">
              <select value={fEmployer} onChange={(e) => setFEmployer(e.target.value)}><option value="">{T("كل جهات العمل", "All employers")}</option>{employers.map((x) => <option key={x}>{x}</option>)}</select>
              <select value={fDept} onChange={(e) => setFDept(e.target.value)}><option value="">{T("كل الأقسام", "All departments")}</option>{depts.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            {mode === "pick" && (
              <div style={{ marginTop: 8 }}>
                <div className="cr-row"><input placeholder={T("ابحث بالاسم أو الرقم…", "Search…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="btn bsm" onClick={() => setSel((s) => { const n = { ...s }; list.forEach((e) => { n[e.id] = true; }); return n; })}>{T("تحديد الظاهر", "Select shown")}</button><button type="button" className="btn bsm" onClick={() => setSel({})}>{T("مسح", "Clear")}</button></div>
                <div className="cr-emps">{list.map((e) => <label key={e.id}><input type="checkbox" checked={!!sel[e.id]} onChange={() => setSel((s) => ({ ...s, [e.id]: !s[e.id] }))} /> {en ? e.nameEn || e.nameAr : e.nameAr} <span>#{e.empNo}</span></label>)}</div>
              </div>
            )}
          </div>
        </div>
        <div className="cr-main">
          <div className="cr-bar">
            <div><b>{T("المعاينة", "Preview")}</b><span className="cr-cnt">{emps.length} {T("موظف", "employees")} × {cols.length} {T("عمود", "columns")}</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select title="Language / اللغة" value={en ? "en" : "ar"} onChange={(ev) => setRl(ev.target.value)} style={{ fontSize: 12 }}><option value="ar">العربية</option><option value="en">English</option></select>
              {tools && <button type="button" className="btn bsm" disabled={!ok} onClick={print}><i className="ti ti-printer" /> {T("طباعة", "Print")}</button>}
              <button type="button" className="btn bpl" disabled={!ok} onClick={() => setDlg(true)}><i className="ti ti-file-export" /> {T("تصدير / إرسال (PDF · Excel · Word)", "Export / Email (PDF · Excel · Word)")}</button>
            </div>
          </div>
          {ok && tools && (
            <div className="cr-row" style={{ margin: "8px 0", flexWrap: "wrap" }}>
              <input placeholder={T("بحث داخل التقرير…", "Search the report…")} value={tq} onChange={(e) => setTq(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              <label className={"cr-radio" + (grpBy ? " on" : "")}><input type="checkbox" checked={grpBy} onChange={(e) => setGrpBy(e.target.checked)} /> {T("تجميع حسب القسم + مجاميع", "Group by department")}</label>
              <label className={"cr-radio" + (showTot ? " on" : "")}><input type="checkbox" checked={showTot} onChange={(e) => setShowTot(e.target.checked)} /> {T("إظهار المجاميع", "Show totals")}</label>
              {balI != null && <label className={"cr-radio" + (lowOnly ? " on" : "")}><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> {T("الأرصدة المنخفضة فقط", "Low balances only")}</label>}
            </div>
          )}
          {ok ? (
            <div className="cr-tw">
              <table className="lvr-t">
                <thead><tr><th>#</th>{headers.map((h, i) => <th key={i} className={tools ? "lvr-sort" : undefined} onClick={tools ? () => { if (sortI === i) setSortD(-sortD); else { setSortI(i); setSortD(1); } } : undefined}>{h}{sortI === i ? (sortD > 0 ? " ▲" : " ▼") : ""}</th>)}</tr></thead>
                <tbody>
                  {(() => {
                    let k = 0;
                    return view.slice(0, tools ? undefined : 30).map((it, n) =>
                      it.t === "row" ? <tr key={n}><td className="cr-i">{++k}</td>{it.r.map((c, j) => <td key={j} className={balCls(j, c)}>{String(c)}</td>)}</tr>
                        : it.t === "grp" ? <tr key={n} className="lvr-grp"><td colSpan={cols.length + 1}>{it.label}</td></tr>
                          : <tr key={n} className={"lvr-" + it.t}><td colSpan={2}>{it.label}</td>{it.cells.slice(1).map((c, j) => <td key={j}>{String(c)}</td>)}</tr>);
                  })()}
                </tbody>
              </table>
              {!tools && rows.length > 30 && <div className="cr-more">{T("المعاينة أول 30 صفاً — الملف المُصدَّر يحوي الكل", "Preview shows 30 rows — the file has all")}</div>}
            </div>
          ) : (
            <div className="cr-empty"><i className="ti ti-table-options" /><div>{cols.length ? T("لا يوجد موظفون مطابقون", "No matching employees") : T("اختر عموداً واحداً على الأقل لتظهر المعاينة", "Pick at least one column to see the preview")}</div></div>
          )}
        </div>
      </div>
      {dlg && <ExportDialog spec={spec} onClose={() => setDlg(false)} />}
    </div>
  );
}
