// طلباتي — their Leaves.jsx «📋 طلباتي» and the delegation card. Sending a request is the «+» in the dock (components/composer.tsx),
// which holds every type, rule and attachment that used to be the inline form here.
import { dateLocale } from "@/i18n";
import { Alert, View } from "react-native";
import { Btn, Card, CardTitle, Empty, Page, T, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useComposer } from "@/components/composer";
import { ApiError, requests, type MyRequest } from "@/lib/api";
import { DelegationCard } from "@/components/delegation";
import { RequestItem } from "@/components/request-item";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

const DAY = 86400000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Requests grouped by the day they were sent, newest day first. */
function byDay(list: MyRequest[]): [string, MyRequest[]][] {
  const m = new Map<string, MyRequest[]>();
  for (const r of [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const k = ymd(new Date(r.created_at));
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()];
}
function dayLabel(k: string) {
  const now = new Date();
  if (k === ymd(now)) return "اليوم";
  if (k === ymd(new Date(now.getTime() - DAY))) return "أمس";
  const [y, mo, d] = k.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function Leaves() {
  const t = useTheme();
  const toast = useToast();
  const { open } = useComposer();
  const { requests: list, refresh } = useData();
  const mine = list.filter((r) => r.type !== "overtime");
  const pending = mine.filter((r) => r.status === "pending").length;

  function remove(r: MyRequest) {
    Alert.alert("حذف الطلب", "هل تريد حذف هذا الطلب؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try { await requests.remove(r.id); toast("تم الحذف", "ok"); await refresh(); } catch (e) { toast(e instanceof ApiError ? e.message : "تعذر الحذف", "err"); }
      } },
    ]);
  }

  return (
    <Page onRefresh={refresh}>
      <Btn kind="primary" title="طلب جديد" icon={<Icon name="send" size={16} color="#012A21" />} onPress={() => open()} style={{ marginTop: 0, marginBottom: 14 }} />
      <Card>
        <CardTitle icon="clipboard">طلباتي</CardTitle>
        {pending ? <View style={{ marginBottom: 6 }}><T size={12} color={t.mu}>{`${pending} طلب بانتظار الاعتماد`}</T></View> : null}
        {!mine.length ? <Empty text="لا توجد طلبات" /> : null}
        {byDay(mine).map(([day, rows]) => (
          <View key={day}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 2 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.bd }} />
              <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: t.bg, borderWidth: 1, borderColor: t.bd }}>
                <T size={11.5} weight={800} color={t.mu}>{dayLabel(day)}</T>
              </View>
              <View style={{ flex: 1, height: 1, backgroundColor: t.bd }} />
            </View>
            {rows.map((r) => <RequestItem key={r.id} r={r} onDelete={remove} />)}
          </View>
        ))}
      </Card>
      <DelegationCard />
    </Page>
  );
}
