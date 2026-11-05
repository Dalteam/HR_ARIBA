"use client";

// الأصول الثابتة والعهد — port of the design's pages/finance/Assets.jsx against OUR /assets.
//
// The register with its filters (category, status, holder, depreciation date, search), the add / edit form with the
// live depreciation line, hand-over and return of custody, delete (the API keeps a copy in the recycle bin), and the
// annual inventory with its check line, print and Excel. Depreciation is the design's own maths (lib/assets.ts).
// Who sees the buttons follows the API's `can_edit` (hr, admin, finance; the CEO reads only).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/hr/modal";
import { PageState } from "@/components/hr/not-built";
import { PromptModal } from "@/components/hr/prompt-modal";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import {
  CAT, CATS, REPORT_KEYS, STATUSES, STS, accDep, createAsset, deleteAsset, inRegister, listAssets, moveCustody, pd,
  rate, updateAsset, yearReport, type Asset, type AssetCategory, type AssetInput, type AssetList, type AssetPerson,
  type AssetStatus, type ReportFigures,
} from "@/lib/assets";
import { money, r2 } from "@/lib/calc/month";
import { todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { getCompany } from "@/lib/settings";
import { buildXlsx } from "@/lib/xlsx";

const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.25)", fontSize: 11.5, whiteSpace: "nowrap", textAlign: "right" };
const TH: React.CSSProperties = { background: "var(--c2)", padding: "7px 8px", fontSize: 10.5, fontWeight: 700, borderBottom: "2px solid var(--bl)", whiteSpace: "nowrap", textAlign: "right" };
const INP: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", padding: "7px 10px", fontSize: 12.5 };

const dmy = (s: string | null | undefined) => {
  const a = String(s || "").slice(0, 10).split("-");
  return a.length === 3 ? `${a[2]}/${a[1]}/${a[0]}` : "";
};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const n = (v: unknown) => Number(v) || 0;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

function Fld({ l, children, span }: { l: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={span ? { gridColumn: "span " + span } : undefined}>
      <label style={{ fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3, fontWeight: 600 }}>{l}</label>
      {children}
    </div>
  );
}

type T = (ar: string, en: string) => string;

function AssetForm({ a, onClose, onSaved, T, en }: { a: Partial<Asset>; onClose: () => void; onSaved: () => void; T: T; en: boolean }) {
  const toast = useToast();
  const isNew = !a.id;
  const [f, setF] = useState(() => ({
    name: a.name || "", category: (a.category || "computers") as AssetCategory, serial_no: a.serial_no || "",
    acquisition_date: String(a.acquisition_date || todayIso()).slice(0, 10), cost: a.cost != null ? String(n(a.cost)) : "",
    salvage_value: String(n(a.salvage_value)), life: String(a.useful_life_months ? n(a.useful_life_months) / 12 : CAT.computers[2]),
    location: a.location || "", condition: a.condition || "", status: (a.status || "active") as AssetStatus,
    disposal_date: String(a.disposal_date || "").slice(0, 10), disposal_value: String(n(a.disposal_value)), notes: a.notes || "",
    capitalized: a.capitalized !== false,
  }));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const c: AssetInput = {
    name: f.name.trim(), category: f.category, serial_no: f.serial_no.trim(), acquisition_date: f.acquisition_date,
    cost: n(f.cost), salvage_value: n(f.salvage_value), useful_life_months: Math.round(n(f.life) * 12),
    location: f.location.trim(), condition: f.condition.trim(), status: f.status, disposal_date: f.disposal_date,
    disposal_value: n(f.disposal_value), notes: f.notes.trim(), capitalized: f.capitalized,
  };
  const months = c.useful_life_months || 1, base = c.cost - c.salvage_value;

  async function save() {
    let m = "";
    if (!c.name) m = T("اكتب اسم الأصل", "Enter the asset name");
    else if (!c.acquisition_date) m = T("تاريخ الشراء مطلوب", "Acquisition date is required");
    else if (c.salvage_value > c.cost) m = T("القيمة التخريدية أكبر من التكلفة", "Salvage value exceeds the cost");
    else if (c.status !== "active" && !c.disposal_date) m = T("اكتب تاريخ الاستبعاد", "Enter the disposal date");
    else if (c.status !== "active" && c.disposal_date < c.acquisition_date) m = T("تاريخ الاستبعاد قبل الشراء", "Disposal date is before acquisition");
    if (m) return setMsg(m);
    setBusy(true);
    try {
      if (isNew) await createAsset(c);
      else await updateAsset(a.id as string, c);
      toast("✓ " + T("تم الحفظ", "Saved"), "ok");
      onSaved();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      width={760}
      title={isNew ? T("إضافة أصل / عهدة", "Add asset / custody item") : T("تعديل ", "Edit ") + (a.asset_no || "")}
      footer={
        <>
          <button type="button" className="btn bpl" id="AF_SAVE" disabled={busy} onClick={save}>{T("حفظ", "Save")}</button>
          <button type="button" className="btn" onClick={onClose}>{T("إلغاء", "Cancel")}</button>
          <span style={{ color: "var(--rd)", fontSize: 12 }}>{msg}</span>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Fld l={T("اسم الأصل", "Asset name") + " *"} span={2}><input id="AF_NAME" style={INP} value={f.name} onChange={(e) => set("name", e.target.value)} /></Fld>
        <Fld l={T("الفئة", "Category")}>
          <select style={INP} value={f.category} onChange={(e) => { const k = e.target.value as AssetCategory; set("category", k); if (isNew) set("life", String(CAT[k][2])); }}>
            {CATS.map((k) => <option key={k} value={k}>{CAT[k][en ? 1 : 0]}</option>)}
          </select>
        </Fld>
        <Fld l={T("رقم تسلسلي / موديل", "Serial / model")}><input style={INP} value={f.serial_no} onChange={(e) => set("serial_no", e.target.value)} /></Fld>
        <Fld l={T("تاريخ الشراء", "Acquisition date") + " *"}><input type="date" style={INP} value={f.acquisition_date} onChange={(e) => set("acquisition_date", e.target.value)} /></Fld>
        <Fld l={T("التكلفة (ر.س)", "Cost (SAR)") + " *"}><input type="number" step="0.01" id="AF_COST" style={INP} value={f.cost} onChange={(e) => set("cost", e.target.value)} /></Fld>
        <Fld l={T("القيمة التخريدية", "Salvage value")}><input type="number" step="0.01" style={INP} value={f.salvage_value} onChange={(e) => set("salvage_value", e.target.value)} /></Fld>
        <Fld l={T("العمر الافتراضي (سنة)", "Useful life (years)")}><input type="number" step="0.25" min="0.25" style={INP} value={f.life} onChange={(e) => set("life", e.target.value)} /></Fld>
        <Fld l={T("المكان", "Location")}><input style={INP} value={f.location} onChange={(e) => set("location", e.target.value)} /></Fld>
        <Fld l={T("الحالة الفنية", "Condition")}><input style={INP} value={f.condition} onChange={(e) => set("condition", e.target.value)} /></Fld>
        <Fld l={T("حالة الأصل", "Status")}>
          <select style={INP} value={f.status} onChange={(e) => set("status", e.target.value as AssetStatus)}>
            {STATUSES.map((k) => <option key={k} value={k}>{STS[k][en ? 1 : 0]}</option>)}
          </select>
        </Fld>
        <Fld l={T("تاريخ الاستبعاد / البيع", "Disposal date")}><input type="date" style={INP} value={f.disposal_date} onChange={(e) => set("disposal_date", e.target.value)} /></Fld>
        <Fld l={T("قيمة البيع (ر.س)", "Disposal proceeds")}><input type="number" step="0.01" style={INP} value={f.disposal_value} onChange={(e) => set("disposal_value", e.target.value)} /></Fld>
        <Fld l={T("ملاحظات", "Notes")} span={3}><input style={INP} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Fld>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={f.capitalized} onChange={(e) => set("capitalized", e.target.checked)} /> {T("أصل رأسمالي (يُهلك)", "Capital asset (depreciated)")}</label>
        </div>
      </div>
      <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(41,179,94,.08)", borderRadius: 8, fontSize: 12 }}>
        {c.capitalized ? (
          <>
            {T("الإهلاك السنوي: ", "Annual depreciation: ")}<b>{money((base * 12) / months)}</b> ({r2(rate(c))}% {T("من التكلفة", "of cost")}) — {T("الشهري: ", "monthly: ")}<b>{money(base / months)}</b>
          </>
        ) : (
          T("عهدة بدون إهلاك", "Custody item — no depreciation")
        )}
      </div>
    </Modal>
  );
}

function CustodyForm({ a, people, onClose, onSaved, T, en }: { a: Asset; people: AssetPerson[]; onClose: () => void; onSaved: () => void; T: T; en: boolean }) {
  const toast = useToast();
  const [emp, setEmp] = useState(() => (people.some((p) => p.employee_id === a.custodian_employee_id) ? a.custodian_employee_id || "" : ""));
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await moveCustody(a.id, { employee_id: emp || null, date, notes: notes || null });
      toast("✓ " + T("تم حفظ العهدة", "Custody saved"), "ok");
      onSaved();
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  }
  const sorted = [...people].sort((x, y) => String(x.name_ar || "").localeCompare(String(y.name_ar || ""), "ar"));
  return (
    <Modal
      onClose={onClose}
      width={520}
      title={T("عهدة: ", "Custody: ") + a.asset_no + " — " + a.name}
      footer={
        <>
          <button type="button" className="btn bpl" id="CU_SAVE" disabled={busy} onClick={save}>{T("حفظ", "Save")}</button>
          <button type="button" className="btn" onClick={onClose}>{T("إلغاء", "Cancel")}</button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: "var(--mu)", marginBottom: 10 }}>
        {a.custodian_employee_id ? (
          <>{T("العهدة حالياً مع: ", "Currently with: ")}<b>{a.custodian_name || a.custodian_employee_id}</b></>
        ) : (
          T("العهدة حالياً مع الشركة", "Currently with the company")
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <Fld l={T("الموظف", "Employee")}>
          <select id="CU_EMP" style={INP} value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">— {T("رجوع للشركة (استلام)", "Return to company")} —</option>
            {sorted.map((p) => <option key={p.employee_id} value={p.employee_id}>{(en && p.name_en) || p.name_ar}</option>)}
          </select>
        </Fld>
        <Fld l={T("التاريخ", "Date")}><input type="date" style={INP} value={date} onChange={(e) => setDate(e.target.value)} /></Fld>
      </div>
      <div style={{ marginTop: 10 }}>
        <Fld l={T("ملاحظات", "Notes")}><input style={INP} value={notes} onChange={(e) => setNotes(e.target.value)} /></Fld>
      </div>
    </Modal>
  );
}

function Inventory({ assets, company, onClose, T, en }: { assets: Asset[]; company: string; onClose: () => void; T: T; en: boolean }) {
  const cy = new Date().getFullYear();
  const [Y, setY] = useState(cy);
  const R = useMemo(() => yearReport(assets, Y), [assets, Y]);
  const chk = r2(R.tot.nbvOpen + R.tot.additions - R.tot.charge - (R.tot.disposals - R.tot.accDisp)) === R.tot.nbvClose;
  const cn = (k: AssetCategory) => (CAT[k] || CAT.other)[en ? 1 : 0];
  const heads = [T("الفئة", "Category"), T("العدد", "Count"), T("التكلفة أول السنة", "Cost b/f"), T("الإضافات", "Additions"), T("الاستبعادات", "Disposals"), T("التكلفة آخر السنة", "Cost c/f"), T("مجمع الإهلاك أول السنة", "Acc. depr. b/f"), T("إهلاك السنة", "Charge for the year"), T("مجمع إهلاك المستبعد", "Acc. depr. on disposals"), T("مجمع الإهلاك آخر السنة", "Acc. depr. c/f"), T("القيمة الدفترية أول السنة", "NBV b/f"), T("القيمة الدفترية آخر السنة", "NBV c/f"), T("ربح / (خسارة) الاستبعاد", "Gain / (loss) on disposal")];
  const cust = (r: { a: Asset; dispInY: boolean }) => (r.a.custodian_employee_id && !r.dispInY ? r.a.custodian_name || r.a.custodian_employee_id : "");
  const present = CATS.filter((k) => R.cats[k]);

  function print() {
    const css = "<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,Tahoma,sans-serif;font-size:9.5px;color:#111;direction:" + (en ? "ltr" : "rtl") + "}h1{font-size:15px;margin:0 0 2px}table{width:100%;border-collapse:collapse;margin:6px 0}th{background:#014D3D;color:#fff;padding:4px;border:1px solid #014D3D;font-size:8.5px}td{border:1px solid #cfd8d3;padding:3px 4px;text-align:center;font-size:9px}td.l{text-align:" + (en ? "left" : "right") + "}tr.t td{background:#e8f3ee;font-weight:800}.sig{display:flex;justify-content:space-between;margin-top:14mm;font-size:10px}</style>";
    const H1 = (a: string[]) => "<tr>" + a.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr>";
    const sum = present.map((k) => { const o = R.cats[k] as ReportFigures & { n: number }; return '<tr><td class="l">' + esc(cn(k)) + "</td><td>" + o.n + "</td>" + REPORT_KEYS.map((x) => "<td>" + money(o[x]) + "</td>").join("") + "</tr>"; }).join("")
      + '<tr class="t"><td class="l">' + T("الإجمالي", "Total") + "</td><td>" + R.rows.length + "</td>" + REPORT_KEYS.map((x) => "<td>" + money(R.tot[x]) + "</td>").join("") + "</tr>";
    const det = R.rows.map((r) => "<tr><td>" + esc(r.a.asset_no) + '</td><td class="l">' + esc(r.a.name) + "</td><td>" + esc(cn(r.a.category)) + "</td><td>" + dmy(r.a.acquisition_date) + "</td><td>" + money(r.a.cost) + "</td><td>" + n(r.a.useful_life_months) / 12 + "</td><td>" + r2(rate(r.a)) + "%</td><td>" + money(r.accOpen) + "</td><td>" + money(r.charge) + "</td><td>" + money(r.accClose) + "</td><td>" + money(r.nbvClose) + '</td><td class="l">' + esc(cust(r)) + "</td><td>☐ ☐ ☐</td></tr>").join("");
    const body = css + "<h1>" + esc(company) + " — " + T("جرد الأصول الثابتة للسنة المنتهية في 31/12/", "Fixed-asset inventory for the year ended 31/12/") + Y + "</h1><div>" + T("الإهلاك: قسط ثابت شهري من شهر الشراء — المبالغ بالريال السعودي", "Straight-line monthly depreciation from the month of acquisition — amounts in SAR") + "</div><table>" + H1(heads) + sum + "</table><table>" + H1([T("رقم", "No."), T("الأصل", "Asset"), T("الفئة", "Category"), T("الشراء", "Acquired"), T("التكلفة", "Cost"), T("العمر", "Life"), T("النسبة", "Rate"), T("مجمع أول", "Acc. b/f"), T("إهلاك السنة", "Charge"), T("مجمع آخر", "Acc. c/f"), T("الدفترية", "NBV"), T("العهدة مع", "Custodian"), T("الجرد (موجود/غير موجود/تالف)", "Count (found/missing/damaged)")]) + det + '</table><div class="sig"><div>' + T("أعدّه: ........................", "Prepared by: ........................") + "</div><div>" + T("راجعه: ........................", "Reviewed by: ........................") + "</div><div>" + T("اعتمده: ........................", "Approved by: ........................") + "</div></div>";
    const w = window.open("", "_blank");
    if (!w) return alert(T("من فضلك اسمح بالنوافذ المنبثقة للطباعة", "Please allow pop-ups to print"));
    w.document.write(`<!doctype html><html dir="${en ? "ltr" : "rtl"}" lang="${en ? "en" : "ar"}"><head><meta charset="utf-8"><title>${esc(T("الجرد السنوي", "Annual inventory"))}</title></head><body>${body}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function xl() {
    const s1: (string | number)[][] = [[company + " — " + T("جرد الأصول الثابتة ", "Fixed-asset inventory ") + Y], [], heads];
    present.forEach((k) => { const o = R.cats[k] as ReportFigures & { n: number }; s1.push([cn(k), o.n, ...REPORT_KEYS.map((x) => o[x])]); });
    s1.push([T("الإجمالي", "Total"), R.rows.length, ...REPORT_KEYS.map((x) => R.tot[x])]);
    const s2: (string | number)[][] = [[T("رقم", "No."), T("الأصل", "Asset"), T("الفئة", "Category"), T("رقم تسلسلي", "Serial"), T("تاريخ الشراء", "Acquired"), T("التكلفة", "Cost"), T("القيمة التخريدية", "Salvage"), T("العمر (سنة)", "Life (yrs)"), T("نسبة الإهلاك %", "Rate %"), T("مجمع أول السنة", "Acc. b/f"), T("إهلاك السنة", "Charge"), T("مجمع آخر السنة", "Acc. c/f"), T("القيمة الدفترية", "NBV"), T("الحالة", "Status"), T("العهدة مع", "Custodian"), T("الجرد الفعلي", "Physical count")]];
    R.rows.forEach((r) => s2.push([r.a.asset_no, r.a.name, cn(r.a.category), r.a.serial_no || "", String(r.a.acquisition_date).slice(0, 10), n(r.a.cost), n(r.a.salvage_value), n(r.a.useful_life_months) / 12, r2(rate(r.a)), r.accOpen, r.charge, r.accClose, r.nbvClose, (STS[r.a.status] || STS.active)[en ? 1 : 0], cust(r), ""]));
    const blob = buildXlsx([
      { name: T("الملخص", "Summary"), rows: s1, widths: [22, 8, 16, 14, 14, 16, 16, 14, 16, 16, 16, 16, 16] },
      { name: T("التفاصيل", "Details"), rows: s2, widths: [10, 28, 16, 14, 12, 14, 12, 10, 10, 14, 14, 14, 14, 10, 22, 16] },
    ], { rtl: !en });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `asset_inventory_${Y}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  const cell = (o: ReportFigures, count: number) => (
    <>
      <td style={TD}>{count}</td>
      {REPORT_KEYS.map((k) => <td key={k} style={{ ...TD, ...(k === "nbvClose" ? { fontWeight: 800, color: "var(--gr)" } : {}) }}>{money(o[k])}</td>)}
    </>
  );
  return (
    <Modal
      onClose={onClose}
      width={1180}
      title={T("الجرد السنوي للأصول الثابتة", "Annual fixed-asset inventory")}
      footer={
        <>
          <select id="IV_Y" value={Y} onChange={(e) => setY(+e.target.value)} style={{ ...INP, width: 100 }}>
            {Array.from({ length: 12 }, (_, i) => cy + 1 - i).map((y) => <option key={y}>{y}</option>)}
          </select>
          <button type="button" className="btn bgr bsm" id="IV_PR" onClick={print}><i className="ti ti-printer" /> {T("طباعة", "Print")}</button>
          <button type="button" className="btn bpl bsm" id="IV_XL" onClick={xl}>Excel</button>
          <button type="button" className="btn bsm" onClick={onClose}>{T("إغلاق", "Close")}</button>
        </>
      }
    >
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{heads.map((x) => <th key={x} style={TH}>{x}</th>)}</tr></thead>
          <tbody>
            {present.map((k) => <tr key={k}><td style={{ ...TD, fontWeight: 700 }}>{cn(k)}</td>{cell(R.cats[k] as ReportFigures, (R.cats[k] as { n: number }).n)}</tr>)}
            <tr style={{ background: "rgba(41,179,94,.12)", fontWeight: 800 }}><td style={TD}>{T("الإجمالي", "Total")}</td>{cell(R.tot, R.rows.length)}</tr>
          </tbody>
        </table>
      </div>
      <div id="IV_CHK" style={{ fontSize: 11, margin: "8px 0", color: chk ? "var(--gr)" : "var(--rd)" }}>
        {chk ? "✓ " : "✗ "}{T("مطابقة: القيمة الدفترية أول السنة + الإضافات − إهلاك السنة − القيمة الدفترية للمستبعد = القيمة الدفترية آخر السنة", "Check: NBV b/f + additions − charge − NBV of disposals = NBV c/f")}
      </div>
      <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>{T("كشف الجرد التفصيلي (للمراجعة والجرد الفعلي)", "Detailed list (for the physical count)")}</div>
      <div style={{ overflow: "auto", maxHeight: 340 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{[T("رقم", "No."), T("الأصل", "Asset"), T("الفئة", "Category"), T("تاريخ الشراء", "Acquired"), T("التكلفة", "Cost"), T("العمر", "Life"), T("مجمع أول السنة", "Acc. b/f"), T("إهلاك السنة", "Charge"), T("مجمع آخر السنة", "Acc. c/f"), T("القيمة الدفترية", "NBV"), T("العهدة مع", "Custodian"), T("الجرد الفعلي", "Physical count")].map((x) => <th key={x} style={TH}>{x}</th>)}</tr></thead>
          <tbody>
            {R.rows.map((r) => (
              <tr key={r.a.id}>
                <td style={TD}>{r.a.asset_no}</td><td style={{ ...TD, fontWeight: 700 }}>{r.a.name}</td><td style={TD}>{cn(r.a.category)}</td><td style={TD}>{dmy(r.a.acquisition_date)}</td>
                <td style={TD}>{money(r.a.cost)}</td><td style={TD}>{n(r.a.useful_life_months) / 12}</td><td style={TD}>{money(r.accOpen)}</td><td style={TD}>{money(r.charge)}</td>
                <td style={TD}>{money(r.accClose)}</td><td style={{ ...TD, fontWeight: 800 }}>{money(r.nbvClose)}</td><td style={TD}>{cust(r) || "—"}</td>
                <td style={TD}>☐ {T("موجود", "Found")} ☐ {T("غير موجود", "Missing")} ☐ {T("تالف", "Damaged")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export default function Page() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T: T = (a, b) => (en ? b : a);
  const toast = useToast();
  const [st, setSt] = useState<AssetList>({ assets: [], log: [], can_edit: false, people: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [fCat, setFCat] = useState(""), [fSt, setFSt] = useState(""), [fEmp, setFEmp] = useState(""), [q, setQ] = useState(""), [asOfS, setAsOfS] = useState(todayIso());
  const [form, setForm] = useState<Partial<Asset> | null>(null), [cust, setCust] = useState<Asset | null>(null), [del, setDel] = useState<Asset | null>(null), [inv, setInv] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSt(await listAssets());
      setError(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the register's first read
    void load();
    // the inventory's heading; a role that may not read the company settings just prints without it
    getCompany().then((c) => setCompany((en ? c.company_name_en || c.company_name_ar : c.company_name_ar || c.company_name_en) || "")).catch(() => setCompany(""));
  }, [load, en]);

  const can = st.can_edit;
  const cn = (c: AssetCategory) => (CAT[c] || CAT.other)[en ? 1 : 0];
  const asOf = pd(asOfS) || new Date();
  const holders = useMemo(() => {
    const m: Record<string, string> = {};
    st.assets.forEach((a) => { if (a.custodian_employee_id) m[a.custodian_employee_id] = a.custodian_name || a.custodian_employee_id; });
    return m;
  }, [st.assets]);
  const list = st.assets.filter((a) =>
    (!fCat || a.category === fCat) &&
    (!fSt || (fSt === "active" ? !a.status || a.status === "active" : a.status === fSt)) &&
    (!fEmp || String(a.custodian_employee_id) === fEmp) &&
    (!q.trim() || (String(a.name || "") + String(a.asset_no || "") + String(a.serial_no || "")).toLowerCase().includes(q.trim().toLowerCase())));
  // each row's register figures and the totals line, worked out before rendering (the design sums while it draws)
  const shown = list.map((a) => {
    const inReg = inRegister(a, asOf), ac = inReg ? accDep(a, asOf) : 0;
    return { a, inReg, ac, nb: inReg ? r2(n(a.cost) - ac) : 0 };
  });
  const inReg = shown.filter((r) => r.inReg);
  const tc = inReg.reduce((s, r) => s + n(r.a.cost), 0), ta = inReg.reduce((s, r) => s + r.ac, 0);
  const tn = inReg.reduce((s, r) => s + r.nb, 0), count = inReg.length;

  async function remove(a: Asset) {
    setDel(null);
    try {
      await deleteAsset(a.id);
      toast("✓ " + T("تم الحذف", "Deleted"), "ok");
      await load();
    } catch (e) {
      toast(errText(e), "err");
    }
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="ct" style={{ marginBottom: 10 }}><i className="ti ti-building-warehouse" /> {T("الأصول الثابتة والعهد", "Fixed assets & custody")}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Fld l={T("الفئة", "Category")}>
            <select style={{ ...INP, width: "auto" }} value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="">{T("الكل", "All")}</option>
              {CATS.map((k) => <option key={k} value={k}>{cn(k)}</option>)}
            </select>
          </Fld>
          <Fld l={T("الحالة", "Status")}>
            <select style={{ ...INP, width: "auto" }} value={fSt} onChange={(e) => setFSt(e.target.value)}>
              <option value="">{T("الكل", "All")}</option>
              {STATUSES.map((k) => <option key={k} value={k}>{STS[k][en ? 1 : 0]}</option>)}
            </select>
          </Fld>
          <Fld l={T("العهدة مع", "Custodian")}>
            <select style={{ ...INP, width: "auto", minWidth: 160 }} value={fEmp} onChange={(e) => setFEmp(e.target.value)}>
              <option value="">{T("الكل", "All")}</option>
              {Object.keys(holders).map((k) => <option key={k} value={k}>{holders[k]}</option>)}
            </select>
          </Fld>
          <Fld l={T("الإهلاك حتى تاريخ", "Depreciation as of")}><input type="date" style={{ ...INP, width: "auto" }} value={asOfS} onChange={(e) => setAsOfS(e.target.value)} /></Fld>
          <div style={{ flex: 1, minWidth: 140 }}><Fld l={T("بحث", "Search")}><input id="AS_Q" style={INP} value={q} onChange={(e) => setQ(e.target.value)} /></Fld></div>
          {can && <button type="button" className="btn bpl bsm" id="AS_ADD" onClick={() => setForm({})}><i className="ti ti-plus" /> {T("إضافة أصل / عهدة", "Add asset / custody")}</button>}
          <button type="button" className="btn bgr bsm" id="AS_INV" onClick={() => setInv(true)}><i className="ti ti-clipboard-list" /> {T("الجرد السنوي", "Annual inventory")}</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 8, lineHeight: 1.7 }}>
          {T("الإهلاك: قسط ثابت شهري على (التكلفة − القيمة التخريدية) من شهر الشراء. الأعمار الافتراضية: أجهزة وإلكترونيات 4 سنوات، سيارات 5، أثاث 10، معدات 5، برمجيات 3 — ويمكن تعديلها لكل أصل. راجعها مع المحاسب.", "Straight-line monthly depreciation on (cost − salvage) from the month of acquisition. Default lives: computers & electronics 4 yrs, vehicles 5, furniture 10, equipment 5, software 3 — editable per asset. Confirm with your accountant.")}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto", marginTop: 12 }}>
        {loading || error ? (
          <PageState loading={loading} error={error} onRetry={() => void load()} />
        ) : !list.length ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--mu)" }}>{T("لا توجد أصول", "No assets")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{[T("رقم الأصل", "No."), T("الأصل", "Asset"), T("الفئة", "Category"), T("تاريخ الشراء", "Acquired"), T("التكلفة", "Cost"), T("العمر (سنة)", "Life (yrs)"), T("نسبة الإهلاك %", "Rate %"), T("مجمع الإهلاك", "Acc. depr."), T("القيمة الدفترية", "Net book value"), T("العهدة مع", "Custodian"), T("الحالة", "Status"), ""].map((x, i) => <th key={i} style={TH}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map(({ a, inReg, ac, nb }) => {
                return (
                  <tr key={a.id} style={{ opacity: inReg ? 1 : 0.55 }}>
                    <td style={TD}>{a.asset_no}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{a.name}{a.serial_no && <div style={{ fontSize: 10, color: "var(--mu)" }}>S/N {a.serial_no}</div>}</td>
                    <td style={TD}>{cn(a.category)}{a.capitalized === false && <span style={{ color: "var(--am)", fontSize: 10 }}> ({T("عهدة", "custody")})</span>}</td>
                    <td style={TD}>{dmy(a.acquisition_date)}</td>
                    <td style={TD}>{money(a.cost)}</td>
                    <td style={TD}>{n(a.useful_life_months) / 12}</td>
                    <td style={TD}>{r2(rate(a))}</td>
                    <td style={{ ...TD, color: "var(--am)" }}>{inReg ? money(ac) : "—"}</td>
                    <td style={{ ...TD, fontWeight: 800, color: "var(--gr)" }}>{inReg ? money(nb) : "—"}</td>
                    <td style={TD}>{a.custodian_employee_id ? a.custodian_name || a.custodian_employee_id : "—"}</td>
                    <td style={TD}>{(STS[a.status] || STS.active)[en ? 1 : 0]}{a.disposal_date && <div style={{ fontSize: 10, color: "var(--mu)" }}>{dmy(a.disposal_date)}</div>}</td>
                    <td style={TD}>
                      {can && (
                        <>
                          <button type="button" className="btn bsm" title={T("تعديل", "Edit")} onClick={() => setForm(a)}><i className="ti ti-pencil" /></button>{" "}
                          <button type="button" className="btn bsm" title={T("تسليم / استلام عهدة", "Assign / return custody")} onClick={() => setCust(a)}><i className="ti ti-user" /></button>{" "}
                          <button type="button" className="btn bsm" title={T("حذف", "Delete")} onClick={() => setDel(a)}><i className="ti ti-trash" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: "rgba(41,179,94,.12)", fontWeight: 800 }}>
                <td colSpan={4} style={TD}>{T("الإجمالي (في السجل بتاريخ ", "Total (in the register on ")}{dmy(asOfS)}) — {count}</td>
                <td style={TD}>{money(tc)}</td><td colSpan={2} style={TD} /><td style={TD}>{money(ta)}</td><td style={TD}>{money(tn)}</td><td colSpan={3} style={TD} />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {form && <AssetForm a={form} T={T} en={en} onClose={() => setForm(null)} onSaved={() => { setForm(null); void load(); }} />}
      {cust && <CustodyForm a={cust} people={st.people} T={T} en={en} onClose={() => setCust(null)} onSaved={() => { setCust(null); void load(); }} />}
      {inv && <Inventory assets={st.assets} company={company} T={T} en={en} onClose={() => setInv(false)} />}
      {del && (
        <PromptModal
          noInput
          danger
          confirmText={T("حذف", "Delete")}
          title={T("حذف أصل", "Delete asset")}
          message={T(`حذف الأصل ${del.asset_no} (${del.name})؟ تُحفظ نسخة منه في الأرشيف. إن كان قد بيع أو استُبعد فالأفضل تعديل حالته بدل الحذف.`, `Delete asset ${del.asset_no}? An archive copy is kept. If it was sold/disposed, change its status instead.`)}
          onClose={() => setDel(null)}
          onConfirm={() => void remove(del)}
        />
      )}
    </div>
  );
}
