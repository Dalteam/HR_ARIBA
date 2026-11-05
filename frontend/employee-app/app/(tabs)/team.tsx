// فريقي — their Team.jsx + MgrTeam.jsx: my direct reports; what HR lets the direct manager see (team data, leave
// balances and leaves, salary), targets and evaluation, on-behalf requests for members who delegated me, the team's
// requests with their status, and the tasks / meetings / availability screen.
import { useCallback, useEffect, useState } from "react";
import { StatusLine } from "@/components/status-icon";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Badge, Btn, Card, CardTitle, Empty, Page, T } from "@/components/ui";
import { NAME } from "@/components/request-item";
import { useData } from "@/lib/data";
import { manager, tasks, type ManagerPerms, type PortRequest, type TeamMember } from "@/lib/port";
import { useTheme } from "@/theme";

const STATUS = (r: PortRequest): [string, "bg" | "br" | "ba"] =>
  r.status === "approved" ? ["موافق", "bg"] : r.status === "rejected" ? ["مرفوض", "br"]
    : [{ manager: "بانتظار المدير المباشر", hr: "بانتظار الموارد البشرية", ceo: "بانتظار الرئيس التنفيذي" }[r.current_stage] ?? "معلق", "ba"];
function detail(r: PortRequest): string {
  const p = r.payload ?? {};
  if (p.from || p.to) return `${p.from ?? ""} ← ${p.to ?? ""}${p.days != null ? ` | ${p.days} يوم` : ""}`;
  if (p.amount) return `المبلغ: ${Number(p.amount).toLocaleString("en-US")} ر.س`;
  if (p.date) return `${p.date}${p.time ? " " + p.time : ""}${p.hours ? ` | ${p.hours} ساعة` : ""}`;
  return p.notes ?? "";
}

export default function Team() {
  const t = useTheme();
  const { approvals, refresh } = useData();
  const [perms, setPerms] = useState<ManagerPerms | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [reqs, setReqs] = useState<PortRequest[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [openTasks, setOpenTasks] = useState(0);
  const load = useCallback(async () => {
    tasks.list("inbox").then((r) => setOpenTasks(r.items.filter((x) => x.status === "open").length)).catch(() => {});
    try {
      const p = await manager.perms();
      setPerms(p);
      if (!p.is_manager) return;
      manager.team().then(setTeam).catch(() => setTeam([]));
      if (p.perms.view_team_requests) manager.requests().then(setReqs).catch(() => setReqs([]));
    } catch { setPerms({ is_manager: false, team_count: 0, perms: {} as ManagerPerms["perms"] }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const P = perms?.perms;

  return (
    <Page onRefresh={async () => { await Promise.all([refresh(), load()]); }}>
      <Card>
        <CardTitle icon="users">فريقي</CardTitle>
        {team && !team.length ? <Empty text="لم يتم تحديد موظفين تحت إدارتك." /> : null}
        {!perms?.is_manager ? <Empty text="لم يتم تحديد موظفين تحت إدارتك." /> : null}
        {(team ?? []).map((m) => (
          <View key={m.id} style={{ borderBottomWidth: 1, borderBottomColor: t.bd }}>
            <Pressable onPress={() => setOpen(open === m.id ? null : m.id)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(59,130,246,.13)" }}>
                <T size={16} weight={800} color={t.bl}>{m.name_ar.charAt(0)}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T size={12} weight={700}>{m.name_ar}</T>
                <T size={10} color={t.mu}>{m.job_title ?? ""}</T>
              </View>
              {m.delegated ? <Badge text="فوّضك" tone="bg" /> : null}
              <T color={t.mu}>{open === m.id ? "▴" : "▾"}</T>
            </Pressable>
            {open === m.id ? (
              <View style={{ paddingBottom: 10, gap: 3 }}>
                {P?.view_team_data ? <T size={11.5} color={t.mu}>{`الجنسية: ${m.nationality ?? "—"} | تاريخ المباشرة: ${m.join_date ?? "—"} | انتهاء العقد: ${m.contract_end ?? "—"} | انتهاء الإقامة: ${m.iqama_expiry ?? "—"}`}</T> : null}
                {m.leave_balance != null ? <T size={11.5} color={t.mu}>رصيد الإجازة: {String(m.leave_balance)}</T> : null}
                {P?.view_team_salary ? <T size={11.5} color={t.mu}>إجمالي الراتب: {m.salary_total != null ? Number(m.salary_total).toLocaleString("en-US") : "—"}</T> : null}
                {m.leaves ? (m.leaves.length ? m.leaves.map((l) => <T key={l.id} size={11.5} color={t.mu}>{`• ${NAME[l.type] ?? l.type} ${l.from} ← ${l.to} (${l.days} يوم) — ${l.status}`}</T>) : <T size={11.5} color={t.mu}>لا إجازات خلال 12 شهراً</T>) : null}
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {P?.manage_targets ? <Btn kind="ghost" title="🎯 المستهدفات" style={{ marginTop: 0 }} onPress={() => router.push({ pathname: "/team-goals", params: { id: m.id, name: m.name_ar, mode: "goals" } })} /> : null}
                  {P?.evaluate_team ? <Btn kind="ghost" title="⭐ التقييم" style={{ marginTop: 0 }} onPress={() => router.push({ pathname: "/team-goals", params: { id: m.id, name: m.name_ar, mode: "eval" } })} /> : null}
                </View>
                {P?.submit_for_team && m.delegated ? <Btn title="📝 تقديم طلب نيابةً عنه" onPress={() => router.push({ pathname: "/submit-for", params: { id: m.id, name: m.name_ar } })} /> : null}
                {P?.submit_for_team && !m.delegated ? <T size={10} color={t.mu}>لم يفعّل الموظف «تفويض المدير المباشر» بعد.</T> : null}
              </View>
            ) : null}
          </View>
        ))}
        {approvals.length > 0 ? <StatusLine name="wait" size={14} style={{ marginTop: 10 }}><T size={12} color={t.am}>{`لديك ${approvals.length} طلب بانتظار موافقتك — تبويب الموافقات`}</T></StatusLine> : null}
      </Card>

      {P?.view_team_requests && reqs ? (
        <Card>
          <CardTitle icon="clipboard">طلبات فريقي وحالتها</CardTitle>
          {!reqs.length ? <Empty text="لا طلبات" /> : null}
          {reqs.slice(0, 40).map((r) => { const st = STATUS(r); return (
            <View key={r.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.bd }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
                <T size={12} weight={700} style={{ flex: 1 }}>{`${r.employee_name ?? ""} — ${NAME[r.request_type] ?? r.request_type}`}</T>
                <Badge text={st[0]} tone={st[1]} />
              </View>
              <T size={11} color={t.mu}>{detail(r)}</T>
              {r.status === "rejected" && r.reject_reason ? <StatusLine name="rejected" size={13}><T size={11} color={t.rd}>{r.reject_reason}</T></StatusLine> : null}
            </View>); })}
        </Card>
      ) : null}

      <Card>
        <CardTitle icon="calendar">المهام والاجتماعات / توفر الفريق</CardTitle>
        <Btn title={`فتح${openTasks ? ` — ${openTasks} مهمة مفتوحة` : ""}`} onPress={() => router.push("/tasks")} style={{ marginTop: 0 }} />
      </Card>
    </Page>
  );
}
