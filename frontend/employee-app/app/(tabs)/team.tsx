// فريقي — legacy requests/004 renderTeam.
import { View } from "react-native";
import { Card, CardTitle, Empty, Page, T } from "@/components/ui";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

export default function Team() {
  const t = useTheme();
  const { team, refresh } = useData();
  return (
    <Page onRefresh={refresh}>
      <Card>
        <CardTitle icon="users">فريقي</CardTitle>
        {!team.length ? <Empty text="لا يوجد موظفين" /> : null}
        {team.map((m) => (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.bd }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }}>
              <T size={16} weight={800} color={t.bl}>{m.name_ar.charAt(0)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T size={12} weight={700}>{m.name_ar}</T>
              <T size={10} color={t.mu}>{m.job_title ?? ""}</T>
            </View>
          </View>
        ))}
      </Card>
    </Page>
  );
}
