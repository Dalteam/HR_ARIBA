// App shell of the legacy employee app (V118 js/core-ui/030 + 012/016/026/032): sticky header (page title, bell, key,
// logout, day/night, manual refresh) and the floating bottom nav. Approvals only for manager / hr / ceo / admin.
import { useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Tabs } from "expo-router";
import { Icon } from "@/components/icons";
import { PasswordSheet } from "@/components/password-sheet";
import { T, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DataProvider, useData } from "@/lib/data";
import { useBell } from "@/lib/notifications";
import { PunchProvider } from "@/lib/punch";
import { brand, useTheme, useThemeMode } from "@/theme";

const TABS: { name: string; title: string; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { name: "index", title: "الرئيسية", label: "الرئيسية", icon: "home" },
  { name: "attendance", title: "الحضور", label: "الحضور", icon: "clock" },
  { name: "leaves", title: "الإجازات", label: "الإجازات", icon: "calendar" },
  { name: "salary", title: "الراتب", label: "الراتب", icon: "cash" },
  { name: "team", title: "فريقي", label: "فريقي", icon: "users" },
  { name: "profile", title: "ملفي", label: "ملفي", icon: "user" },
  { name: "overtime", title: "عمل إضافي", label: "عمل إضافي", icon: "stopwatch" },
  { name: "documents", title: "المستندات", label: "مستندات", icon: "file" },
  { name: "approvals", title: "الموافقات", label: "الموافقات", icon: "checks" },
];
const APPROVERS = ["manager", "hr", "ceo", "admin", "admin_manager", "chairman"];

function IconBtn({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.ib, { borderColor: t.bd, backgroundColor: t.c2, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

function Header({ title }: { title: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { mode, toggle } = useThemeMode();
  const { signOut } = useAuth();
  const { refresh } = useData();
  const bell = useBell();
  const toast = useToast();
  const [pw, setPw] = useState(false);
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const spin = useState(() => new Animated.Value(0))[0];

  async function manualRefresh() {
    if (busy) return;
    setBusy(true);
    spin.setValue(0);
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })).start();
    try {
      await Promise.all([refresh(), bell.refresh()]);
      toast("تم التحديث والحفظ", "ok");
    } catch {
      toast("تعذر إكمال التحديث", "err");
    } finally {
      spin.stopAnimation();
      setBusy(false);
    }
  }

  return (
    <View style={[styles.hdr, { paddingTop: insets.top + 10, backgroundColor: t.c, borderBottomColor: "rgba(1,77,61,.10)" }]}>
      <T size={17} weight={800} style={{ letterSpacing: 0.2, flexShrink: 1 }} numberOfLines={1}>{title}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <IconBtn label="الإشعارات" onPress={() => { setPanel(true); bell.refresh(); }}>
          <Icon name="bell" size={19} color={t.tx} stroke={2} />
          {bell.unread > 0 ? (
            <View style={[styles.badge, { borderColor: t.c }]}><T size={10} weight={800} color="#fff">{bell.unread > 99 ? "99+" : bell.unread}</T></View>
          ) : null}
        </IconBtn>
        <IconBtn label="تغيير كلمة المرور" onPress={() => setPw(true)}><Icon name="key" size={18} color={t.tx} stroke={2} /></IconBtn>
        <IconBtn label="خروج" onPress={signOut}><Icon name="logout" size={18} color={t.tx} stroke={2} /></IconBtn>
        <Pressable onPress={toggle} style={[styles.mode, { backgroundColor: brand.beige, borderColor: brand.beige }]}>
          <T size={11} weight={800} color={t.dark ? "#FFFFFF" : "#014D3D"}>{mode === "dark" ? "نهاري" : "ليلي"}</T>
        </Pressable>
        <Pressable onPress={manualRefresh} style={[styles.refresh, { backgroundColor: t.dark ? "#29B35E" : "#014D3D" }]}>
          <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
            <Icon name="refresh" size={18} color={t.dark ? "#013D31" : "#fff"} stroke={2} />
          </Animated.View>
        </Pressable>
      </View>
      <PasswordSheet visible={pw} onClose={() => setPw(false)} onDone={() => toast("تم تغيير كلمة المرور", "ok")} />
      <BellPanel visible={panel} onClose={() => setPanel(false)} top={insets.top + 58} />
    </View>
  );
}

const KIND = {
  template: { bg: "rgba(66,133,244,.14)", fg: "#3b7ddd", icon: "file" },
  request: { bg: "rgba(214,158,46,.17)", fg: "#b9811a", icon: "clock" },
  ok: { bg: "rgba(41,179,94,.17)", fg: "#1F8D49", icon: "checkCircle" },
  no: { bg: "rgba(181,74,74,.15)", fg: "#B54A4A", icon: "xCircle" },
} as const;

function ago(ts: string) {
  const d = new Date(ts);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "الآن";
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`;
  if (s < 172800) return "أمس";
  return d.toLocaleDateString("en-GB");
}

// V118 bell panel.
function BellPanel({ visible, onClose, top }: { visible: boolean; onClose: () => void; top: number }) {
  const t = useTheme();
  const { items, unread, markAllRead } = useBell();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.panel, { top, backgroundColor: t.c, borderColor: t.bd }]}>
          <View style={[styles.panelHead, { borderBottomColor: t.bd }]}>
            <T size={14} weight={800} style={{ flex: 1 }}>الإشعارات</T>
            {unread > 0 ? <View style={styles.newPill}><T size={11} weight={800} color="#B54A4A">{unread} جديد</T></View> : null}
            <Pressable disabled={!unread} onPress={markAllRead} style={{ opacity: unread ? 1 : 0.4, paddingHorizontal: 4 }}>
              <T size={11.5} weight={800} color={t.gr}>تعليم الكل كمقروء</T>
            </Pressable>
            <Pressable onPress={onClose}><T size={20} color={t.mu}>×</T></Pressable>
          </View>
          <ScrollView>
            {!items.length ? <T center color={t.mu} style={{ padding: 34 }}>لا توجد إشعارات.</T> : null}
            {items.map((n) => {
              const k = KIND[n.kind] ?? KIND.ok;
              const un = !n.is_read;
              return (
                <Pressable key={n.id} onPress={() => { onClose(); router.navigate(`/(tabs)/${n.target}` as never); }}
                  style={[styles.item, { borderBottomColor: t.bd, backgroundColor: un ? "rgba(41,179,94,.09)" : "transparent" }]}>
                  <View style={[styles.kind, { backgroundColor: k.bg }]}><Icon name={k.icon} size={18} color={k.fg} stroke={2} /></View>
                  <View style={{ flex: 1 }}>
                    <T size={12.5} weight={800}>{n.title}</T>
                    {n.body ? <T size={11.5} color={t.mu} numberOfLines={3} style={{ marginTop: 2 }}>{n.body}</T> : null}
                    <T size={10.5} color={t.mu} style={{ marginTop: 3 }}>{ago(n.at)}</T>
                  </View>
                  {un ? <View style={styles.dot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type NavRoute = { key: string; name: string };
type BottomTabBarProps = { state: { index: number; routes: NavRoute[] }; navigation: { navigate: (name: string) => void } };

function BottomNav({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { letters, approvals } = useData();
  const pendingDocs = letters.filter((l) => l.status === "pending").length;
  const visible = TABS.filter((x) => x.name !== "approvals" || APPROVERS.includes(user?.role ?? ""));
  return (
    <View style={[styles.bnav, { bottom: 10 + insets.bottom / 2, backgroundColor: t.c, borderColor: "rgba(1,77,61,.10)" }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingHorizontal: 4 }}>
        {visible.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          const on = route && state.routes[state.index]?.key === route.key;
          const color = on ? (t.dark ? "#29B35E" : "#014D3D") : t.mu;
          const count = tab.name === "documents" ? pendingDocs : tab.name === "approvals" ? approvals.length : 0;
          return (
            <Pressable key={tab.name} onPress={() => route && navigation.navigate(route.name)}
              style={[styles.bni, on && { backgroundColor: t.dark ? "rgba(41,179,94,.20)" : "rgba(1,77,61,.10)" }]}>
              <View style={on ? { transform: [{ translateY: -1 }, { scale: 1.08 }] } : undefined}><Icon name={tab.icon} size={22} color={color} /></View>
              <T size={10} weight={700} color={color} numberOfLines={1}>{tab.label}</T>
              {count > 0 ? <View style={[styles.navBadge, { backgroundColor: tab.name === "approvals" ? t.rd : "#B54A4A" }]}><T size={9} weight={700} color="#fff">{count}</T></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <DataProvider>
      <PunchProvider>
        <Tabs tabBar={(p) => <BottomNav {...(p as unknown as BottomTabBarProps)} />} screenOptions={({ route }) => ({
          header: () => <Header title={TABS.find((x) => x.name === route.name)?.title ?? ""} />,
        })}>
          {TABS.map((x) => <Tabs.Screen key={x.name} name={x.name} options={{ title: x.title }} />)}
        </Tabs>
      </PunchProvider>
    </DataProvider>
  );
}

const styles = StyleSheet.create({
  hdr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1,
    shadowColor: "#014D3D", shadowOpacity: 0.06, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 2, zIndex: 10 },
  ib: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#B54A4A", alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2 },
  mode: { height: 36, minWidth: 36, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  refresh: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bnav: { position: "absolute", left: 10, right: 10, borderRadius: 24, borderWidth: 1, paddingVertical: 6,
    shadowColor: "#014D3D", shadowOpacity: 0.18, shadowRadius: 17, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  bni: { minWidth: 62, alignItems: "center", gap: 3, paddingTop: 7, paddingBottom: 6, paddingHorizontal: 4, borderRadius: 18 },
  navBadge: { position: "absolute", top: 2, right: 12, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  panel: { position: "absolute", left: 8, right: 8, maxHeight: "76%", borderWidth: 1, borderRadius: 18, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 25, shadowOffset: { width: 0, height: 18 }, elevation: 10 },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  newPill: { backgroundColor: "rgba(214,69,69,.13)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  item: { flexDirection: "row", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, alignItems: "flex-start" },
  kind: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#B54A4A", marginTop: 7 },
});
