// أهدافي وتقييمي — their goals/MyGoals.jsx: my targets grouped by period with their progress, and my approved
// evaluations with each item's score and the comments.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Badge, Card, CardTitle, Empty, Loading, Page, T } from "@/components/ui";
import { keyLabel, pct, PT, type PeriodType } from "@/lib/goals";
import { goals, type Evaluation, type Target } from "@/lib/port";
import { useTheme } from "@/theme";

export default function Goals() {
  const t = useTheme();
  const [d, setD] = useState<{ targets: Target[]; evaluations: Evaluation[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => goals.mine().then(setD).catch((e) => setErr(e.message || "تعذر التحميل")), []);
  useEffect(() => { load(); }, [load]);
  if (err) return <Page><Card><T color={t.rd}>{err}</T></Card></Page>;
  if (!d) return <Loading />;
  const groups: Record<string, Target[]> = {};
  d.targets.forEach((x) => { (groups[`${x.period_type}|${x.period_key}`] ??= []).push(x); });
  return (
    <Page onRefresh={load}>
      <Card>
        <CardTitle icon="star">مستهدفاتي</CardTitle>
        {!d.targets.length ? <Empty text="لا توجد مستهدفات حالياً" /> : null}
        {Object.entries(groups).map(([k, list]) => {
          const [type, key] = k.split("|");
          return (
            <View key={k} style={{ marginBottom: 10 }}>
              <T size={12} weight={800} color={t.bl} style={{ marginTop: 8, marginBottom: 4 }}>{`${PT[type as PeriodType]} — ${keyLabel(type, key)}`}</T>
              {list.map((x) => { const p = pct(x); return (
                <View key={x.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.bd }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <T size={12} weight={700} style={{ flex: 1 }}>{x.title}</T>
                    {p != null ? <T size={11}>{p}%</T> : null}
                  </View>
                  {x.description ? <T size={11} color={t.mu}>{x.description}</T> : null}
                  <T size={11} color={t.mu}>{`المطلوب ${x.target_value ?? "—"} ${x.unit ?? ""} · المنجز ${x.actual_value ?? 0}`}</T>
                  {p != null ? (
                    <View style={{ height: 6, backgroundColor: "rgba(120,140,160,.25)", borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
                      <View style={{ width: `${p}%`, height: "100%", backgroundColor: p >= 90 ? "#28B35D" : p >= 60 ? t.am : t.rd }} />
                    </View>
                  ) : null}
                </View>); })}
            </View>
          );
        })}
      </Card>
      <Card>
        <CardTitle icon="checks">تقييماتي</CardTitle>
        {!d.evaluations.length ? <Empty text="لا توجد تقييمات معتمدة بعد" /> : null}
        {d.evaluations.map((e) => (
          <View key={e.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.bd }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
              <T size={12} weight={700} style={{ flex: 1 }}>{`${PT[e.period_type as PeriodType]} — ${keyLabel(e.period_type, e.period_key)}`}</T>
              <T weight={800}>{e.overall}%</T>
              {e.rating ? <Badge text={e.rating} tone="bg" /> : null}
            </View>
            {(e.items ?? []).map((i, j) => <T key={j} size={11} color={t.mu}>{`• ${i.title}: ${i.score}%${(i as { comment?: string }).comment ? " — " + (i as { comment?: string }).comment : ""}`}</T>)}
            {e.comments ? <T size={11} style={{ marginTop: 4 }}>📝 {e.comments}</T> : null}
          </View>
        ))}
      </Card>
    </Page>
  );
}
