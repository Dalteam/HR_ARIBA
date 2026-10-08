import { Pressable, Text, View } from "react-native";
import { router, Tabs } from "expo-router";
import { useBell } from "@/lib/notifications";
import { fonts, useTheme } from "@/theme";

// Bell with the unread count (legacy V118), in every tab header.
function BellButton() {
  const t = useTheme();
  const { unread } = useBell();
  return (
    <Pressable onPress={() => router.push("/notifications")} style={{ marginHorizontal: 14 }} accessibilityLabel="الإشعارات">
      <Text style={{ fontSize: 20 }}>🔔</Text>
      {unread > 0 ? (
        <View style={{ position: "absolute", top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#d64545", alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: t.c }}>
          <Text style={{ color: "#fff", fontSize: 10, fontFamily: fonts.bold }}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Bottom navigation of the V114 employee app (frontend/legacy/employee-portal): الرئيسية، الحضور، الإجازات، الراتب، فريقي، مستندات، ملفي.
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.c },
        headerTitleStyle: { fontFamily: fonts.bold, color: t.tx },
        tabBarStyle: { backgroundColor: t.c, borderTopColor: t.bd },
        tabBarActiveTintColor: t.bl,
        tabBarInactiveTintColor: t.dm,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarIconStyle: { display: "none" },
        headerRight: () => <BellButton />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "الرئيسية" }} />
      <Tabs.Screen name="attendance" options={{ title: "الحضور" }} />
      <Tabs.Screen name="leaves" options={{ title: "الإجازات" }} />
      <Tabs.Screen name="salary" options={{ title: "الراتب" }} />
      <Tabs.Screen name="team" options={{ title: "فريقي" }} />
      <Tabs.Screen name="documents" options={{ title: "مستندات" }} />
      <Tabs.Screen name="profile" options={{ title: "ملفي" }} />
    </Tabs>
  );
}
