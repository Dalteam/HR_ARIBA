"use client";

// The employee web area's team tab, as the design's Team.jsx: the direct reports of the signed-in manager.
// The design's task/meeting board (its `ariba_my_tasks` RPC) and the team availability screen have no route
// in our API, so that card says so instead of showing an empty board (docs/DESIGN_PORT.md, Phase 3).
import { MeState } from "@/components/me/me-shell";
import { initials } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { myApprovals, myTeam } from "@/lib/me";
import { useApi } from "@/lib/use-api";

export default function MeTeam() {
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const team = useApi(myTeam, "me-team");
  const queue = useApi(myApprovals, "me-queue");

  if (team.error) return <MeState error={team.error.message} />;
  if (!team.data) return <MeState loading={team.loading} error={null} />;

  return (
    <>
      <div className="card">
        <div className="card-title">👥 {T("فريقي", "My team")}</div>
        {!team.data.length && (
          <div style={{ textAlign: "center", color: "var(--mu)", padding: 20, fontSize: 12 }}>
            {T("لم يتم تحديد موظفين تحت إدارتك.", "No employees are assigned under you.")}
          </div>
        )}
        {team.data.map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(59,130,246,.13)", color: "var(--bl)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>
              {initials(x.name_ar)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{x.name_ar}</div>
              <div style={{ fontSize: 10.5, color: "var(--mu)" }}>{x.job_title || "—"} · {x.emp_no}</div>
            </div>
          </div>
        ))}
        {!!queue.data?.length && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--am)" }}>
            ⏳ {T("لديك " + queue.data.length + " طلب بانتظار موافقتك — تبويب الموافقات", "You have " + queue.data.length + " request(s) awaiting approval — see Approvals")}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">📅 {T("المهام والاجتماعات / توفر الفريق", "Tasks, meetings & team availability")}</div>
        <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.8 }}>
          {T(
            "لوحة المهام والاجتماعات في التصميم تقرأ من جدول مهام لا يقدّمه خادمنا بعد، فالشاشة مؤجلة بدل عرض لوحة فارغة — يُفتح بعد مرحلة المهام والاجتماعات.",
            "The design's task and meeting board reads a tasks table our server does not serve yet, so the screen waits instead of showing an empty board — it opens after the tasks and meetings stage.",
          )}
        </div>
      </div>
    </>
  );
}

