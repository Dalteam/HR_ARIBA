"use client";

import { useEffect, useMemo, useState } from "react";
import { listRequests, typeLabel, type HrRequest } from "@/lib/leave";
import { BarChart, DonutChart, colorFor } from "@/components/hr/charts";
import { PageState } from "@/components/hr/not-built";
import type { CountItem } from "@/lib/api";
import { getDashboard } from "@/lib/employees";
import { dmy, num } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";
import { FemaleIcon, MaleIcon } from "@/components/hr/gender-icons";

const KPI_ICON: React.CSSProperties = { fontSize: 24, display: "block", marginBottom: 6 };

// Layout and inline styles reproduce the prototype dashboard (#pg-dash after its V42 patch).
const TILE: React.CSSProperties = { background: "var(--c2)", borderRadius: 18, padding: "24px 20px", minHeight: 140 };
const ROW: React.CSSProperties = { background: "var(--c1)", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" };

const STAGE_TXT: Record<string, string> = {
  manager: "بانتظار المدير المباشر",
  hr: "بانتظار الموارد البشرية",
  ceo: "بانتظار الرئيس التنفيذي",
  other: "قيد المعالجة",
};

export default function DashboardPage() {
  const { t, lang } = useLocale();
  const { data: d, error, loading, reload } = useApi(getDashboard, "dashboard");
  const name = (i: CountItem) => (lang === "en" ? i.name_en : i.name_ar);
  // the design's pending queue, refreshed every 20 s; an account that may not list requests just sees the count
  const [queue, setQueue] = useState<HrRequest[] | null>(null);
  useEffect(() => {
    let off = false;
    const load = () => listRequests({ status: "pending" }).then((r) => !off && setQueue(r)).catch(() => !off && setQueue(null));
    void load();
    const iv = setInterval(load, 20000);
    return () => {
      off = true;
      clearInterval(iv);
    };
  }, []);
  const pendingCount = queue ? queue.length : d?.pending_requests ?? 0;

  const charts = useMemo(() => {
    if (!d) return null;
    const wp = d.workplaces;
    return {
      sal: { labels: wp.map(name), data: wp.map((w) => Math.round(Number(w.salary_total ?? 0))), colors: wp.map((w) => colorFor("employer", w.name_ar)) },
      nat: { labels: d.nationalities.map(name), data: d.nationalities.map((n) => n.count), colors: d.nationalities.map((n) => colorFor("nationality", n.name_ar)) },
      emp: { labels: wp.map(name), data: wp.map((w) => w.count), colors: wp.map((w) => colorFor("employer", w.name_ar)) },
      dept: { labels: d.departments.map(name), data: d.departments.map((x) => x.count), colors: d.departments.map((x) => colorFor("department", x.name_ar)) },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, lang]);

  if (loading && !d) return <div className="pg on" id="pg-dash"><PageState loading /></div>;
  if (error || !d || !charts) return <div className="pg on" id="pg-dash"><PageState error={error?.message} onRetry={reload} /></div>;

  const pct = Number(d.saudization_pct);
  const known = d.male + d.female;
  const malePct = known ? Math.round((d.male / known) * 100) : 100;

  return (
    <div className="pg on" id="pg-dash" style={{ padding: "12px 16px", width: "100%", boxSizing: "border-box" }}>
      <div className="kr" id="KR" style={{ width: "100%", marginBottom: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.5fr 1.5fr 0.8fr", gap: 14, marginBottom: 20, alignItems: "stretch", width: "100%", boxSizing: "border-box" }}>
          <div style={{ background: "var(--ariba-dark,#014D3D)", borderRadius: 18, padding: "24px 20px", textAlign: "center", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 140 }}>
            <i className="ti ti-users" aria-hidden style={{ ...KPI_ICON, opacity: 0.9 }} />
            <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: 0.5, marginBottom: 8 }}>{t("dash.current")}</div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>{d.current}</div>
            <div style={{ fontSize: 11, opacity: 0.7, borderTop: "1px solid rgba(255,255,255,.25)", paddingTop: 8 }}>{t("dash.saudiExpat", { saudi: d.saudi, expat: d.expat })}</div>
          </div>
          <div data-ariba-kpi="saudization" style={{ ...TILE, textAlign: "center", border: "2px solid var(--ariba-dark,#014D3D)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <i className="ti ti-flag ariba-kpi-icon" aria-hidden style={KPI_ICON} />
            <div className="ariba-kpi-label" style={{ fontSize: 12, color: "var(--mu)", marginBottom: 8 }}>{t("dash.saudization")}</div>
            <div className="ariba-kpi-value" style={{ fontSize: 52, fontWeight: 900, color: "var(--ariba-dark,#014D3D)", lineHeight: 1, marginBottom: 10 }}>
              {num(pct)}<span style={{ fontSize: 22 }}>%</span>
            </div>
            <div style={{ height: 8, background: "var(--bd)", borderRadius: 4 }}>
              <div style={{ height: 8, borderRadius: 4, background: "var(--ariba-dark,#014D3D)", width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
          <div data-ariba-kpi="payroll" style={{ ...TILE, textAlign: "center", border: "2px solid #8b5cf6", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <i className="ti ti-cash ariba-kpi-icon" aria-hidden style={KPI_ICON} />
            <div className="ariba-kpi-label" style={{ fontSize: 12, color: "var(--mu)", marginBottom: 8 }}>{t("dash.payroll")}</div>
            <div className="ariba-kpi-value" style={{ fontSize: 26, fontWeight: 900, color: "#8b5cf6", lineHeight: 1.2, marginBottom: 6 }}>
              {d.payroll_total === null ? "—" : num(d.payroll_total)}
            </div>
            <div style={{ fontSize: 12, color: "var(--mu)" }}>{t("dash.payrollUnit")}</div>
          </div>
          <div data-ariba-kpi="gender" style={{ ...TILE, border: "2px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "var(--mu)", marginBottom: 14, fontWeight: 600 }}>{t("dash.gender")}</div>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", height: "calc(100% - 36px)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: 6 }}><MaleIcon /></div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "var(--ariba-dark,#014D3D)", lineHeight: 1 }}>{d.male}</div>
                <div style={{ fontSize: 12, color: "var(--mu)", marginTop: 4 }}>{t("dash.male", { pct: malePct })}</div>
              </div>
              <div style={{ width: 1, height: 60, background: "var(--bd)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: 6 }}><FemaleIcon /></div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "var(--ariba-bright,#29B35E)", lineHeight: 1 }}>{d.female}</div>
                <div style={{ fontSize: 12, color: "var(--mu)", marginTop: 4 }}>{t("dash.female", { pct: known ? 100 - malePct : 0 })}</div>
              </div>
            </div>
            {d.gender_unspecified > 0 && <div style={{ fontSize: 10, color: "var(--mu)", textAlign: "center" }}>{t("dash.genderUnknown", { n: d.gender_unspecified })}</div>}
          </div>
          <div data-ariba-kpi="departments" style={{ ...TILE, border: "2px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "var(--mu)", marginBottom: 12, fontWeight: 600 }}>{t("dash.departments")}</div>
            {d.departments.map((x) => {
              const p = d.current ? Math.round((x.count / d.current) * 100) : 0;
              return (
                <div key={x.name_ar} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "var(--tx)" }}>{name(x)}</span>
                    <span style={{ fontWeight: 700, color: "var(--ariba-dark,#014D3D)" }}>
                      {x.count} <span style={{ color: "var(--mu)", fontWeight: 400 }}>({p}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 7, background: "var(--bd)", borderRadius: 4 }}>
                    <div style={{ height: 7, borderRadius: 4, background: "var(--ariba-dark,#014D3D)", width: p + "%", transition: "width .5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* the design's three small tiles as it draws them: ti-bell / ti-user-off / ti-school (their
              `[['ti-bell',…],['ti-user-off',…],['ti-school',…]]` row), an icon per row instead of a bullet */}
          <div data-ariba-kpi="pending" style={{ ...TILE, padding: "20px 16px", border: "2px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            {(
              [
                ["dash.pending", "ti-bell", pendingCount, "#014D3D"],
                ["dash.ended", "ti-user-off", d.terminated, "#ef4444"],
                ["dash.tamheer", "ti-school", d.tamheer, "#856a00"],
              ] as [MessageKey, string, number, string][]
            ).map(([k, icon, v, c]) => (
              <div key={k} style={ROW}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--mu)" }}>
                  <i className={"ti " + icon} aria-hidden style={{ fontSize: 16, color: c }} />
                  {t(k)}
                </span>
                <span style={{ fontSize: 26, fontWeight: 900, color: c }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="g3">
        <div className="card">
          <div className="ch"><div className="ct"><i className="ti ti-chart-bar" /> <span>{t("dash.salByEmployer")}</span></div></div>
          {d.payroll_total !== null && <BarChart {...charts.sal} height={160} />}
        </div>
        <div className="card">
          <div className="ch"><div className="ct"><i className="ti ti-chart-donut" /> <span>{t("dash.nationalities")}</span></div></div>
          <DonutChart {...charts.nat} height={160} />
        </div>
        <div className="card">
          <div className="ch"><div className="ct"><i className="ti ti-building" /> <span>{t("dash.employers")}</span></div></div>
          <DonutChart {...charts.emp} height={160} />
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="ch">
            <div className="ct"><i className="ti ti-alert-triangle" style={{ color: "var(--rd)" }} /> <span>{t("dash.alerts")}</span></div>
            <span className="b br" id="AC">{d.alerts.length}</span>
          </div>
          <div id="AL" style={{ maxHeight: 200, overflowY: "auto" }}>
            {d.alerts.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--mu)", fontSize: 13 }}>{t("dash.noAlerts")}</div>
            ) : (
              d.alerts.map((a) => {
                // the design's alert row: a coloured bar, red within 14 days (or expired), amber within 30
                const c = a.days_left <= 14 ? "var(--rd)" : a.days_left <= 30 ? "var(--am)" : "#f59e0b";
                return (
                  <div key={`${a.employee.id}-${a.kind}`} style={{ padding: "8px 10px", borderInlineStart: "3px solid " + c, marginBottom: 4, background: "color-mix(in srgb, " + c + " 8%, transparent)", borderRadius: 4, fontSize: 12, color: c }}>
                    ⚠ <b>{lang === "en" && a.employee.name_en ? a.employee.name_en : a.employee.name_ar}</b> — {t(`alert.${a.kind}` as MessageKey)}: {dmy(a.expires_on)}{" "}
                    <span style={{ fontWeight: 700 }}>({a.days_left <= 0 ? t("common.expired") : t("common.days", { n: a.days_left })})</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct"><i className="ti ti-chart-pie-2" /> <span>{t("dash.dept")}</span></div></div>
          <DonutChart {...charts.dept} height={180} />
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="ch"><div className="ct"><i className="ti ti-clock" /> <span>{t("dash.pendingTitle")}</span></div></div>
          <div id="PL" style={{ maxHeight: 200, overflowY: "auto" }}>
            {!queue || queue.length === 0 ? (
              <div style={{ color: "var(--mu)", textAlign: "center", padding: 14, fontSize: 12 }}>
                ✓ {d.pending_requests === 0 ? t("dash.noPending") : t("dash.pending") + ": " + d.pending_requests}
              </div>
            ) : (
              queue.slice(0, 15).map((r) => (
                <div key={r.id} style={{ padding: "8px 10px", borderBottom: "1px solid var(--bd)", fontSize: 12 }}>
                  <strong>{r.employee_name || "—"}</strong> — {typeLabel(r.type)}{" "}
                  <span style={{ color: "var(--mu)" }}>({STAGE_TXT[r.stage] ?? STAGE_TXT.other}) · {dmy(r.created_at.slice(0, 10))}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct"><i className="ti ti-cash" /> <span>{t("dash.paySummary")}</span></div></div>
          <div id="PS">
            {!d.current ? (
              <div style={{ color: "var(--mu)", textAlign: "center", padding: 14, fontSize: 12 }}>{t("dash.noPay")}</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
                  <span style={{ color: "var(--mu)" }}>عدد الموظفين</span>
                  <strong>{d.current}</strong>
                </div>
                {/* the total is sent only to accounts allowed to see salaries; the design's company-wide net is not in our API (DESIGN_PORT.md gaps) */}
                {d.payroll_total !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, borderTop: "1px solid var(--bd)" }}>
                    <span style={{ color: "var(--mu)" }}>إجمالي الرواتب</span>
                    <strong style={{ color: "var(--gr)" }}>{num(d.payroll_total)} ر.س</strong>
                  </div>
                )}
                {d.payroll_summary && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, borderTop: "1px solid var(--bd)" }}>
                    <span style={{ color: "var(--mu)" }}>{t("dash.lastRun", { month: d.payroll_summary.month, year: d.payroll_summary.year })}</span>
                    <span />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
