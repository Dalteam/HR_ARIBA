"use client";

// Payroll (مسير الرواتب V119) — port of #pg-pay + js/payroll/107-ariba-v119-payroll.js and
// js/calculations/06-payroll-module.js, with rows stored through the `sheets` API (pay_YYYY_MM).
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/common/toast";
import { PageState } from "@/components/hr/not-built";
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
  EXCEL_COLS,
  isLocalCurrency,
  isoDate,
  MONTHS_AR,
  money,
  NUMF,
  num,
  p2,
  recalc,
  rowValue,
  sums,
  type MonthCtx,
  type PayRow,
} from "@/lib/calc/payroll";
import { getGosiRates, getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import { approveSheet, getSheet, putSheet, unapproveSheet } from "@/lib/sheets";
import { request } from "@/lib/api";

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
const box = (c: string): React.CSSProperties => ({
  background: `color-mix(in srgb, ${c} 9%, transparent)`,
  border: `1px solid color-mix(in srgb, ${c} 27%, transparent)`,
  borderRadius: 8,
  padding: "7px 14px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  whiteSpace: "nowrap",
});

const cloneRow = (r: PayRow): PayRow => ({ ...r, manualEdits: { ...r.manualEdits } });
const setField = (r: PayRow, k: string, v: unknown) => {
  (r as unknown as Record<string, unknown>)[k] = v;
};

export default function Page() {
  const toast = useToast();
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

  const m: MonthCtx = useMemo(
    () => ({ y: year, m: month, days, start: new Date(year, month - 1, 1), end: new Date(year, month - 1, days) }),
    [year, month, days],
  );
  const key = `pay_${year}_${p2(month)}`;
  const empMap = useMemo(() => new Map((basis ?? []).map((e) => [String(e.id), e])), [basis]);
  const employers = useMemo(() => [...new Set(rows.map((r) => r.employer || "").filter(Boolean))].sort(), [rows]);

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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      putSheet(key, next)
        .then(() => toast("✓ تم حفظ المسير", "ok"))
        .catch((e) => toast(e instanceof Error ? e.message : String(e), "err"));
    }, 500);
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
    if (!window.confirm("اعتماد مسير الرواتب؟ لن يمكن التعديل بعد الاعتماد.")) return;
    if (!rows.length) return toast("لا توجد بيانات", "err");
    try {
      await putSheet(key, rows);
      const s = await approveSheet(key);
      setApproved(true);
      setApprovedAt(s.approved_at);
      toast("✓ تم اعتماد مسير الرواتب", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  async function unapprove() {
    try {
      await unapproveSheet(key);
      setApproved(false);
      setApprovedAt(null);
      toast("تم فك الاعتماد", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  async function rebuild() {
    if (approved) return toast("المسير معتمد — لا يمكن إعادة بنائه.", "err");
    if (!window.confirm("إعادة بناء المسير من بيانات الموظفين؟ ستُفقد التعديلات اليدوية غير المعتمدة.")) return;
    const fresh = buildRows(basis!, m, []).map((r) => recalc(r, empMap.get(String(r.id)), m, rates!));
    setRows(fresh);
    try {
      await putSheet(key, fresh);
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

  function exportCsv() {
    const head = EXCEL_COLS.map((c) => c.t);
    const data = rows.map((r) => EXCEL_COLS.map((c) => rowValue(r, c.t)));
    const csv = "﻿" + [head, ...data].map((line) => line.map((v) => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `payroll_${year}_${p2(month)}.csv`;
    a.click();
  }

  function print() {
    const H = [
      "م", "الاسم", "أيام", "أيام التأمينات", "الأساسي", "سكن", "مواصلات", "مشروع + أخرى", "إضافي",
      "بدل إجازة", "مكافأة نهاية الخدمة", "إجمالي المستحق", "سلف / غياب", "تأمينات الموظف", "خصومات أخرى",
      "إجمالي المستقطع", "الصافي", "العملة", "الصافي (ر.س)",
    ];
    const list = filter ? rows.filter((r) => r.employer === filter) : rows;
    const tr = (r: PayRow, i: number) =>
      `<tr><td>${i + 1}</td><td style="text-align:right;font-weight:700;white-space:normal">${r.name.split(" ").slice(0, 3).join(" ")}${PAYX.findReason(r.reason) ? ' <span style="color:#a15c00">●</span>' : ""}</td>` +
      `<td>${num(r.workDays)}</td><td>${num(r.insDays)}</td><td>${money(r.sal)}</td><td>${money(r.houPay)}</td><td>${money(r.traPay)}</td>` +
      `<td>${money(num(r.prjPay) + num(r.othPay) + num(r.otherAllow))}</td><td>${money(r.overtime)}</td><td>${money(r.leaveComp)}</td><td>${money(r.eosAmt)}</td>` +
      `<td><b>${money(r.totalDue)}</b></td><td>${money(r.loanDeduct)}</td><td>${money(r.insEmp && !r.noInsDeduct ? r.insEmp : 0)}</td>` +
      `<td>${money(r.otherDeduct)}</td><td><b>${money(r.totalDeduct)}</b></td><td><b>${money(r.net)}</b></td>` +
      `<td style="color:#a15c00">${isLocalCurrency(r.currency) ? "ر.س" : currencyLabel(r.currency)}</td><td><b>${money(r.netSAR)}</b></td></tr>`;
    const srow = (label: string, subset: PayRow[], cls: string) => {
      const s = sums(subset);
      return `<tr class="${cls}"><td colspan="4" style="text-align:right">${label} (${subset.length})</td>` +
        `<td>${money(s.sal)}</td><td>${money(s.houPay)}</td><td>${money(s.traPay)}</td><td>${money(s.prjPay + s.othPay)}</td>` +
        `<td>${money(s.overtime)}</td><td>${money(s.leaveComp)}</td><td>${money(s.eosAmt)}</td><td>${money(s.totalDue)}</td>` +
        `<td>${money(s.loanDeduct)}</td><td>${money(subset.reduce((a, r) => a + (r.noInsDeduct ? 0 : num(r.insEmp)), 0))}</td>` +
        `<td>${money(s.otherDeduct)}</td><td>${money(s.totalDeduct)}</td><td>${money(s.net)}</td><td></td><td>${money(s.netSAR)}</td></tr>`;
    };
    const order = [...new Set(list.map((r) => r.employer || "—"))];
    let body = "";
    let n = 0;
    for (const k of order) {
      const grp = list.filter((r) => (r.employer || "—") === k);
      body += `<tr class="g"><td colspan="${H.length}">${k}</td></tr>`;
      body += grp.map((r) => tr(r, n++)).join("");
      body += srow(`إجمالي ${k}`, grp, "s");
    }
    body += srow("الإجمالي العام", list, "gt");
    const css =
      '<style>@page{size:A4 landscape;margin:8mm 9mm}*{box-sizing:border-box}body{margin:0;font-family:"ARIBA Two","Segoe UI",Tahoma,Arial,sans-serif;color:#10231c;font-size:8.2px;direction:rtl}' +
      '.hd{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #014D3D;padding-bottom:4px;margin-bottom:5px}.hd .t{text-align:center;flex:1}.hd .t b{display:block;font-size:13px;color:#014D3D}.hd .t span{font-size:9.5px;color:#555}' +
      'table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#014D3D;color:#fff;padding:3px 2px;font-size:8px;font-weight:700;text-align:center;border:1px solid #014D3D}td{padding:1.5px 3px;border:1px solid #d9e3df;text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      'tr.g td{background:#e8f3ee;font-weight:800;color:#014D3D;text-align:right}tr.s td{background:#f1f6f4;font-weight:800}tr.gt td{background:#014D3D;color:#fff;font-weight:800;font-size:9px}</style>';
    const html =
      `<div class="hd"><div class="t"><b>كشف رواتب ومكافآت موظفي شركة حلول أريبا لخدمات الأعمال</b>` +
      `<span>عن شهر ${MONTHS_AR[month]} ${year} — عدد الموظفين ${list.length}</span></div></div>` +
      `<table><thead><tr>${H.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
    const w = window.open("", "_blank");
    if (!w) return toast("اسمح بالنوافذ المنبثقة", "err");
    w.document.open();
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>مسير الرواتب ${MONTHS_AR[month]} ${year}</title>${css}</head><body>${html}</body></html>`);
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

  const locked = approved;
  const list = filter ? rows.filter((r) => r.employer === filter) : rows;
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
      ↺
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

  return (
    <div className="pg on" id="pg-pay">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--c2)", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)" }}>
          <label style={{ fontSize: 11, color: "var(--mu)", fontWeight: 600 }}>الشهر:</label>
          <select value={month} onChange={(e) => { const mo = Number(e.target.value); setMonth(mo); setDays(new Date(year, mo, 0).getDate()); }} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tx)" }}>
            {MONTHS_AR.slice(1).map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => { const y = Number(e.target.value); setYear(y); setDays(new Date(y, month, 0).getDate()); }} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tx)" }}>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--c2)", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)" }}>
          <label style={{ fontSize: 11, color: "var(--mu)", fontWeight: 600 }}>أيام الشهر:</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tx)" }}>
            {[28, 29, 30, 31].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ fontSize: 12, maxWidth: 160 }}>
          <option value="">كل نطاقات العمل</option>
          {employers.map((em) => (
            <option key={em} value={em}>{em}</option>
          ))}
        </select>
        <div id="payStatus">
          {approved ? (
            <span style={{ background: "rgba(16,185,129,.15)", color: "var(--gr)", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
              ✓ معتمد {approvedAt ? `— ${approvedAt.slice(0, 10)}` : ""}
            </span>
          ) : (
            <span style={{ background: "rgba(245,158,11,.1)", color: "var(--am)", padding: "3px 10px", borderRadius: 6, fontSize: 11 }}>⏳ غير معتمد</span>
          )}
        </div>
        <div style={{ marginRight: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!approved && (
            <button type="button" className="btn bgr bsm" onClick={approve}><i className="ti ti-check" /> اعتماد</button>
          )}
          {approved && (
            <button type="button" className="btn bsm" style={{ background: "var(--am)", color: "#fff" }} onClick={unapprove}><i className="ti ti-arrow-back-up" /> فك الاعتماد</button>
          )}
          {!approved && <button type="button" className="btn bsm" style={{ background: "var(--cy)", color: "#fff", borderColor: "var(--cy)" }} onClick={addRow}><i className="ti ti-plus" /> إضافة صف</button>}
          {!approved && <button type="button" className="btn bsm" style={{ background: "var(--am)", color: "#fff" }} onClick={rebuild}><i className="ti ti-refresh" /> إعادة بناء</button>}
          <button type="button" className="btn bsm" style={{ background: "var(--pu)", color: "#fff" }} onClick={exportCsv}><i className="ti ti-file-spreadsheet" /> Excel</button>
          <button type="button" className="btn bsm" style={{ background: "var(--rd)", color: "#fff" }} onClick={print}><i className="ti ti-printer" /> طباعة المسير</button>
        </div>
      </div>

      {error ? (
        <PageState error={error} onRetry={() => { setError(null); setLoading(true); setReloadTick((t) => t + 1); }} />
      ) : loading ? (
        <PageState loading />
      ) : (
        <>
          <div id="payKPIs" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={box("var(--bl)")}><span style={{ fontSize: 11, color: "var(--mu)" }}>إجمالي صافي العملات</span><span style={{ fontSize: 14, fontWeight: 800, color: "var(--bl)" }}>{Object.entries(byCur).map(([c, v]) => money(v) + (c === "ريال سعودي" ? " ر.س" : " " + c)).join(" | ")}</span></div>
            <div style={box("var(--gr)")}><span style={{ fontSize: 11, color: "var(--mu)" }}>إجمالي الصافي (ر.س)</span><span style={{ fontSize: 14, fontWeight: 800, color: "var(--gr)" }}>{money(sAll.netSAR)}</span></div>
            <div style={box("var(--am)")}><span style={{ fontSize: 11, color: "var(--mu)" }}>تأمينات المنشأة</span><span style={{ fontSize: 14, fontWeight: 800, color: "var(--am)" }}>{money(sAll.insEr)}</span></div>
            {sAll.leaveComp ? <div style={box("var(--pu)")}><span style={{ fontSize: 11, color: "var(--mu)" }}>بدل الإجازة</span><span style={{ fontSize: 14, fontWeight: 800, color: "var(--pu)" }}>{money(sAll.leaveComp)}</span></div> : null}
            {sAll.eosAmt ? <div style={box("var(--pu)")}><span style={{ fontSize: 11, color: "var(--mu)" }}>مكافأة نهاية الخدمة</span><span style={{ fontSize: 14, fontWeight: 800, color: "var(--pu)" }}>{money(sAll.eosAmt)}</span></div> : null}
            <div style={box("var(--cy)")}><span style={{ fontSize: 11, color: "var(--mu)" }}>عدد الموظفين</span><span style={{ fontSize: 14, fontWeight: 800, color: "var(--cy)" }}>{list.length}</span></div>
          </div>

          {!approved && termEmps.length > 0 && (
            <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select defaultValue="" onChange={(e) => addTerminated(e.target.value)} style={{ fontSize: 11, maxWidth: 190 }}>
                <option value="">+ إضافة موظف منتهي الخدمة…</option>
                {termEmps.map((e) => (
                  <option key={e.id} value={e.id}>{e.name_ar}</option>
                ))}
              </select>
              <button type="button" className="btn bsm" style={{ fontSize: 11, padding: "3px 9px" }} onClick={() => bulk("workDays")}>↺ أيام العمل تلقائي</button>
              <button type="button" className="btn bsm" style={{ fontSize: 11, padding: "3px 9px" }} onClick={() => bulk("insDays")}>أيام التأمينات = أيام العمل</button>
              <button type="button" className="btn bsm" style={{ fontSize: 11, padding: "3px 9px" }} onClick={() => { if (!approved) { const next = rows.map(cloneRow); for (const r of next) { if (r.manualEdits) delete r.manualEdits.insDays; r.insDays = defaultInsDays(r, empMap.get(String(r.id)), m); r.edited = true; recalc(r, empMap.get(String(r.id)), m, rates!); } setRows(next); scheduleSave(next); } }}>↺ أيام التأمينات تلقائي</button>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 2000 }}>
              <thead>
                <tr>{groups.map((g) => <th key={g.t} colSpan={g.n} style={GROUPS}>{g.t}</th>)}</tr>
                <tr>{cols.map((c) => <th key={c.t} style={THS}>{c.t}</th>)}</tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} style={PAYX.findReason(r.reason) ? { background: "rgba(217,119,6,.07)" } : undefined}>
                    {cols.map((c) => <td key={c.t} style={{ ...TDS, ...c.st }}>{c.render(r)}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ ...TDS, background: "rgba(59,130,246,.12)", fontWeight: 800 }}>الإجمالي العام ({list.length})</td>
                  {cols.slice(3).map((c) => {
                    const k = ["الأساسي", "الراتب حسب الأيام", "إضافي", "سكن", "مواصلات", "مشروع (شهري)", "أخرى (شهري)", "بدل أجازة", "مكافأة نهاية الخدمة", "إجمالي المستحق", "سلف / غياب", "تأمينات موظف", "أخرى", "الأجر الخاضع للتأمينات", "تأمينات شركة", "إجمالي المستقطع", "المستحق بالعملة", "الصافي (ريال سعودي)"].includes(c.t) ? c.t : "";
                    const keyMap: Record<string, string> = { "الأساسي": "sal", "الراتب حسب الأيام": "salByDays", "إضافي": "overtime", "سكن": "houPay", "مواصلات": "traPay", "مشروع (شهري)": "prjPay", "أخرى (شهري)": "othPay", "بدل أجازة": "leaveComp", "مكافأة نهاية الخدمة": "eosAmt", "إجمالي المستحق": "totalDue", "سلف / غياب": "loanDeduct", "تأمينات موظف": "insEmp", "أخرى": "otherDeduct", "الأجر الخاضع للتأمينات": "insBase", "تأمينات شركة": "insEr", "إجمالي المستقطع": "totalDeduct", "المستحق بالعملة": "net", "الصافي (ريال سعودي)": "netSAR" };
                    const sk = keyMap[k] as keyof typeof sAll | undefined;
                    return <td key={c.t} style={{ ...TDS, background: "rgba(59,130,246,.12)", fontWeight: 800 }}>{sk ? money(sAll[sk]) : ""}</td>;
                  })}
                </tr>
                <tr>
                  <td colSpan={cols.length} style={{ ...TDS, background: "rgba(59,130,246,.06)", fontSize: 11 }}>
                    إجمالي حسب طريقة الدفع (ر.س): {Object.entries(byPay).map(([k, v]) => `${k}: ${money(v)}`).join(" | ")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      {/* V53 سجل المسيرات المعتمدة */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="ch">
          <div className="ct"><i className="ti ti-archive" /> سجل المسيرات المعتمدة</div>
          <button type="button" className="btn bsm" onClick={loadArchive}><i className="ti ti-refresh" /> تحديث</button>
        </div>
        <div id="ARIBA_PAYROLL_ARCHIVE">
          {archive === null ? (
            <div style={{ padding: 18, textAlign: "center", color: "var(--mu)" }}>اضغط «تحديث» لعرض المسيرات المعتمدة</div>
          ) : archive.length === 0 ? (
            <div style={{ padding: 22, textAlign: "center", color: "var(--mu)" }}>لا توجد مسيرات رواتب معتمدة محفوظة حتى الآن.</div>
          ) : (
            archive.map((x) => (
              <div key={`${x.year}-${x.month}`} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 12px", borderBottom: "1px solid var(--bd)" }}>
                <div style={{ minWidth: 150, flex: 1 }}>
                  <strong>{MONTHS_AR[x.month]} {x.year}</strong>
                  <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 3 }}>معتمد — {x.approved_at ? new Date(x.approved_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn") : ""} | {x.employees} موظف</div>
                </div>
                <div className="b bgr" style={{ padding: "5px 9px" }}>{x.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} إجمالي</div>
                <div className="b ba" style={{ padding: "5px 9px" }}>{x.net_sar.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR صافي</div>
                <button type="button" className="btn bsm bpl" onClick={() => { setYear(x.year); setMonth(x.month); window.scrollTo({ top: 0, behavior: "smooth" }); }}>مراجعة</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
