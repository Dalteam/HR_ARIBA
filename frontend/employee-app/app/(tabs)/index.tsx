// الرئيسية — legacy V118 home (js/core-ui/030 hero + tiles + quick actions) over 018.renderHome (بياناتي، آخر راتب معتمد)
// and V122 «جهة العمل ومواقع العمل».
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { AribaMark, Icon } from "@/components/icons";
import { ForgotPunchSheet, LocationsCard, sar } from "@/components/shared";
import { Card, Page, T } from "@/components/ui";
import { useData } from "@/lib/data";
import { distanceText } from "@/lib/geo";
import { riyadhParts, todaySessions, usePunch, workedMinutes } from "@/lib/punch";
import { useTheme } from "@/theme";

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function shortName(full: string) {
  const w = full.trim().split(/\s+/);
  if (w.length <= 2) return full;
  const first = w[0] === "عبد" || w[0] === "أبو" ? `${w[0]} ${w[1]}` : w[0];
  return `${first} ${w[w.length - 1]}`;
}

const DIAL = 184;
const R = 82;

function Dial({ state, progress, onPress, busy }: { state: "in" | "out" | "done"; progress: number; onPress: () => void; busy: boolean }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state === "done" || busy) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [state, busy, pulse]);
  const grad = { in: ["#4bdc86", "#29B35E", "#1d9a4c"], out: ["#dc7777", "#B54A4A", "#9a3b3b"], done: ["#7fb3a3", "#4f8c7a", "#3f7565"] }[state];
  const label = { in: "سجّل حضورك", out: "سجّل انصرافك", done: "تم الانصراف" }[state];
  const icon = { in: "fingerprint", out: "exit", done: "checkCircle" }[state] as "fingerprint" | "exit" | "checkCircle";
  const c = 2 * Math.PI * R;
  const inner = DIAL - 32;
  return (
    <View style={{ width: DIAL, height: DIAL, alignSelf: "center", marginTop: 10, marginBottom: 4, alignItems: "center", justifyContent: "center" }}>
      <Svg width={DIAL} height={DIAL} style={StyleSheet.absoluteFill}>
        <Circle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke={t.dark ? "rgba(228,228,188,.18)" : "rgba(1,77,61,.14)"} strokeWidth={6} fill="none" />
        <Circle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke="#29B35E" strokeWidth={6} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, progress)} ${c}`} transform={`rotate(-90 ${DIAL / 2} ${DIAL / 2})`} />
      </Svg>
      {state !== "done" && !busy ? (
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: inner, height: inner, borderRadius: inner / 2, borderWidth: 3, borderColor: grad[1],
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] }} />
      ) : null}
      <Pressable onPress={onPress} disabled={busy || state === "done"} style={({ pressed }) => [{ width: inner, height: inner, borderRadius: inner / 2, overflow: "hidden",
        alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.96 : 1 }],
        shadowColor: "#014D3D", shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 12 }, elevation: 8 }]}>
        <Svg width={inner} height={inner} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="dialFill" cx="30%" cy="24%" r="90%">
              <Stop offset="0" stopColor={grad[0]} />
              <Stop offset="0.58" stopColor={grad[1]} />
              <Stop offset="1" stopColor={grad[2]} />
            </RadialGradient>
          </Defs>
          <Circle cx={inner / 2} cy={inner / 2} r={inner / 2} fill="url(#dialFill)" />
        </Svg>
        {busy ? <T size={14} weight={800} color="#fff">...</T> : (
          <View style={{ alignItems: "center", zIndex: 1 }}>
            <Icon name={icon} size={46} color="#fff" stroke={1.8} />
            <T size={14} weight={800} color="#fff" style={{ marginTop: 4 }}>{label}</T>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function Chip({ text, tone, icon }: { text: string; tone?: "ok" | "bad"; icon: "pin" | "flag" | "clock" }) {
  const t = useTheme();
  const bg = tone === "ok" ? "rgba(41,179,94,.12)" : tone === "bad" ? "rgba(214,107,107,.12)" : t.dark ? "rgba(228,228,188,.10)" : "rgba(1,77,61,.07)";
  const border = tone === "ok" ? "rgba(41,179,94,.35)" : tone === "bad" ? "rgba(214,107,107,.35)" : t.dark ? "rgba(228,228,188,.2)" : "rgba(1,77,61,.16)";
  const color = tone === "bad" ? (t.dark ? "#F07A7A" : "#8f3636") : t.dark ? "#E4E4BC" : "#014D3D";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: bg, borderWidth: 1, borderColor: border }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone === "ok" ? "#29B35E" : tone === "bad" ? "#d96b6b" : "#c9a24a" }} />
      <Icon name={icon} size={13} color={color} stroke={2} />
      <T size={11.5} weight={700} color={color}>{text}</T>
    </View>
  );
}

function Hero({ onForgot }: { onForgot: () => void }) {
  const t = useTheme();
  const now = useNow();
  const { employee, att } = useData();
  const { loc, punch, busy } = usePunch();
  const r = riyadhParts(now);
  const { rows, open, lastOut } = todaySessions(att);
  const state = !rows.length ? "in" : open ? "out" : "done";
  const worked = workedMinutes(rows, r.minutes);
  const shift = (att?.shift_hours ?? 8) * 60;
  const fg = t.dark ? "#E4E4BC" : "#014D3D";
  const h12 = r.h % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const name = employee?.name_ar ?? "";
  const locChip = (() => {
    switch (loc.kind) {
      case "loading": return { text: "جاري تحديد موقعك…" };
      case "inside": return { text: `داخل نطاق: ${loc.name}`, tone: "ok" as const };
      case "outside": return { text: `خارج النطاق — أقرب موقع ${loc.name} (${distanceText(loc.distance)})`, tone: "bad" as const };
      case "denied": return { text: "فعّل صلاحية الموقع", tone: "bad" as const };
      case "unset": return { text: "إحداثيات موقع عملك غير مضبوطة", tone: "bad" as const };
      case "none": return { text: "لا يوجد موقع عمل", tone: "bad" as const };
      default: return { text: "تعذر تحديد الموقع", tone: "bad" as const };
    }
  })();

  return (
    <View style={[styles.hero, t.dark ? { backgroundColor: "#075444", borderColor: "rgba(228,228,188,.16)" } : { backgroundColor: "#F6F2E4", borderColor: "rgba(1,77,61,.12)" }]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="hero" x1="0.35" y1="0" x2="0.65" y2="1">
            <Stop offset="0" stopColor={t.dark ? "#075444" : "#FBF8EF"} />
            <Stop offset="1" stopColor={t.dark ? "#013D31" : "#F0EAD8"} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero)" />
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute", alignSelf: "center", top: 120 }}>
        <AribaMark width={250} height={262} top={t.dark ? "#E4E4BC" : "#014D3D"} bottom={t.dark ? "#E4E4BC" : "#29B35E"} opacity={t.dark ? 0.15 : 0.22} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <View style={[styles.avatar, { backgroundColor: t.dark ? "rgba(228,228,188,.14)" : "#014D3D" }]}>
          <T size={18} weight={800} color={t.dark ? "#E4E4BC" : "#fff"}>{name.charAt(0)}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T size={12} color={fg} style={{ opacity: 0.78 }}>{r.h < 12 ? "صباح الخير" : "مساء الخير"}</T>
          <T size={17} weight={800} color={fg} numberOfLines={1}>{shortName(name)}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", marginTop: 12, gap: 6 }}>
        <T size={36} weight={800} color={t.dark ? "#fff" : "#014D3D"} style={{ letterSpacing: 1.5 }}>{`${pad(h12)}:${pad(r.m)}:${pad(r.s)}`}</T>
        <T size={14} weight={700} color={t.dark ? "#fff" : "#014D3D"} style={{ opacity: 0.75 }}>{r.h < 12 ? "ص" : "م"}</T>
      </View>
      <T size={12} color={fg} center style={{ opacity: 0.78 }}>{date}</T>
      <Dial state={state} progress={worked / shift} busy={busy} onPress={() => punch(state === "in" ? "in" : "out")} />
      <View style={styles.chips}>
        <Chip icon="pin" text={locChip.text} tone={locChip.tone} />
        {open && att?.flexible_enabled && att.expected_checkout ? <Chip icon="flag" text={`الانصراف المتوقع ${att.expected_checkout}`} /> : null}
        {rows.length ? <Chip icon="clock" text={`ساعات اليوم ${Math.floor(worked / 60)}س ${String(worked % 60).padStart(2, "0")}د`} /> : null}
      </View>
      {rows.length ? (
        <View style={[styles.chips, { marginTop: 8 }]}>
          {rows.map((s, i) => (
            <View key={i} style={{ backgroundColor: t.dark ? "rgba(228,228,188,.1)" : "rgba(1,77,61,.08)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <T size={11.5} weight={700} color={fg}>{`${s.time_in} → ${s.time_out ?? "…"}`}</T>
            </View>
          ))}
        </View>
      ) : null}
      {state === "done" ? (
        <Pressable onPress={() => punch("in")} disabled={busy} style={[styles.back, { borderColor: fg }]}>
          <Icon name="back" size={15} color={fg} stroke={2} />
          <T size={12.5} weight={800} color={fg}>رجوع للعمل — تسجيل حضور مرة أخرى</T>
        </Pressable>
      ) : null}
      {lastOut && open && rows.length > 1 ? <T size={11} color={fg} center style={{ marginTop: 6, opacity: 0.8 }}>رجعت للعمل بعد انصراف الساعة {lastOut}</T> : null}
      <Pressable onPress={onForgot} style={{ alignSelf: "center", marginTop: 8 }}><T size={11} color={fg} style={{ opacity: 0.7 }}>نسيت البصمة؟</T></Pressable>
    </View>
  );
}

function Tile({ value, label, icon }: { value: string; label: string; icon: "building" | "calendar" | "wallet" }) {
  const t = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: t.c }]}>
      <View style={styles.tileIcon}><Icon name={icon} size={18} color="#29B35E" /></View>
      <T size={22} weight={800}>{value}</T>
      <T size={10.5} color={t.mu} center>{label}</T>
    </View>
  );
}

function Quick({ label, icon, onPress }: { label: string; icon: "calendar" | "fingerprint" | "stopwatch" | "file"; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.qa, { backgroundColor: t.c, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
      <View style={[styles.qaIcon, { backgroundColor: t.dark ? "rgba(41,179,94,.18)" : "rgba(1,77,61,.09)" }]}>
        <Icon name={icon} size={20} color={t.dark ? "#29B35E" : "#014D3D"} />
      </View>
      <T size={11} weight={800} center>{label}</T>
    </Pressable>
  );
}

function Mini({ label, value }: { label: string; value?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ flexBasis: "48%", flexGrow: 1, backgroundColor: t.c2, borderRadius: 8, padding: 8 }}>
      <T size={10} color={t.mu}>{label}</T>
      <T size={12} weight={700} style={{ marginTop: 2 }} numberOfLines={1}>{value || "—"}</T>
    </View>
  );
}

export default function Home() {
  const t = useTheme();
  const { employee, leave, att, payslips, refresh } = useData();
  const [forgot, setForgot] = useState(false);
  const last = payslips[0];
  const fmt = (n: number | undefined) => (n == null ? "—" : String(Math.round(n * 100) / 100));
  return (
    <Page onRefresh={refresh}>
      <Hero onForgot={() => setForgot(true)} />
      <View style={styles.tiles}>
        <Tile icon="building" value={fmt(leave?.current)} label="رصيد الإجازة (يوم)" />
        <Tile icon="calendar" value={fmt(leave?.year_end)} label="رصيد نهاية العام" />
        <Tile icon="wallet" value={att ? String(Math.max(0, att.remote_limit - att.remote_used)) : "—"} label="عن بعد المتبقي" />
      </View>
      <View style={styles.tiles}>
        <Quick icon="calendar" label="طلب إجازة" onPress={() => router.navigate("/(tabs)/leaves" as never)} />
        <Quick icon="fingerprint" label="نسيت بصمة" onPress={() => setForgot(true)} />
        <Quick icon="stopwatch" label="عمل إضافي" onPress={() => router.navigate("/(tabs)/overtime" as never)} />
        <Quick icon="file" label="مستنداتي" onPress={() => router.navigate("/(tabs)/documents" as never)} />
      </View>
      <T size={12} weight={800} color={t.mu} style={{ marginBottom: 8, marginTop: 2 }}>بياناتي</T>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Mini label="جهة العمل" value={employee?.workplace?.name_ar} />
          <Mini label="القسم" value={employee?.department?.name_ar} />
          <Mini label="الجنسية" value={employee?.nationality?.name_ar} />
          <Mini label="الوظيفة" value={employee?.job_title} />
        </View>
      </Card>
      <Card>
        <T size={16} weight={700} style={{ marginBottom: 10 }}>آخر راتب معتمد</T>
        {last ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T weight={700}>{`${last.year}/${String(last.month).padStart(2, "0")}`}</T>
            <T size={18} weight={700} color={t.gr}>{sar(last.data.netSAR ?? last.data.net)}</T>
          </View>
        ) : <T color={t.mu}>لا يوجد مسير معتمد</T>}
      </Card>
      <LocationsCard />
      <ForgotPunchSheet visible={forgot} onClose={() => setForgot(false)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 30, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 18, overflow: "hidden", borderWidth: 1, marginBottom: 14,
    shadowColor: "#014D3D", shadowOpacity: 0.12, shadowRadius: 17, shadowOffset: { width: 0, height: 14 }, elevation: 3 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 6 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", marginTop: 10, borderWidth: 1.5, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  tiles: { flexDirection: "row", gap: 10, marginBottom: 14 },
  tile: { flex: 1, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 8, alignItems: "center", gap: 4,
    shadowColor: "#014D3D", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  tileIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(41,179,94,.14)", alignItems: "center", justifyContent: "center" },
  qa: { flex: 1, borderRadius: 20, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, alignItems: "center", gap: 6,
    shadowColor: "#014D3D", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  qaIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
