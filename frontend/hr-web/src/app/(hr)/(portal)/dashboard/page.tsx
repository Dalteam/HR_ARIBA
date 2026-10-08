"use client";

import { useMemo } from "react";
import { BarChart, DonutChart, colorFor } from "@/components/hr/charts";
import { PageState } from "@/components/hr/not-built";
import type { CountItem } from "@/lib/api";
import { getDashboard } from "@/lib/employees";
import { dmy, num } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";

// Layout and inline styles reproduce the prototype dashboard (#pg-dash after its V42 patch).
const TILE: React.CSSProperties = { background: "var(--c2)", borderRadius: 18, padding: "24px 20px", minHeight: 140 };
const ROW: React.CSSProperties = { background: "var(--c1)", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" };

export default function DashboardPage() {
  const { t, lang } = useLocale();
  const { data: d, error, loading, reload } = useApi(getDashboard, "dashboard");
  const name = (i: CountItem) => (lang === "en" ? i.name_en : i.name_ar);

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
          <div style={{ background: "#014D3D", borderRadius: 18, padding: "24px 20px", textAlign: "center", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 140 }}>
            <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: 0.5, marginBottom: 8 }}>{t("dash.current")}</div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>{d.current}</div>
            <div style={{ fontSize: 11, opacity: 0.7, borderTop: "1px solid rgba(255,255,255,.25)", paddingTop: 8 }}>{t("dash.saudiExpat", { saudi: d.saudi, expat: d.expat })}</div>
          </div>
          <div data-ariba-kpi="saudization" style={{ ...TILE, textAlign: "center", border: "2px solid #014D3D", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="ariba-kpi-label" style={{ fontSize: 12, color: "var(--mu)", marginBottom: 8 }}>{t("dash.saudization")}</div>
            <div className="ariba-kpi-value" style={{ fontSize: 52, fontWeight: 900, color: "#014D3D", lineHeight: 1, marginBottom: 10 }}>
              {num(pct)}<span style={{ fontSize: 22 }}>%</span>
            </div>
            <div style={{ height: 8, background: "var(--bd)", borderRadius: 4 }}>
              <div style={{ height: 8, borderRadius: 4, background: "#014D3D", width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
          <div data-ariba-kpi="payroll" style={{ ...TILE, textAlign: "center", border: "2px solid #B8BFBC", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="ariba-kpi-label" style={{ fontSize: 12, color: "var(--mu)", marginBottom: 8 }}>{t("dash.payroll")}</div>
            <div className="ariba-kpi-value" style={{ fontSize: 26, fontWeight: 900, color: "#B8BFBC", lineHeight: 1.2, marginBottom: 6 }}>
              {d.payroll_total === null ? "—" : num(d.payroll_total)}
            </div>
            <div style={{ fontSize: 12, color: "var(--mu)" }}>{t("dash.payrollUnit")}</div>
          </div>
          <div data-ariba-kpi="gender" style={{ ...TILE, border: "2px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "var(--mu)", marginBottom: 14, fontWeight: 600 }}>{t("dash.gender")}</div>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", height: "calc(100% - 36px)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 6 }}>👨</div>
                <div className="ariba-male-number" style={{ fontSize: 28, fontWeight: 900, color: "#014D3D", lineHeight: 1 }}>{d.male}</div>
                <div style={{ fontSize: 12, color: "var(--mu)", marginTop: 4 }}>{t("dash.male", { pct: malePct })}</div>
              </div>
              <div style={{ width: 1, height: 60, background: "var(--bd)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 6 }}>👩</div>
                <div className="ariba-male-number" style={{ fontSize: 28, fontWeight: 900, color: "#014D3D", lineHeight: 1 }}>{d.female}</div>
                <div style={{ fontSize: 12, color: "var(--mu)", marginTop: 4 }}>{t("dash.female", { pct: known ? 100 - malePct : 0 })}</div>
              </div>
            </div>
            {d.gender_unspecified > 0 && <div style={{ fontSize: 10, color: "var(--mu)", textAlign: "center" }}>{t("dash.genderUnknown", { n: d.gender_unspecified })}</div>}
          </div>
          <div data-ariba-kpi="departments" style={{ ...TILE, border: "2px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "var(--mu)", marginBottom: 12, fontWeight: 600 }}>{t("dash.departments")}</div>
            {d.departments.slice(0, 4).map((x) => (
              <div key={x.name_ar} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "var(--mu)" }}>{name(x)}</span>
                <span className="ariba-dept-number" style={{ fontWeight: 900, color: "#014D3D" }}>{x.count}</span>
              </div>
            ))}
          </div>
          <div data-ariba-kpi="pending" style={{ ...TILE, padding: "20px 16px", border: "2px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            {(
              [
                ["dash.pending", d.pending_requests],
                ["dash.ended", d.terminated],
                ["dash.tamheer", d.tamheer],
              ] as [MessageKey, number][]
            ).map(([k, v]) => (
              <div key={k} style={ROW}>
                <span style={{ fontSize: 12, color: "var(--mu)" }}>{t(k)}</span>
                <span className="ariba-pending-number" style={{ fontSize: 26, fontWeight: 900, color: "#014D3D" }}>{v}</span>
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
              d.alerts.slice(0, 12).map((a) => (
                <div key={`${a.employee.id}-${a.kind}`} className={`al ${a.days_left <= 30 ? "alr" : "ala"}`}>
                  <i className="ti ti-alert-triangle" />
                  <div>
                    <strong>{lang === "en" && a.employee.name_en ? a.employee.name_en : a.employee.name_ar}</strong> — {t(`alert.${a.kind}` as MessageKey)}: {dmy(a.expires_on)} (
                    {a.days_left <= 0 ? t("common.expired") : t("common.days", { n: a.days_left })})
                  </div>
                </div>
              ))
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
            <div style={{ color: "var(--mu)", textAlign: "center", padding: 14, fontSize: 12 }}>
              {d.pending_requests === 0 ? t("dash.noPending") : `${d.pending_requests}`}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct"><i className="ti ti-cash" /> <span>{t("dash.paySummary")}</span></div></div>
          <div id="PS">
            <div style={{ color: "var(--mu)", textAlign: "center", padding: 14, fontSize: 12 }}>
              {d.payroll_summary ? t("dash.lastRun", { month: d.payroll_summary.month, year: d.payroll_summary.year }) : t("dash.noPay")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
