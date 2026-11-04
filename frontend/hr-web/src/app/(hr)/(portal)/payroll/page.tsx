"use client";

// Payroll (مسير الرواتب) in the updated design's form (its pages/payroll/*): the toolbar, the status bar, the sheet
// grouped by employer with subtotals, the formula Excel file, the printed sheet with its column chooser, the archive
// with its review panel, and other users' edits picked up every 6 seconds. The calculation is OUR V119 port
// (lib/calc/payroll.ts) with rows stored through the `sheets` API (pay_YYYY_MM). Edits for HR and admin; approval
// and reopening (with a reason) for finance, HR and admin, as our API allows. The design's «تجهيز للمالية» step
// (HR prepares, finance approves) waits for its backend stage (lib/features.ts `payPrepare`).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/common/toast";
import { Modal } from "@/components/hr/modal";
import { PageState } from "@/components/hr/not-built";
import { PromptModal } from "@/components/hr/prompt-modal";
import { useAuth } from "@/lib/auth-context";
import { saveBlob } from "@/lib/exporter";
import { FEATURES, isReady } from "@/lib/features";
import { getCompany } from "@/lib/settings";
import { loadPrintCols, payrollPrintHtml, payrollXlsx, PRINT_COLS, defaultPrintCols, savePrintCols, sameCur } from "@/lib/calc/payroll-out";
import { PAYX } from "@/lib/calc/payx";
import {
  USED_CACHE,
  usedQueries,
  autoWork,
  baseRow,
  blankRow,
  buildRows,
  currencyLabel,
  defaultInsDays,
  dmy,
  empDefault,
  enrich,
  isLocalCurrency,
  isoDate,
  MONTHS_AR,
  money,
  NUMF,
  num,
  p2,
  recalc,
  sums,
  SUMCOL,
  type MonthCtx,
  type PayRow,
} from "@/lib/calc/payroll";
import { getGosiRates, getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import { approveSheet, getSheet, putSheet, unapproveSheet } from "@/lib/sheets";
import { request } from "@/lib/api";
import { DateField } from "@/components/common/date-time-field";

const REASON_OPTS: [string, string][] = [["", "—"], ...PAYX.REASONS.map((r) => [r.k, r.ar] as [string, string])];
const ST_OPTS: [string, string][] = [
  ["يطابق", "يطابق"],
  ["لا يطابق", "لا يطابق"],
  ["غير سعودي", "غير سعودي"],
  ["غير خاضع", "غير خاضع"],
  ["لا يطبق", "لا يطبق"],
];
const PAY_OPTS: [string, string][] = [
  ["مدد", "مدد"],
  ["تحويل", "تحويل بنكي"],
  ["تحويل دولي", "تحويل دولي"],
  ["نقد", "نقداً"],
];

const TDS: React.CSSProperties = {
  padding: "5px 7px",
  borderBottom: "1px solid rgba(36,48,68,.25)",
  textAlign: "right",
  whiteSpace: "nowrap",
  fontSize: 11,
  borderLeft: "1px solid rgba(36,48,68,.15)",
};
const THS: React.CSSProperties = {
  background: "var(--c2)",
  padding: "6px 7px",
  textAlign: "right",
  fontSize: 10,
  fontWeight: 700,
  borderBottom: "2px solid var(--bl)",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 2,
  borderLeft: "1px solid rgba(36,48,68,.3)",
};
const GROUPS: React.CSSProperties = {
  background: "rgba(1,77,61,.18)",
  padding: "5px 7px",
  textAlign: "center",
  fontSize: 10.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
  borderLeft: "2px solid var(--bd)",
};
const INP: React.CSSProperties = {
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 4,
  color: "var(--tx)",
  fontSize: 11,
  textAlign: "right",
  padding: 2,
};

const cloneRow = (r: PayRow): PayRow => ({ ...r, manualEdits: { ...r.manualEdits } });
const setField = (r: PayRow, k: string, v: unknown) => {
  (r as unknown as Record<string, unknown>)[k] = v;
};

export default function Page() {
  const toast = useToast();
  const { can: may } = useAuth();
  const canEdit = may("payroll", "edit");
  const canApprove = may("payroll_approve", "edit");
  const now = new Date();
  const [basis, setBasis] = useState<SalaryBasisRow[] | null>(null);
  const [rates, setRates] = useState<Awaited<ReturnType<typeof getGosiRates>> | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<PayRow[]>([]);
  const [approved, setApproved] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [archive, setArchive] = useState<{ year: number; month: number; approved_at: string | null; employees: number; total: number; net_sar: number }[] | null>(null);
  const loadArchive = () => request<typeof archive>("/payroll-archive").then(setArchive).catch(() => setArchive([]));
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState("");
  const [dlg, setDlg] = useState<"approve" | "rebuild" | "reopen" | "print" | null>(null);
  const [company, setCompany] = useState("");
  const [review, setReview] = useState<{ y: number; m: number; rows: PayRow[] } | null>(null);
  // what we last sent or loaded, so the 6-second check only takes other users' edits
  const lastJson = useRef("");
  useEffect(() => {
    getCompany().then((c) => setCompany(c.company_name_ar)).catch(() => undefined);
  }, []);

  const m: MonthCtx = useMemo(
    () => ({ y: year, m: month, days, start: new Date(year, month - 1, 1), end: new Date(year, month - 1, days) }),
    [year, month, days],
  );
  const key = `pay_${year}_${p2(month)}`;
  const empMap = useMemo(() => new Map((basis ?? []).map((e) => [String(e.id), e])), [basis]);
  const employers = useMemo(() => [...new Set(rows.map((r) => r.employer || "").filter(Boolean))].sort(), [rows]);
  const list = useMemo(() => (filter ? rows.filter((r) => r.employer === filter) : rows), [rows, filter]);

  const recalcRow = (r: PayRow) => recalc(r, empMap.get(String(r.id)), m, rates!);

  // «ما تم استحقاقه»: fetch the leave taken up to each terminated row's end date, then recalculate (legacy usedThrough).
  useEffect(() => {
    if (approved || !rates || !rows.length) return;
    const q = usedQueries(rows, m);
    if (!q.length) return;
    let alive = true;
    request<Record<string, number>>("/leave/used-through", { method: "POST", body: q })
      .then((res) => {
        if (!alive) return;
        Object.entries(res).forEach(([k, v]) => USED_CACHE.set(k, v));
        q.forEach((x) => !USED_CACHE.has(`${x.employee_id}|${x.end}`) && USED_CACHE.set(`${x.employee_id}|${x.end}`, 0));
        setRows((cur) => cur.map((r) => recalc(cloneRow(r), empMap.get(String(r.id)), m, rates)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [rows, approved, rates, m, empMap]);

  function scheduleSave(next: PayRow[]) {
    if (!canEdit) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("…");
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const json = JSON.stringify(next);
      putSheet(key, next)
        .then(() => {
          lastJson.current = json;
          setSaveState("✓ محفوظ");
          setTimeout(() => setSaveState(""), 2000);
        })
        .catch((e) => {
          setSaveState("⚠");
          toast("تعذر حفظ المسير: " + (e instanceof Error ? e.message : String(e)), "err");
        });
    }, 700);
  }

  useEffect(() => {
    let alive = true;
    getSalaryBasis()
      .then((b) => alive && setBasis(b))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [reloadTick]);

  useEffect(() => {
    if (!basis) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [r, sheet] = await Promise.all([getGosiRates(isoDate(m.end)), getSheet(key)]);
        if (!alive) return;
        setRates(r);
        lastJson.current = JSON.stringify(sheet.data ?? null);
        if (Array.isArray(sheet.data)) {
          const saved = sheet.data as PayRow[];
          const next = sheet.approved
            ? saved.map((row) => recalc(cloneRow(row), empMap.get(String(row.id)), m, r))
            : buildRows(basis, m, saved).map((row) => recalc(row, empMap.get(String(row.id)), m, r));
          setRows(next);
          setApproved(sheet.approved);
          setApprovedAt(sheet.approved_at);
        } else {
          setRows(buildRows(basis, m, []).map((row) => recalc(row, empMap.get(String(row.id)), m, r)));
          setApproved(false);
          setApprovedAt(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [basis, year, month, days, key, empMap, m, reloadTick]);

  function update(id: string, field: string, val: unknown) {
    if (approved || !rates) return;
    const next = rows.map(cloneRow);
    const row = next.find((r) => String(r.id) === String(id));
    if (!row) return;
    const e = empMap.get(String(row.id));
    if (val === "auto" && (field === "insDays" || field === "workDays")) {
      if (row.manualEdits) delete row.manualEdits[field];
      setField(row, field, defaultInsDays(row, e, m));
      row.edited = true;
      recalcRow(row);
      setRows(next);
      scheduleSave(next);
      return;
    }
    if (val === "auto") {
      const d = empDefault(field, e);
      if (d !== undefined) {
        setField(row, field, d);
        if (row.manualEdits) delete row.manualEdits[field];
        row.edited = true;
        recalcRow(row);
        setRows(next);
        scheduleSave(next);
        return;
      }
    }
    if (NUMF[field]) {
      const n = parseFloat(String(val));
      setField(row, field, Number.isNaN(n) ? 0 : n);
    } else if (field === "usedManual" || field === "allInManual") {
      setField(row, field, val === "" || val === "auto" || val === null ? null : num(val));
    } else if (field === "noInsDeduct") {
      setField(row, field, val === true || val === "true" || val === "1" || val === 1);
    } else if (field === "reason") {
      row.reason = String(val || "");
      if (row.reason && !row.lastDay) row.lastDay = isoDate(m.end);
      if (!row.reason && row.manualEdits) delete row.manualEdits.workDays;
    } else {
      setField(row, field, val);
    }
    row.edited = true;
    row.manualEdits = row.manualEdits || {};
    row.manualEdits[field] = true;
    if (field === "lastDay" || field === "reason") autoWork(row, m);
    recalcRow(row);
    setRows(next);
    scheduleSave(next);
  }

  async function approve() {
    setDlg(null);
    if (!rows.length) return toast("لا توجد بيانات", "err");
    try {
      if (canEdit) await putSheet(key, rows);
      const s = await approveSheet(key);
      setApproved(true);
      setApprovedAt(s.approved_at);
      toast("تم اعتماد مسير الرواتب", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  async function reopen(reason: string) {
    if (reason.length < 5) return toast("اكتب سبب واضح (5 حروف على الأقل)", "err");
    setDlg(null);
    try {
      await unapproveSheet(key, reason);
      setApproved(false);
      setApprovedAt(null);
      toast("✓ اتفتح المسير", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  async function rebuild() {
    setDlg(null);
    if (approved) return toast("المسير معتمد — لا يمكن إعادة بنائه.", "err");
    const fresh = buildRows(basis!, m, []).map((r) => recalc(r, empMap.get(String(r.id)), m, rates!));
    setRows(fresh);
    try {
      await putSheet(key, fresh);
      lastJson.current = JSON.stringify(fresh);
      toast("✓ تم إعادة بناء المسير", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  function addRow() {
    if (approved) return toast("المسير معتمد — لا يمكن التعديل", "err");
    const b = blankRow(m.days);
    b.idx = rows.length + 1;
    recalc(b, undefined, m, rates!);
    const next = [...rows, b];
    setRows(next);
    scheduleSave(next);
  }

  function addTerminated(id: string) {
    if (approved || !id) return;
    const e = empMap.get(id);
    if (!e) return;
    if (rows.some((r) => String(r.id) === String(id))) return;
    const row = baseRow(e, m.days);
    row.addedTerminated = true;
    enrich(row, e);
    row.edited = true;
    autoWork(row, m);
    row.idx = rows.length + 1;
    recalc(row, e, m, rates!);
    const next = [...rows, row];
    setRows(next);
    scheduleSave(next);
  }

  function bulk(field: "workDays" | "insDays") {
    if (approved || !rates) return;
    const next = rows.map(cloneRow);
    for (const r of next) {
      const e = empMap.get(String(r.id));
      if (field === "workDays") {
        if (r.manualEdits) delete r.manualEdits.workDays;
        r.workDays = defaultInsDays(r, e, m);
      } else {
        r.insDays = num(r.workDays);
        r.manualEdits = r.manualEdits || {};
        r.manualEdits.insDays = true;
      }
      r.edited = true;
      recalc(r, e, m, rates);
    }
    setRows(next);
    scheduleSave(next);
  }

  // the design's Excel with real formulas, over the on-screen column titles
  function exportXlsx() {
    if (!list.length) return toast("لا توجد بيانات", "err");
    const { blob, name } = payrollXlsx(list, cols.map((c) => c.t), SUMCOL, year, month);
    saveBlob({ blob, name, mime: blob.type });
  }
  function doPrint(keys: string[]) {
    setDlg(null);
    savePrintCols(keys);
    const html = payrollPrintHtml(list, { y: year, m: month, cols: keys, companyTitle: company ? "كشف رواتب ومكافآت موظفي " + company : undefined });
    const w = window.open("", "_blank");
    if (!w) return toast("اسمح بالنوافذ المنبثقة", "err");
    w.document.open();
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>مسير الرواتب ${MONTHS_AR[month]} ${year}</title></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* ignore */
      }
    }, 400);
  }

  // other users' edits: every 6 s while the tab is visible, nothing is being typed and nothing of ours is unsent
  const pollRef = useRef<() => void>(() => undefined);
  pollRef.current = () => {
    if (document.hidden || loading || !rates || !basis || saveTimer.current) return;
    const ae = document.activeElement;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && ae.closest("#payBody")) return;
    getSheet(key)
      .then((sheet) => {
        const json = JSON.stringify(sheet.data ?? null);
        if (json === lastJson.current && sheet.approved === approved) return;
        lastJson.current = json;
        if (!Array.isArray(sheet.data)) return;
        const saved = sheet.data as PayRow[];
        setRows(sheet.approved ? saved.map((row) => recalc(cloneRow(row), empMap.get(String(row.id)), m, rates)) : buildRows(basis, m, saved).map((row) => recalc(row, empMap.get(String(row.id)), m, rates)));
        setApproved(sheet.approved);
        setApprovedAt(sheet.approved_at);
        toast("🔄 اتحدّث المسير من مستخدم تاني", "info");
      })
      .catch(() => undefined);
  };
  useEffect(() => {
    const t = setInterval(() => pollRef.current(), 6000);
    return () => clearInterval(t);
  }, []);

  const [archiveBusy, setArchiveBusy] = useState(false);
  const openArchive = useCallback(async (y: number, mo: number) => {
    setArchiveBusy(true);
    try {
      const sh = await getSheet(`pay_${y}_${p2(mo)}`);
      setReview({ y, m: mo, rows: Array.isArray(sh.data) ? (sh.data as PayRow[]) : [] });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setArchiveBusy(false);
    }
  }, [toast]);
  useEffect(() => {
    // the design loads the approved-payroll history with the page
    loadArchive();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = approved || !canEdit;

  const sAll = sums(list);
  const byCur: Record<string, number> = {};
  for (const r of list) {
    const c = isLocalCurrency(r.currency) ? "ريال سعودي" : currencyLabel(r.currency);
    byCur[c] = (byCur[c] || 0) + num(r.net);
  }
  const byPay: Record<string, number> = {};
  for (const r of list) byPay[r.payMethod || "مدد"] = (byPay[r.payMethod || "مدد"] || 0) + num(r.netSAR);

  const input = (r: PayRow, field: keyof PayRow, w: number, type = "number", step = "0.01", showEmptyZero = false) => {
    const v = r[field] as number | string | null;
    if (locked) return type === "date" ? dmy(String(v ?? "")) : (v == null || v === "" ? "" : String(v));
    if (type === "date") return <DateField value={v == null ? "" : String(v)} onChange={(x) => update(r.id, field as string, x)} placeholder="—" style={{ width: w, minHeight: 0, padding: "3px 6px", fontSize: 11 }} />;
    return (
      <input
        type={type}
        step={step}
        value={showEmptyZero && !v ? "" : (v == null ? "" : String(v))}
        style={{ ...INP, width: w }}
        onChange={(e) => update(r.id, field as string, e.target.value)}
      />
    );
  };

  const select = (r: PayRow, field: keyof PayRow, opts: [string, string][], w: number) => {
    const v = String(r[field] ?? "");
    if (locked) return opts.find((o) => o[0] === v)?.[1] ?? v;
    return (
      <select
        style={{ background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 4, fontSize: 10, color: "var(--tx)", padding: 2, maxWidth: w }}
        value={v}
        onChange={(e) => update(r.id, field as string, e.target.value)}
      >
        {opts.map((o) => (
          <option key={o[0]} value={o[0]}>
            {o[1]}
          </option>
        ))}
      </select>
    );
  };

  const reset = (r: PayRow, field: string, title: string) => (
    <button type="button" title={title} onClick={() => update(r.id, field, "auto")} style={{ color: "var(--cy)", textDecoration: "none", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <i className="ti ti-arrow-back-up" aria-hidden />
    </button>
  );

  const hasManual = (r: PayRow, field: string) => !!(r.manualEdits && r.manualEdits[field]);

  const cols: { g?: string; t: string; st?: React.CSSProperties; render: (r: PayRow) => React.ReactNode }[] = [
    { g: "بيانات الموظف", t: "م", st: { position: "sticky", right: 0, background: "var(--c1)" }, render: (r) => r.idx },
    { t: "الرقم", render: (r) => r.empNo },
    { t: "الاسم", st: { minWidth: 130, position: "sticky", right: 0, background: "var(--c1)" }, render: (r) => (
        <b>{r.name.split(" ").slice(0, 3).join(" ")}</b>
      ) },
    { t: "الجنسية", render: (r) => r.nat },
    { t: "نطاق العمل", render: (r) => <span className="b bb" style={{ fontSize: 10 }}>{r.employer}</span> },
    { t: "الوظيفة", st: { maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }, render: (r) => <span style={{ color: "var(--mu)" }}>{r.job}</span> },
    { g: "التعاقد والإجازة", t: "بداية العقد", render: (r) => dmy(r.join) },
    { t: "نهاية العقد / آخر يوم", render: (r) => input(r, "lastDay", 118, "date") },
    { t: "مدة التعاقد (شهر)", render: (r) => (r.contractMonths == null ? "" : r.contractMonths) },
    { t: "سنوات الخدمة", render: (r) => (r.K == null || Number.isNaN(r.K) ? "" : num(r.K).toFixed(2)) },
    { t: "سبب الإنهاء", st: { minWidth: 150 }, render: (r) => select(r, "reason", REASON_OPTS, 170) },
    { t: "المستحق سنويًا (يوم)", render: (r) => input(r, "leaveDays", 50) },
    { t: "رصيد المستحق خلال فترة التعاقد", render: (r) => (r.N == null ? "" : money(r.N)) },
    { t: "ما تم استحقاقه (يوم)", render: (r) => {
        const man = r.usedManual != null;
        return (
          <span>
            {input(r, "usedManual", 70, "number", "0.01", true)}
            {!locked && man && reset(r, "usedManual", "رجوع للقيمة التلقائية من سجل الإجازات")}
          </span>
        );
      } },
    { t: "الرصيد المستحق (يوم)", render: (r) => (r.P == null ? "" : <b>{money(r.P)}</b>) },
    { g: "الراتب", t: "الأساسي", render: (r) => <span style={{ color: "var(--gr)" }}>{money(r.sal)}</span> },
    { t: "العملة", render: (r) => currencyLabel(r.currency) },
    { t: "معدل الصرف", render: (r) => input(r, "exchRate", 56) },
    { t: "الراتب شامل البدلات", render: (r) => (
        <span>
          {input(r, "allInManual", 84, "number", "0.01", true)}
          {!locked && hasManual(r, "allInManual") && reset(r, "allInManual", "رجوع للحساب التلقائي")}
        </span>
      ) },
    { t: "أيام العمل", render: (r) => (
        <span style={{ color: hasManual(r, "workDays") ? "var(--am)" : "inherit" }}>
          {input(r, "workDays", 48)}
          {!locked && hasManual(r, "workDays") && reset(r, "workDays", "رجوع لأيام العمل التلقائية")}
        </span>
      ) },
    { t: "أيام التأمينات", render: (r) => (
        <span style={{ color: hasManual(r, "insDays") ? "var(--am)" : "inherit" }}>
          {input(r, "insDays", 48)}
          {!locked && hasManual(r, "insDays") && reset(r, "insDays", "رجوع لأيام التأمينات التلقائية")}
        </span>
      ) },
    { t: "الراتب حسب الأيام", render: (r) => <span style={{ color: "var(--cy)" }}>{money(r.salByDays)}</span> },
    { g: "البدلات", t: "ساعات الإضافي", render: (r) => input(r, "otHours", 52, "number", "0.01", true) },
    { t: "إضافي", render: (r) => (num(r.otHours) > 0 ? money(r.overtime) : (
        <span>
          {input(r, "otAmount", 64, "number", "0.01", true)}
          {!locked && hasManual(r, "otAmount") && reset(r, "otAmount", "رجوع لقيمة الإضافي في بيانات الموظف")}
        </span>
      )) },
    { t: "سكن", render: (r) => money(r.houPay) },
    { t: "مواصلات", render: (r) => money(r.traPay) },
    { t: "مشروع (شهري)", render: (r) => input(r, "prj", 70) },
    { t: "أخرى (شهري)", render: (r) => input(r, "oth", 70) },
    { t: "بدل أجازة", render: (r) => (PAYX.findReason(r.reason) ? <b style={{ color: "#d97706" }}>{money(r.leaveComp)}</b> : (num(r.leaveManual) > 0 ? input(r, "leaveManual", 64) : money(0))) },
    { g: "مكافأة نهاية الخدمة", t: "خدمة (سنة)", render: (r) => (r.svcY === undefined || Number.isNaN(r.svcY) ? "" : r.svcY) },
    { t: "خدمة (شهر)", render: (r) => (r.svcM === undefined || Number.isNaN(r.svcM) ? "" : r.svcM) },
    { t: "خدمة (يوم)", render: (r) => (r.svcD === undefined || Number.isNaN(r.svcD) ? "" : r.svcD) },
    { t: "تكلفة السنوات", render: (r) => money(r.costY) },
    { t: "تكلفة الشهور", render: (r) => money(r.costM) },
    { t: "تكلفة الأيام", render: (r) => money(r.costD) },
    { t: "إجمالي المكافأة", render: (r) => money(r.eos) },
    { t: "مكافأة نهاية الخدمة", render: (r) => (PAYX.findReason(r.reason) ? <b style={{ color: "var(--pu)" }}>{money(r.eosAmt)}</b> : money(0)) },
    { g: "الإجمالي", t: "إجمالي المستحق", render: (r) => <b style={{ color: "var(--bl)" }}>{money(r.totalDue)}</b> },
    { g: "الاستقطاعات", t: "سلف / غياب", render: (r) => input(r, "loanDeduct", 64, "number", "0.01", true) },
    { t: "تأمينات موظف", render: (r) => (
        <span>
          <span style={{ color: r.noInsDeduct ? "var(--dm)" : "var(--am)", textDecoration: r.noInsDeduct ? "line-through" : "none" }}>
            {money(r.insEmp)}
          </span>
          {!locked && (
            <label title="لا يُخصم من الموظف" style={{ fontSize: 9, color: "var(--mu)", marginInlineStart: 4 }}>
              <input type="checkbox" checked={!!r.noInsDeduct} onChange={(e) => update(String(r.id), "noInsDeduct", e.target.checked)} /> بدون خصم
            </label>
          )}
        </span>
      ) },
    { t: "أخرى", render: (r) => input(r, "otherDeduct", 64, "number", "0.01", true) },
    { t: "الأجر الخاضع للتأمينات", render: (r) => money(r.insBase) },
    { t: "تأمينات شركة", render: (r) => money(r.insEr) },
    { t: "حالة التأمينات", render: (r) => (
        <span>
          {select(r, "insStatus", ST_OPTS, 90)}
          {!locked && hasManual(r, "insStatus") && reset(r, "insStatus", "رجوع لحالة التأمينات في بيانات الموظف")}
        </span>
      ) },
    { t: "إجمالي المستقطع", render: (r) => <b style={{ color: "var(--rd)" }}>{money(r.totalDeduct)}</b> },
    { g: "الصافي", t: "المستحق بالعملة", render: (r) => <b style={{ color: "var(--gr)" }}>{money(r.net)}</b> },
    { t: "الصافي (ريال سعودي)", render: (r) => <b style={{ color: "var(--gr)", fontSize: 12 }}>{money(r.netSAR)}</b> },
    { t: "طريقة الدفع", render: (r) => select(r, "payMethod", PAY_OPTS, 100) },
    { t: "ملاحظات", render: (r) => (locked ? r.notes : (
        <input type="text" value={r.notes} style={{ ...INP, width: 90, fontSize: 10 }} onChange={(e) => update(r.id, "notes", e.target.value)} />
      )) },
  ];

  const groups: { t: string; n: number }[] = [];
  for (const c of cols) {
    if (c.g) groups.push({ t: c.g, n: 0 });
    groups[groups.length - 1].n++;
  }

  const termEmps = (basis ?? []).filter((e) => e.is_terminated && !rows.some((r) => String(r.id) === String(e.id)) && num(e.basic_salary) > 0);
  const insAuto = () => {
    if (locked || !rates) return;
    const next = rows.map(cloneRow);
    for (const r of next) {
      if (r.manualEdits) delete r.manualEdits.insDays;
      r.insDays = defaultInsDays(r, empMap.get(String(r.id)), m);
      r.edited = true;
      recalc(r, empMap.get(String(r.id)), m, rates);
    }
    setRows(next);
    scheduleSave(next);
  };
  const order: string[] = [];
  const byEmp: Record<string, PayRow[]> = {};
  for (const r of list) {
    const k = r.employer || "—";
    if (!byEmp[k]) {
      byEmp[k] = [];
      order.push(k);
    }
    byEmp[k].push(r);
  }
  const totalRow = (label: string, rs: PayRow[], bg: string, k: string) => {
    const t = sums(rs);
    return (
      <tr key={k}>
        <td colSpan={3} style={{ ...TDS, background: bg, fontWeight: 800, position: "sticky", right: 0 }}>{label} ({rs.length})</td>
        {cols.slice(3).map((c) => {
          const sk = SUMCOL[c.t];
          return <td key={c.t} style={{ ...TDS, background: bg, fontWeight: 800 }}>{sk ? (sk === "net" && !sameCur(rs) ? "—" : money(t[sk])) : ""}</td>;
        })}
      </tr>
    );
  };
  const years: number[] = [];
  for (let y = 2011; y <= 2086; y++) years.push(y);
  const chip = approved ? ["rgba(41,179,94,.15)", "var(--gr)", "🔒 معتمد"] : ["rgba(148,163,184,.18)", "var(--mu)", "📝 مسودة"];
  const sub = approved
    ? "اعتُمد" + (approvedAt ? " — " + new Date(approvedAt).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" }) : "")
    : canEdit ? "جهّز المسير واعتمده" : "مستني تجهيز الموارد البشرية";
  const prepWaits = "غير متاح بعد — يُفتح بعد " + FEATURES.payPrepare.waits?.ar;
  const kpis: [string, string, string][] = [
    ["إجمالي صافي العملات", Object.entries(byCur).map(([c, v]) => money(v) + (c === "ريال سعودي" ? " ر.س" : " " + c)).join(" | "), "var(--bl)"],
    ["إجمالي الصافي (ر.س)", money(sAll.netSAR), "var(--gr)"],
    ["تأمينات المنشأة", money(sAll.insEr), "var(--am)"],
    ...(sAll.leaveComp ? [["بدل الإجازة", money(sAll.leaveComp), "var(--pu)"] as [string, string, string]] : []),
    ...(sAll.eosAmt ? [["مكافأة نهاية الخدمة", money(sAll.eosAmt), "var(--pu)"] as [string, string, string]] : []),
    ["عدد الموظفين", String(list.length), "var(--cy)"],
  ];

  return (
    <div className="pg on" id="pg-pay">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--c2)", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)" }}>
          <label style={{ fontSize: 11, color: "var(--mu)", fontWeight: 600 }}>الشهر:</label>
          <select value={month} onChange={(e) => { const mo = Number(e.target.value); setMonth(mo); setDays(new Date(year, mo, 0).getDate()); }} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tx)" }}>
            {MONTHS_AR.slice(1).map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
          </select>
          <select value={year} onChange={(e) => { const y = Number(e.target.value); setYear(y); setDays(new Date(y, month, 0).getDate()); }} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tx)" }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--c2)", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)" }}>
          <label style={{ fontSize: 11, color: "var(--mu)", fontWeight: 600 }}>أيام الشهر:</label>
          <select value={days} disabled={locked} onChange={(e) => setDays(Number(e.target.value))} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tx)" }}>
            {[28, 29, 30, 31].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ fontSize: 12, maxWidth: 160 }}>
          <option value="">كل جهات العمل</option>
          {employers.map((em) => <option key={em} value={em}>{em}</option>)}
        </select>
        <div id="payStatus">
          {approved ? (
            <span style={{ background: "rgba(16,185,129,.15)", color: "var(--gr)", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>✓ معتمد {approvedAt ? "— " + approvedAt.slice(0, 10) : ""}</span>
          ) : (
            <span style={{ background: "rgba(245,158,11,.1)", color: "var(--am)", padding: "3px 10px", borderRadius: 6, fontSize: 11 }}>⏳ غير معتمد</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--mu)" }}>{saveState}</span>
        {!locked && (
          <>
            {termEmps.length > 0 && (
              <select value="" onChange={(e) => e.target.value && addTerminated(e.target.value)} style={{ fontSize: 11, maxWidth: 190 }}>
                <option value="">+ إضافة موظف منتهي الخدمة…</option>
                {termEmps.map((e) => <option key={e.id} value={e.id}>{e.name_ar}</option>)}
              </select>
            )}
            <button type="button" className="btn bsm" style={{ fontSize: 11, padding: "3px 9px" }} title="ترجع أيام العمل لأيام الشهر (أو من المباشرة/لآخر يوم) لكل الموظفين" onClick={() => bulk("workDays")}>↺ أيام العمل تلقائي</button>
            <button type="button" className="btn bsm" style={{ fontSize: 11, padding: "3px 9px" }} title="تنسخ أيام العمل لأيام التأمينات لكل الموظفين" onClick={() => bulk("insDays")}>أيام التأمينات = أيام العمل</button>
            <button type="button" className="btn bsm" style={{ fontSize: 11, padding: "3px 9px" }} title="ترجع أيام التأمينات لأيام الشهر لكل الموظفين" onClick={insAuto}>↺ أيام التأمينات تلقائي</button>
          </>
        )}
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {canApprove && <button type="button" className="btn bgr bsm" disabled={approved || !rows.length} onClick={() => setDlg("approve")}><i className="ti ti-check" /> اعتماد</button>}
          {!locked && <button type="button" className="btn bsm" id="PAY_ADDROW" style={{ background: "var(--cy)", color: "#fff", borderColor: "var(--cy)" }} onClick={addRow}><i className="ti ti-plus" /> إضافة صف</button>}
          {!locked && <button type="button" className="btn bsm" style={{ background: "var(--am)", color: "#fff" }} onClick={() => setDlg("rebuild")}><i className="ti ti-refresh" /> إعادة بناء</button>}
          <button type="button" className="btn bsm" style={{ background: "var(--pu)", color: "#fff" }} onClick={exportXlsx}><i className="ti ti-file-spreadsheet" /> Excel</button>
          <button type="button" className="btn bsm" style={{ background: "var(--rd)", color: "#fff" }} onClick={() => (list.length ? setDlg("print") : toast("لا توجد بيانات للطباعة", "err"))}><i className="ti ti-printer" /> طباعة المسير</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "8px 0", padding: "8px 12px", borderRadius: 12, border: "1px solid var(--bd)", background: "var(--c2)", fontSize: 12.5 }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: chip[0], color: chip[1] }}>{chip[2]}</span>
        <span style={{ color: "var(--mu)", fontSize: 11.5 }}>{sub}</span>
        <span style={{ flex: 1 }} />
        {canEdit && !approved && <button type="button" className="btn bpl bsm" style={{ opacity: isReady("payPrepare") ? 1 : 0.6 }} title={prepWaits} onClick={() => toast(prepWaits, "info")}>📤 تجهيز للمالية</button>}
        {canApprove && approved && <button type="button" className="btn bsm" style={{ borderColor: "var(--am)", color: "var(--am)" }} onClick={() => setDlg("reopen")}>🔓 فتح المسير</button>}
      </div>

      {error ? (
        <PageState error={error} onRetry={() => { setError(null); setLoading(true); setReloadTick((t) => t + 1); }} />
      ) : (
        <>
          <div id="payKPIs" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            {kpis.map(([l, v, c]) => (
              <div key={l} className="kpi" style={{ ["--ac" as string]: c }}><div className="kl">{l}</div><div className="kv" style={{ fontSize: 15 }}>{v}</div></div>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            {loading ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--mu)" }}>جاري تحميل المسير…</div>
            ) : (
              <table id="payTable" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 2000 }}>
                <thead>
                  <tr>{groups.map((g) => <th key={g.t} colSpan={g.n} style={GROUPS}>{g.t}</th>)}</tr>
                  <tr>{cols.map((c) => <th key={c.t} style={THS}>{c.t}</th>)}</tr>
                </thead>
                <tbody id="payBody">
                  {order.map((k) => (
                    <Fragment key={k}>
                      {byEmp[k].map((r) => (
                        <tr key={r.id} style={PAYX.findReason(r.reason) ? { background: "rgba(217,119,6,.07)" } : undefined}>
                          {cols.map((c) => <td key={c.t} style={{ ...TDS, ...c.st }}>{c.render(r)}</td>)}
                        </tr>
                      ))}
                      {order.length > 1 && totalRow("إجمالي " + k, byEmp[k], "rgba(1,77,61,.10)", "t" + k)}
                    </Fragment>
                  ))}
                  {!list.length && <tr><td colSpan={cols.length} style={{ ...TDS, textAlign: "center", padding: 24, color: "var(--mu)" }}>لا توجد صفوف</td></tr>}
                </tbody>
                <tfoot>
                  {totalRow("الإجمالي العام", list, "rgba(59,130,246,.12)", "gt")}
                  <tr>
                    <td colSpan={cols.length} style={{ ...TDS, background: "rgba(59,130,246,.06)", fontSize: 11 }}>
                      إجمالي حسب طريقة الدفع (ر.س): {Object.entries(byPay).map(([k, v], i) => <span key={k}>{i ? " | " : ""}{k}: <b>{money(v)}</b></span>)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 12 }} id="ARIBA_PAYROLL_ARCHIVE_CARD">
        <div className="ch">
          <div className="ct">📁 سجل المسيرات المعتمدة</div>
          <button type="button" className="btn bpl bsm" onClick={loadArchive}>تحديث</button>
        </div>
        <div id="ARIBA_PAYROLL_ARCHIVE" style={{ padding: 0 }}>
          {archive === null ? (
            <div style={{ padding: 18, textAlign: "center", color: "var(--mu)" }}>جاري تحميل سجل المسيرات المعتمدة...</div>
          ) : archive.length === 0 ? (
            <div style={{ padding: 22, textAlign: "center", color: "var(--mu)" }}>لا توجد مسيرات رواتب معتمدة محفوظة حتى الآن.</div>
          ) : (
            archive.map((x) => (
              <div key={`${x.year}-${x.month}`} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 12px", borderBottom: "1px solid var(--bd)" }}>
                <div style={{ minWidth: 150, flex: 1 }}>
                  <strong>{MONTHS_AR[x.month]} {x.year}</strong>
                  <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 3 }}>معتمد — {x.approved_at ? new Date(x.approved_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn") : ""} | {x.employees} موظف</div>
                </div>
                <div className="b bgr" style={{ padding: "5px 9px" }}>{money(x.total)} إجمالي</div>
                <div className="b ba" style={{ padding: "5px 9px" }}>{money(x.net_sar)} SAR صافي</div>
                <button type="button" className="btn bsm bpl" disabled={archiveBusy} onClick={() => openArchive(x.year, x.month)}>مراجعة</button>
              </div>
            ))
          )}
        </div>
        <div id="ARIBA_PAYROLL_ARCHIVE_DETAIL">
          {review && (
            <div className="card" style={{ marginTop: 10, padding: 0, overflow: "auto" }}>
              <div className="ch">
                <div className="ct">📁 مسير معتمد — {MONTHS_AR[review.m]} {review.y}</div>
                <button type="button" className="btn bsm" onClick={() => setReview(null)}>إغلاق</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr><th>#</th><th>الموظف</th><th>العملة</th><th>الإجمالي</th><th>الصافي المحلي</th><th>الصافي بالريال</th></tr></thead>
                <tbody>
                  {review.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.empNo || i + 1}</td><td>{r.name || "—"}</td><td>{currencyLabel(r.currency) || "ريال سعودي"}</td>
                      <td>{money(r.totalDue)}</td><td>{money(r.net)}</td><td style={{ fontWeight: 800, color: "var(--gr)" }}>{money(r.netSAR)} SAR</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {dlg === "approve" && <PromptModal noInput title="اعتماد مسير الرواتب" message="اعتماد مسير الرواتب؟ لن يمكن التعديل بعد الاعتماد (فتحه بسبب مسجّل فقط)." confirmText="اعتماد" onClose={() => setDlg(null)} onConfirm={() => void approve()} />}
      {dlg === "rebuild" && <PromptModal noInput danger title="إعادة بناء المسير" message="إعادة بناء المسير من بيانات الموظفين؟ ستُفقد التعديلات اليدوية غير المعتمدة." confirmText="إعادة بناء" onClose={() => setDlg(null)} onConfirm={() => void rebuild()} />}
      {dlg === "reopen" && <PromptModal required danger title="فتح المسير بعد اعتماده" label="السبب (إلزامي — يُسجَّل في سجل التعديلات، 5 حروف على الأقل)" confirmText="فتح" onClose={() => setDlg(null)} onConfirm={(v) => void reopen(v)} />}
      {dlg === "print" && <PrintCols onClose={() => setDlg(null)} onPrint={doPrint} />}
    </div>
  );
}

/** The design's PrintColsDlg: choose the printed sheet's columns; the choice is remembered in this browser. */
function PrintCols({ onClose, onPrint }: { onClose: () => void; onPrint: (keys: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(() => loadPrintCols());
  const on = new Set(sel);
  const toggle = (k: string) => setSel((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));
  const ordered = PRINT_COLS.map((c) => c.k).filter((k) => on.has(k));
  return (
    <Modal
      title="اختيار أعمدة الطباعة"
      width={560}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", width: "100%" }}>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn bsm" onClick={() => setSel(PRINT_COLS.map((c) => c.k))}>الكل</button>
            <button type="button" className="btn bsm" onClick={() => setSel(defaultPrintCols())}>الافتراضي</button>
            <button type="button" className="btn bsm" onClick={() => setSel(["idx", "name"])}>إلغاء الكل</button>
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn bsm" onClick={onClose}>إلغاء</button>
            <button type="button" className="btn bsm" style={{ background: "var(--rd)", color: "#fff" }} disabled={ordered.length < 2} onClick={() => onPrint(ordered)}><i className="ti ti-printer" /> طباعة ({ordered.length})</button>
          </span>
        </div>
      }
    >
      <div style={{ fontSize: 12, color: "var(--mu)", marginBottom: 8 }}>علّم الأعمدة المطلوبة في الورقة المطبوعة فقط. اختيارك بيتحفظ للمرات الجاية.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 6 }}>
        {PRINT_COLS.map((c) => (
          <label key={c.k} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid var(--bd)", borderRadius: 8, cursor: "pointer", background: on.has(c.k) ? "rgba(41,179,94,.12)" : "transparent", fontSize: 12 }}>
            <input type="checkbox" checked={on.has(c.k)} onChange={() => toggle(c.k)} /> {c.ar}
          </label>
        ))}
      </div>
    </Modal>
  );
}
