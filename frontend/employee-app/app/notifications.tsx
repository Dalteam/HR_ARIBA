// الإشعارات — legacy V118 bell panel.
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Txt } from "@/components/ui";
import { useBell } from "@/lib/notifications";
import { fonts, useTheme } from "@/theme";

const ICON = { template: "📄", request: "⏳", ok: "✅", no: "⛔" } as const;

function ago(ts: string) {
  const d = new Date(ts);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "الآن";
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`;
  if (s < 172800) return "أمس";
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Notifications() {
  const t = useTheme();
  const { items, unread, seenAt, refresh, markAllRead } = useBell();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "الإشعارات",
          headerTitleStyle: { fontFamily: fonts.bold },
          headerRight: () => (
            <Pressable disabled={!unread} onPress={markAllRead} style={{ opacity: unread ? 1 : 0.4 }}>
              <Txt bold style={{ color: t.gr, fontSize: 12 }}>تعليم الكل كمقروء</Txt>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} />}
      >
        {!items.length ? <Txt muted style={{ textAlign: "center", padding: 34 }}>لا توجد إشعارات</Txt> : null}
        {items.map((n) => {
          const un = new Date(n.at).getTime() > seenAt;
          return (
            <Pressable key={n.id} onPress={() => router.navigate(`/(tabs)/${n.target}`)}>
              <View style={[styles.item, { borderBottomColor: t.bd, backgroundColor: un ? "rgba(41,179,94,.09)" : "transparent" }]}>
                <Txt style={{ fontSize: 20 }}>{ICON[n.kind]}</Txt>
                <View style={{ flex: 1 }}>
                  <Txt bold style={{ fontSize: 12.5 }}>{n.title}</Txt>
                  {n.body ? <Txt muted style={{ fontSize: 11.5, marginTop: 2 }}>{n.body}</Txt> : null}
                  <Txt muted style={{ fontSize: 10.5, marginTop: 3 }}>{ago(n.at)}</Txt>
                </View>
                {un ? <View style={styles.dot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#d64545", marginTop: 7 },
});
