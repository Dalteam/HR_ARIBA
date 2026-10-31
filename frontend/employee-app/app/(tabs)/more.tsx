// المزيد — every screen of the app that is not in the dock, in one list (attendance log, my team, goals, overtime, documents,
// approvals, profile & settings). Nothing here is new: it is where the old scrolling tab bar's other tabs now live.
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Icon, type IconName } from "@/components/icons";
import { Card, Page, T } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data";
import { select } from "@/lib/haptics";
import { useTheme } from "@/theme";

const APPROVERS = ["manager", "hr", "ceo", "admin", "admin_manager", "chairman"];

export default function More() {
  const t = useTheme();
  const { user } = useAuth();
  const { employee, letters, approvals, team, refresh } = useData();
  const pendingDocs = letters.filter((l) => l.status === "pending").length;
  const go = (p: string) => { select(); router.navigate(p as never); };
  const rows: { icon: IconName; title: string; sub: string; to: string; badge?: number }[] = [
    { icon: "history", title: "سجل الحضور", sub: "حضورك وانصرافك والبحث بفترة", to: "/(tabs)/attendance" },
    { icon: "users", title: "فريقي", sub: team.length ? `${team.length} من فريقك · المهام والاجتماعات والتوفر` : "المهام والاجتماعات وتوفر الفريق", to: "/(tabs)/team" },
    { icon: "star", title: "أهدافي وتقييمي", sub: "مستهدفاتك وتقييمك الدوري", to: "/(tabs)/goals" },
    { icon: "stopwatch", title: "عمل إضافي", sub: "طلب ساعات إضافية ومتابعتها", to: "/(tabs)/overtime" },
    { icon: "file", title: "المستندات", sub: "نماذج بانتظار توقيعك وأرشيفها", to: "/(tabs)/documents", badge: pendingDocs },
    ...(APPROVERS.includes(user?.role ?? "") ? [{ icon: "checks" as IconName, title: "الموافقات", sub: "طلبات الموظفين بانتظار قرارك", to: "/(tabs)/approvals", badge: approvals.length }] : []),
  ];
  return (
    <Page onRefresh={refresh}>
      <Pressable accessibilityRole="button" accessibilityLabel="ملفي والإعدادات" onPress={() => go("/(tabs)/profile")}
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 24, backgroundColor: "#014D3D", marginBottom: 14, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,.14)", alignItems: "center", justifyContent: "center", transform: [{ skewX: "-8deg" }] }}>
          <T size={24} weight={800} color="#E4E4BC">{employee?.name_ar?.charAt(0) ?? ""}</T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={16} weight={800} color="#fff" numberOfLines={1}>{employee?.name_ar ?? ""}</T>
          <T size={12} color="#E4E4BC" numberOfLines={1} style={{ marginTop: 2 }}>ملفي · الوثائق · الآيبان · المظهر · كلمة المرور · الخروج</T>
        </View>
        <Icon name="chevronLeft" size={20} color="#E4E4BC" />
      </Pressable>
      <Card style={{ padding: 6 }}>
        {rows.map((r, i) => (
          <Pressable key={r.to} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => go(r.to)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 12, minHeight: 64,
              borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: t.bd, backgroundColor: pressed ? t.c2 : "transparent", borderRadius: 16 })}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.c2, alignItems: "center", justifyContent: "center" }}>
              <Icon name={r.icon} size={22} color={t.dark ? "#29B35E" : "#014D3D"} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={15} weight={700}>{r.title}</T>
              <T size={12} color={t.mu} numberOfLines={1}>{r.sub}</T>
            </View>
            {r.badge ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#B3342B", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><T size={11} weight={800} color="#fff">{r.badge}</T></View> : null}
            <Icon name="chevronLeft" size={18} color={t.mu} />
          </Pressable>
        ))}
      </Card>
    </Page>
  );
}
