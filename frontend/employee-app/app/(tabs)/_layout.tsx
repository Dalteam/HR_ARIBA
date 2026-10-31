// App shell of the legacy employee app (V118 js/core-ui/030 + 012/016/026/032): sticky header (page title, bell, key,
// logout, day/night, manual refresh) and the floating bottom nav. Approvals only for manager / hr / ceo / admin.
import { useEffect, useState } from "react";
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { getRefreshToken } from "@/lib/api";
import { biometricAvailable, biometricEnabled, enableBiometric, remembered, setNudged, wasNudged } from "@/lib/biometric";
import { useInsets } from "@/lib/insets";
import { router, Tabs } from "expo-router";
import { Icon } from "@/components/icons";
import { ComposerProvider } from "@/components/composer";
import { T, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data";
import { useBell } from "@/lib/notifications";
import { PunchProvider } from "@/lib/punch";
import { useTheme } from "@/theme";
import { shadow } from "@/lib/shadow";
import { select, tap } from "@/lib/haptics";
import { useLayout } from "@/lib/responsive";

const TABS: { name: string; title: string; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { name: "index", title: "الرئيسية", label: "الرئيسية", icon: "home" },
  { name: "attendance", title: "الحضور", label: "الحضور", icon: "clock" },
  { name: "leaves", title: "طلباتي", label: "طلباتي", icon: "calendar" },
  { name: "salary", title: "الراتب", label: "الراتب", icon: "cash" },
  { name: "team", title: "فريقي", label: "فريقي", icon: "users" },
  { name: "profile", title: "ملفي", label: "ملفي", icon: "user" },
  { name: "goals", title: "أهدافي وتقييمي", label: "أهدافي", icon: "star" },
  { name: "overtime", title: "عمل إضافي", label: "عمل إضافي", icon: "stopwatch" },
  { name: "documents", title: "المستندات", label: "مستندات", icon: "file" },
  { name: "approvals", title: "الموافقات", label: "الموافقات", icon: "checks" },
  { name: "more", title: "المزيد", label: "المزيد", icon: "more" },
];
const APPROVERS = ["manager", "hr", "ceo", "admin", "admin_manager", "chairman"];

function IconBtn({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [styles.ib, { backgroundColor: t.c, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

const FROM_MORE = ["attendance", "team", "goals", "overtime", "documents", "approvals", "profile"];

function Header({ title, route }: { title: string; route: string }) {
  const t = useTheme();
  const insets = useInsets();
  const { refresh } = useData();
  const bell = useBell();
  const toast = useToast();
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

  // large title on the page's own background (no bar, no divider): where am I is the first thing read
  return (
    <View style={[styles.hdr, { paddingTop: insets.top + 12, backgroundColor: t.bg }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
        {FROM_MORE.includes(route) ? (
          <IconBtn label="إغلاق والعودة إلى المزيد" onPress={() => router.navigate("/(tabs)/more" as never)}><Icon name="x" size={20} color={t.tx} stroke={2.2} /></IconBtn>
        ) : null}
        <T size={FROM_MORE.includes(route) ? 24 : 28} weight={800} style={{ flexShrink: 1, letterSpacing: -0.6, lineHeight: 36 }} numberOfLines={1}>{title}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconBtn label="تحديث البيانات" onPress={manualRefresh}>
          <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
            <Icon name="refresh" size={20} color={t.tx} stroke={2} />
          </Animated.View>
        </IconBtn>
        <IconBtn label={bell.unread > 0 ? `الإشعارات، ${bell.unread} جديدة` : "الإشعارات"} onPress={() => { setPanel(true); bell.refresh(); }}>
          <Icon name="bell" size={21} color={t.tx} stroke={2} />
          {bell.unread > 0 ? (
            <View style={[styles.badge, { borderColor: t.c }]}><T size={10} weight={800} color="#fff">{bell.unread > 99 ? "99+" : bell.unread}</T></View>
          ) : null}
        </IconBtn>
      </View>
      <BellPanel visible={panel} onClose={() => setPanel(false)} top={insets.top + 64} />
    </View>
  );
}

const KIND = {
  template: { bg: "rgba(66,133,244,.14)", fg: "#014D3D", icon: "file" },
  request: { bg: "rgba(214,158,46,.17)", fg: "#231F20", icon: "clock" },
  ok: { bg: "rgba(41,179,94,.17)", fg: "#1F8D49", icon: "checkCircle" },
  no: { bg: "rgba(181,74,74,.15)", fg: "#B54A4A", icon: "xCircle" },
  announcement: { bg: "rgba(1,77,61,.14)", fg: "#014D3D", icon: "bell" },
  greeting: { bg: "rgba(228,228,188,.55)", fg: "#231F20", icon: "star" },
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
// SDK 58 no longer hands a `navigation` object to a custom tab bar, so the dock navigates through the router.
type BottomTabBarProps = { state: { index: number; routes: NavRoute[] } };

const DOCK: { name: string; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { name: "index", label: "الرئيسية", icon: "home" },
  { name: "leaves", label: "طلباتي", icon: "clipboard" },
  { name: "salary", label: "الراتب", icon: "wallet" },
  { name: "more", label: "المزيد", icon: "more" },
];

function BottomNav({ state }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useInsets();
  const { width, gutter, dockMax } = useLayout();
  const dockW = Math.min(dockMax, width - gutter * 2); // tablets: a dock of phone width, centred
  const { approvals, letters } = useData();
  const current = state.routes[state.index]?.name;
  const badge = (name: string) => (name === "more" ? letters.filter((l) => l.status === "pending").length + approvals.length : 0);
  const item = (d: (typeof DOCK)[number]) => {
    const on = current === d.name || (d.name === "more" && !!current && !["index", "leaves", "salary"].includes(current));
    const color = on ? (t.dark ? "#29B35E" : "#014D3D") : t.mu;
    const n = badge(d.name);
    return (
      <Pressable key={d.name} accessibilityRole="tab" accessibilityLabel={d.label} accessibilityState={{ selected: on }}
        onPress={() => { select(); router.navigate((d.name === "index" ? "/(tabs)" : `/(tabs)/${d.name}`) as never); }} style={({ pressed }) => [styles.tab, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <View style={{ transform: [{ translateY: on ? -2 : 0 }] }}><Icon name={d.icon} size={23} color={color} stroke={on ? 2.1 : 1.8} /></View>
        <T size={11.5} weight={on ? 800 : 600} color={color} numberOfLines={1}>{d.label}</T>
        <View style={[styles.tabLine, { backgroundColor: "#29B35E", opacity: on ? 1 : 0, transform: [{ skewX: "-30deg" }, { scaleX: on ? 1 : 0.2 }] }]} />
        {n > 0 ? <View style={[styles.navBadge, { backgroundColor: "#B3342B" }]}><T size={10} weight={800} color="#fff">{n}</T></View> : null}
      </Pressable>
    );
  };
  return (
    <View style={[styles.bnav, { left: (width - dockW) / 2, right: (width - dockW) / 2, bottom: Math.max(14, insets.bottom), backgroundColor: t.dark ? "rgba(1,61,49,.94)" : "rgba(255,255,255,.94)", borderColor: t.bd }]}>
      {item(DOCK[0])}{item(DOCK[1])}
      {item(DOCK[2])}{item(DOCK[3])}
    </View>
  );
}

/** Their BioAsk: once, after signing in with «تذكرني», offer Face ID / fingerprint sign-in on this device. */
function BioAsk() {
  const toast = useToast();
  useEffect(() => {
    (async () => {
      if (!(await remembered()) || !(await biometricAvailable()) || (await biometricEnabled()) || (await wasNudged())) return;
      await setNudged();
      Alert.alert("تفعيل الدخول بالبصمة؟", "بدل كتابة كلمة المرور كل مرة، تدخل بالبصمة أو Face ID على هذا الجهاز.", [
        { text: "ليس الآن", style: "cancel" },
        { text: "تفعيل", onPress: async () => { const rt = await getRefreshToken(); if (!rt) return; const r = await enableBiometric(rt); toast(r.msg, r.ok ? "ok" : "err"); } },
      ]);
    })();
  }, [toast]);
  return null;
}

export default function TabsLayout() {
  return (
    <PunchProvider>
      <ComposerProvider>
      <BioAsk />
      <Tabs tabBar={(p) => <BottomNav {...(p as unknown as BottomTabBarProps)} />} screenOptions={({ route }) => ({
        header: () => <Header title={TABS.find((x) => x.name === route.name)?.title ?? ""} route={route.name} />,
      })}>
        {TABS.map((x) => <Tabs.Screen key={x.name} name={x.name} options={{ title: x.title }} />)}
      </Tabs>
      </ComposerProvider>
    </PunchProvider>
  );
}

const styles = StyleSheet.create({
  hdr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 18, paddingBottom: 8, zIndex: 10 },
  ib: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", ...shadow("#014D3D", 0.1, 5, 0, 2, 1) },
  badge: { position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#B54A4A", alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2 },
  mode: { height: 36, minWidth: 36, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  refresh: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bnav: { position: "absolute", left: 14, right: 14, height: 68, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", paddingHorizontal: 6,
    ...shadow("#014D3D", 0.22, 16, 0, 12, 10) },
  tab: { flex: 1, height: 68, alignItems: "center", justifyContent: "center", gap: 2 },
  tabLine: { position: "absolute", bottom: 6, width: 16, height: 3, borderRadius: 2 },
  navBadge: { position: "absolute", top: 8, right: "22%", minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  panel: { position: "absolute", left: 8, right: 8, maxHeight: "76%", borderWidth: 1, borderRadius: 18, overflow: "hidden",
    ...shadow("#000", 0.28, 25, 0, 18, 10) },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  newPill: { backgroundColor: "rgba(214,69,69,.13)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  item: { flexDirection: "row", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, alignItems: "flex-start" },
  kind: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#B54A4A", marginTop: 7 },
});
