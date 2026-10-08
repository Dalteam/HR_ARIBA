// مستندات — forms sent by HR for signature (legacy forms/020 pending templates + V71/V114/V117).
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Card, ErrorText, Txt } from "@/components/ui";
import { letters, type Letter } from "@/lib/api";
import { useTheme } from "@/theme";

const LETTER_STATUS: Record<Letter["status"], { text: string; tone: "am" | "gr" | "rd" }> = {
  pending: { text: "بانتظار ردك", tone: "am" },
  approved: { text: "تمت الموافقة", tone: "gr" },
  rejected: { text: "معترض عليه", tone: "rd" },
};

export default function Documents() {
  const t = useTheme();
  const [list, setList] = useState<Letter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await letters.mine());
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل البيانات");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <ErrorText message={error} />
      <Card title="📄 النماذج المرسلة لك">
        {!list.length ? <Txt muted style={{ textAlign: "center", padding: 16 }}>لا توجد نماذج</Txt> : null}
        {list.map((x) => {
          const st = LETTER_STATUS[x.status];
          return (
            <Pressable key={x.id} onPress={() => router.push({ pathname: "/letter/[id]", params: { id: x.id, title: x.title, status: x.status } })}>
              <View style={[styles.item, { borderBottomColor: t.bd }]}>
                <View style={{ flex: 1 }}>
                  <Txt bold style={{ fontSize: 13 }}>{x.title}</Txt>
                  <Txt muted style={{ fontSize: 10 }}>{x.created_at.slice(0, 10)}</Txt>
                  {x.rejection_reason ? <Txt style={{ fontSize: 11, color: t.rd }}>❌ {x.rejection_reason}</Txt> : null}
                </View>
                <Txt bold style={{ fontSize: 11, color: t[st.tone] }}>{st.text}</Txt>
              </View>
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
});
