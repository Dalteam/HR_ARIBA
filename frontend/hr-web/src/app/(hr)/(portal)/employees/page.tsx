"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { DaysBadge } from "@/components/hr/badges";
import { EmployeeDetails } from "@/components/hr/employee-details";
import { PageState } from "@/components/hr/not-built";
import { TerminateModal } from "@/components/hr/terminate-modal";
import { ApiError, type EmployeeTab } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getLookups, listEmployees, reactivateEmployee } from "@/lib/employees";
import { initials, sar, sarFixed } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";

// The prototype's six category tabs, in order.
const TABS: [EmployeeTab, MessageKey][] = [
  ["all", "emps.all"],
  ["active", "emps.active"],
  ["terminated", "emps.term"],
  ["tamheer", "emps.tamheer"],
  ["training", "emps.training"],
  ["consultants", "emps.consultant"],
];
const PAGE = 100;

export default function EmployeesPage() {
  const { t, lang } = useLocale();
  const { hasRole } = useAuth();
  const toast = useToast();
  const canEdit = hasRole("hr", "admin");
  const [tab, setTab] = useState<EmployeeTab>("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [wp, setWp] = useState("");
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<string | null>(null);
  const [terminate, setTerminate] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const h = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(h);
  }, [search]);

  const query = { tab, q, workplace_id: wp || undefined, page, page_size: PAGE };
  const list = useApi(() => listEmployees(query), JSON.stringify(query));
  const lookups = useApi(getLookups, "lookups");
  const nm = (o: { name_ar: string; name_en: string | null }) => (lang === "en" && o.name_en) || o.name_ar;
  const lk = (l: { name_ar: string; name_en: string } | null) => (l ? (lang === "en" ? l.name_en : l.name_ar) : "—");

  async function reinstate(id: string) {
    try {
      await reactivateEmployee(id);
      toast(t("term.reinstated"), "ok");
      list.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("common.error"), "err");
    }
  }

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="pg on" id="pg-emps">
      <div className="tbar" id="empCategoryTabs">
        {TABS.map(([v, k]) => (
          <div key={v} className={`tab ${tab === v ? "on" : ""}`} onClick={() => { setTab(v); setPage(1); }}>
            {t(k)}
          </div>
        ))}
      </div>
      <div className="sbar">
        <input type="text" id="ES" placeholder={t("emps.search")} style={{ maxWidth: 230 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select id="EF" value={wp} onChange={(e) => { setWp(e.target.value); setPage(1); }} style={{ width: "auto" }}>
          <option value="">{t("emps.allEmployers")}</option>
          {lookups.data?.workplaces.map((w) => <option key={w.id} value={w.id}>{lang === "en" ? w.name_en : w.name_ar}</option>)}
        </select>
        {canEdit && (
          <Link href="/employees/new" className="btn bpl bsm" style={{ textDecoration: "none" }}>
            <i className="ti ti-plus" /> <span id="t_add">{t("emps.add")}</span>
          </Link>
        )}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table id="ET">
            <tbody>
              <tr>
                {(["no", "emp", "job", "employer", "dept", "nat", "service", "iqama", "contract", "total", "net", "actions"] as const).map((c) => (
                  <th key={c}>{t(`emps.col.${c}` as MessageKey)}</th>
                ))}
              </tr>
              {list.data?.items.map((e) => (
                <tr key={e.id} className={e.is_terminated ? "terminated-row" : undefined}>
                  <td>{e.emp_no}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div className="av" style={{ width: 28, height: 28, background: "#29B35E22", color: "#29B35E", fontSize: 10 }}>{initials(e.name_ar)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{nm(e)}</div>
                        <div style={{ fontSize: 10, color: "var(--dm)" }}>{t("emps.empNo", { no: e.emp_no })}</div>
                        {e.is_terminated && <span className="b ba">{t("emps.terminated")}</span>}
                      </div>
                    </div>
                  </td>
                  <td>{e.job_title || "—"}</td>
                  <td><span className="b bb">{lk(e.workplace)}</span></td>
                  <td>{lk(e.department)}</td>
                  <td>{lk(e.nationality)}</td>
                  <td>{t("common.years", { n: Number(e.years_of_service).toFixed(1) })}</td>
                  <td><DaysBadge days={e.national_id_days_left} lang={lang} /></td>
                  <td><DaysBadge days={e.contract_days_left} lang={lang} /></td>
                  <td style={{ color: "var(--gr)", fontWeight: 600 }}>{e.total_salary === null ? "—" : sar(e.total_salary)}</td>
                  <td style={{ color: "var(--cy)", fontWeight: 600 }}>{e.net_salary === null ? "—" : sarFixed(e.net_salary)}</td>
                  <td>
                    <button type="button" className="btn bsm" onClick={() => setDetails(e.id)} aria-label="view"><i className="ti ti-eye" /></button>{" "}
                    <Link href={`/employees/${e.id}`} className="btn bsm" aria-label="edit"><i className="ti ti-edit" /></Link>{" "}
                    {canEdit && !e.is_terminated && (
                      <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => setTerminate({ id: e.id, name: nm(e) })} aria-label="end service">
                        <i className="ti ti-trash" />
                      </button>
                    )}
                    {canEdit && e.is_terminated && (
                      <button type="button" className="btn bsm" title={t("emps.reinstate")} style={{ color: "var(--gr)" }} onClick={() => reinstate(e.id)}>
                        <i className="ti ti-rotate-clockwise" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(list.loading && !list.data) || list.error ? (
            <PageState loading={list.loading} error={list.error?.message} onRetry={list.reload} />
          ) : list.data?.items.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--mu)" }}>{t("emps.empty")}</div>
          ) : null}
        </div>
      </div>
      {pages > 1 && (
        <div className="sbar" style={{ justifyContent: "space-between" }}>
          <span style={{ color: "var(--mu)", fontSize: 11 }}>{t("common.pageOf", { total, page, pages })}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn bsm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</button>
            <button type="button" className="btn bsm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("common.next")}</button>
          </span>
        </div>
      )}
      {details && <EmployeeDetails id={details} onClose={() => setDetails(null)} />}
      {terminate && (
        <TerminateModal
          {...terminate}
          onClose={() => setTerminate(null)}
          onDone={() => {
            setTerminate(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}
