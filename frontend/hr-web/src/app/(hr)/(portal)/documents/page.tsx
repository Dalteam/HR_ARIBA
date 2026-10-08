"use client";

// Documents (الوثائق) — port of #pg-docs with the final V60 loadDocs (employees-data/040): every current employee,
// days left live from the expiry date, V62 "تحديث البيانات" button, print current tab / print all.
import { useCallback, useEffect, useRef, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { useToast } from "@/components/common/toast";
import { ddmmyyyy } from "@/lib/format";
import { printHtml } from "@/lib/print";
import { listDocRegistry, type DocRow } from "@/lib/registry";

type Tab = "dc1" | "dc2" | "dc3" | "dc4";
const TABS: [Tab, string][] = [
  ["dc1", "🪪 الإقامات"],
  ["dc2", "الجوازات"],
  ["dc3", "التأمين الطبي"],
  ["dc4", "العقود"],
];
const fD = (d: string | null) => (d ? ddmmyyyy(d) : "—");

/** Legacy dBadge. */
function DBadge({ d }: { d: number | null }) {
  if (d === null) return <>—</>;
  if (d >= 9999) return <span className="b bk">—</span>;
  if (d <= 0) return <span className="b br">منتهي</span>;
  if (d <= 30) return <span className="b br">{d}ي</span>;
  if (d <= 90) return <span className="b ba">{d}ي</span>;
  return <span className="b bg">{d}ي</span>;
}

function state(hasAny: boolean, d: number | null, blank: string, expired: string, valid: string) {
  if (!hasAny) return <span className="b bk">{blank}</span>;
  if (d !== null && d <= 0) return <span className="b br">{expired}</span>;
  return <span className="b bg">{valid}</span>;
}

export default function Page() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("dc1");
  const [rows, setRows] = useState<DocRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const tables = useRef<Record<Tab, HTMLTableElement | null>>({ dc1: null, dc2: null, dc3: null, dc4: null });

  useEffect(() => {
    let alive = true;
    listDocRegistry()
      .then((r) => alive && (setRows(r), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    toast("✓ تم تحديث بيانات الوثائق", "info");
  }, [toast]);

  const printTab = () => {
    const t = tables.current[tab];
    if (t) printHtml(TABS.find((x) => x[0] === tab)![1].replace("🪪 ", ""), t.outerHTML);
  };
  const printAll = () => {
    const html = TABS.map(([k, l]) => (tables.current[k] ? `<h3>${l.replace("🪪 ", "")}</h3>${tables.current[k]!.outerHTML}` : "")).join("");
    printHtml("وثائق الموظفين", html);
  };

  const a = rows ?? [];
  const row = (e: DocRow) => (
    <>
      <td>{e.emp_no}</td>
      <td style={{ fontWeight: 600 }}>{e.name_ar}</td>
    </>
  );

  return (
    <div className="pg on" id="pg-docs">
      <div className="tbar">
        <button type="button" id="docsRefreshBtn62" className="btn bsm" style={{ marginRight: 6, background: "var(--bl)", color: "#fff" }} onClick={refresh}>
          <i className="ti ti-refresh" /> تحديث البيانات
        </button>
        {TABS.map(([k, l]) => (
          <div key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {l}
          </div>
        ))}
        <button type="button" className="btn bsm" onClick={printTab} style={{ marginRight: "auto", background: "var(--gr)", color: "#fff" }}>
          <i className="ti ti-printer" /> طباعة هذا التاب
        </button>
        <button type="button" className="btn bsm" onClick={printAll}>
          <i className="ti ti-printer" /> طباعة الكل
        </button>
      </div>
      {!rows ? (
        <PageState loading={!error} error={error} onRetry={() => setTick((t) => t + 1)} />
      ) : (
        <>
          <div id="dc1" style={{ display: tab === "dc1" ? undefined : "none" }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="tw">
                <table id="IQT" ref={(el) => { tables.current.dc1 = el; }}>
                  <tbody>
                    <tr><th>#</th><th>الموظف</th><th>رقم الإقامة</th><th>جهة العمل</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>
                    {a.map((e) => (
                      <tr key={e.id}>
                        {row(e)}
                        <td>{e.national_id || "—"}</td>
                        <td>{e.workplace || "—"}</td>
                        <td>{fD(e.national_id_expiry)}</td>
                        <td><DBadge d={e.national_id_days} /></td>
                        <td>{state(!!(e.national_id || e.national_id_expiry), e.national_id_days, "غير مكتملة", "منتهية", "سارية")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="dc2" style={{ display: tab === "dc2" ? undefined : "none" }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="tw">
                <table id="PPT" ref={(el) => { tables.current.dc2 = el; }}>
                  <tbody>
                    <tr><th>#</th><th>الموظف</th><th>رقم الجواز</th><th>الجنسية</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>
                    {a.map((e) => (
                      <tr key={e.id}>
                        {row(e)}
                        <td>{e.passport_no || "—"}</td>
                        <td>{e.nationality || "—"}</td>
                        <td>{fD(e.passport_expiry)}</td>
                        <td><DBadge d={e.passport_days} /></td>
                        <td>{state(!!(e.passport_no || e.passport_expiry), e.passport_days, "غير مكتمل", "منتهي", "ساري")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="dc3" style={{ display: tab === "dc3" ? undefined : "none" }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="tw">
                <table id="INT" ref={(el) => { tables.current.dc3 = el; }}>
                  <tbody>
                    <tr><th>#</th><th>الموظف</th><th>شركة التأمين</th><th>الفئة</th><th>رقم البطاقة</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>
                    {a.map((e) => (
                      <tr key={e.id}>
                        {row(e)}
                        <td>{e.insurance_company || "—"}</td>
                        <td>{e.insurance_class || "—"}</td>
                        <td>{e.insurance_card_no || "—"}</td>
                        <td>{fD(e.insurance_expiry)}</td>
                        <td><DBadge d={e.insurance_days} /></td>
                        <td>{state(!!(e.insurance_company || e.insurance_expiry), e.insurance_days, "غير مكتمل", "منتهي", "ساري")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="dc4" style={{ display: tab === "dc4" ? undefined : "none" }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="tw">
                <table id="CTT" ref={(el) => { tables.current.dc4 = el; }}>
                  <tbody>
                    <tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>النوع</th><th>المباشرة</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>
                    {a.map((e) => (
                      <tr key={e.id}>
                        {row(e)}
                        <td>{e.workplace || "—"}</td>
                        <td>{e.contract_type || "—"}</td>
                        <td>{fD(e.join_date)}</td>
                        <td>{fD(e.contract_end_date)}</td>
                        <td><DBadge d={e.contract_days} /></td>
                        <td>{!e.contract_end_date ? <span className="b bk">مفتوح</span> : state(true, e.contract_days, "", "منتهي", "ساري")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
