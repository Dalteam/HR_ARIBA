// الرئيسية — legacy V118 home (js/core-ui/030 hero + tiles + quick actions) over 018.renderHome (بياناتي، آخر راتب معتمد)
// and V122 «جهة العمل ومواقع العمل».
import { dateLocale } from "@/i18n";
import { memo, useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Defs, LinearGradient, Polygon, Rect, Stop } from "react-native-svg";
import { Icon, type IconName } from "@/components/icons";
import { useComposer } from "@/components/composer";
import { ForgotPunchSheet, LocationsCard, dmy, sar, todayISO } from "@/components/shared";
import { Card, Page, T } from "@/components/ui";
import { RequestItem } from "@/components/request-item";
import { AnnouncementsCard } from "@/components/announcements";
import { LeaveIcon } from "@/components/leave-icon";
import { useData } from "@/lib/data";
import { usePhoto } from "@/lib/photo";
import { useAuth } from "@/lib/auth";
import { useTileWidth } from "@/lib/grid";
import { useLayout } from "@/lib/responsive";
import { diagOff } from "@/lib/diag";
import { distanceText } from "@/lib/geo";
import { riyadhParts, todaySessions, usePunch, workedMinutes } from "@/lib/punch";
import { useAppBrand, useTheme } from "@/theme";
import { shadow } from "@/lib/shadow";

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (diagOff("clock")) return;
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

const DIAL = 176;
const R = 80;

// The one bright action of the screen: a lime key (sand once you are in, quiet once the day is done) in a ring that fills with the worked hours.
function Dial({ state, progress, onPress, busy, watermark }: { state: "in" | "out" | "done"; progress: number; onPress: () => void; busy: boolean; watermark?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  // «سجّل حضورك»: a ring that pulses outward invites the first tap
  useEffect(() => {
    if (state !== "in" || busy) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [state, busy, pulse]);
  // while the work day is open (from the check-in until the check-out) a soft glow breathes around the dial; it stops once checked out
  useEffect(() => {
    if (state !== "out") { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 2600, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 2600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state, glow]);
  // while the punch is being verified (location, server) the fingerprint is scanned top to bottom
  useEffect(() => {
    if (!busy) { scan.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(scan, { toValue: 1, duration: 1100, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [busy, scan]);
  const fill = { in: "#29B35E", out: "#E4E4BC", done: "rgba(255,255,255,.22)" }[state];
  const ink = state === "in" ? "#012A21" : state === "out" ? "#231F20" : "#E8F2ED";
  const label = { in: "سجّل حضورك", out: "سجّل انصرافك", done: "تم الانصراف" }[state];
  const icon = { in: "fingerprint", out: "fingerprint", done: "checkCircle" }[state] as IconName;
  const c = 2 * Math.PI * R;
  const inner = DIAL - 32;
  return (
    <View style={{ width: DIAL, height: DIAL, alignSelf: "center", marginTop: 12, marginBottom: 4, alignItems: "center", justifyContent: "center" }}>
      {watermark ? <Image source={{ uri: watermark }} resizeMode="contain" style={{ pointerEvents: "none", position: "absolute", width: DIAL + 34, height: DIAL + 34, opacity: 0.16 }} /> : null}
      {state === "out" ? (
        <Animated.View style={{ pointerEvents: "none", position: "absolute", width: DIAL + 30, height: DIAL + 30, borderRadius: (DIAL + 30) / 2, backgroundColor: "rgba(41,179,94,.30)",
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.75] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.05] }) }] }} />
      ) : null}
      <Svg width={DIAL} height={DIAL} style={StyleSheet.absoluteFill}>
        <Circle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke="rgba(255,255,255,.16)" strokeWidth={6} fill="none" />
        <Circle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke="#29B35E" strokeWidth={6} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, progress)} ${c}`} transform={`rotate(-90 ${DIAL / 2} ${DIAL / 2})`} />
      </Svg>
      {state === "in" && !busy ? (
        <Animated.View style={{ pointerEvents: "none", position: "absolute", width: inner, height: inner, borderRadius: inner / 2, borderWidth: 2, borderColor: fill,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }] }} />
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={busy || state === "done"}
        style={({ pressed }) => ({ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: fill, alignItems: "center", justifyContent: "center",
          transform: [{ scale: pressed ? 0.95 : 1 }], opacity: busy ? 0.7 : 1, ...shadow("#000", 0.35, 14, 0, 12, 8) })}>
        {busy ? (
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 54, height: 54, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <Icon name="fingerprint" size={52} color={ink} stroke={1.8} />
              <Animated.View style={{ pointerEvents: "none", position: "absolute", left: 4, right: 4, height: 3, borderRadius: 2, backgroundColor: ink, opacity: 0.55,
                transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [-24, 24] }) }] }} />
            </View>
            <T size={14} weight={800} color={ink} style={{ marginTop: 4 }}>جارٍ التحقق…</T>
          </View>
        ) : (
          <View style={{ alignItems: "center" }}>
            <Icon name={icon} size={state === "done" ? 46 : 54} color={ink} stroke={1.8} />
            <T size={15} weight={800} color={ink} style={{ marginTop: 4 }}>{label}</T>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function Chip({ text, tone, icon }: { text: string; tone?: "ok" | "bad"; icon: "pin" | "flag" | "clock" }) {
  const color = tone === "bad" ? "#FFB4AA" : "#fff";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,.12)" }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone === "bad" ? "#FF8A7E" : "#29B35E" }} />
      <Icon name={icon} size={13} color={color} stroke={2} />
      <T size={12} weight={600} color={color}>{text}</T>
    </View>
  );
}

// Memoised: the card re-renders every second for the clock, and redrawing a gradient with ribbons that often made the page stutter on phones.
const HeroArt = memo(function HeroArt({ w, h, c }: { w: number; h: number; c: { a: string; b: string; c: string; band1: string; band2: string } | null }) {
  const k = c ?? { a: "#01392D", b: "#014D3D", c: "#0B6B4F", band1: "#29B35E", band2: "#E4E4BC" };   // null = the original colours
  return (
    <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Defs>
            <LinearGradient id="heroBg" x1="0.2" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor={k.a} />
              <Stop offset="0.55" stopColor={k.b} />
              <Stop offset="1" stopColor={k.c} />
            </LinearGradient>
            <LinearGradient id="band1" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={k.band1} stopOpacity="0" /><Stop offset="1" stopColor={k.band1} stopOpacity="0.4" /></LinearGradient>
            <LinearGradient id="band2" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={k.band2} stopOpacity="0" /><Stop offset="1" stopColor={k.band2} stopOpacity="0.2" /></LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={w} height={h} fill="url(#heroBg)" />
          <Polygon points={`0,${h * 0.26} ${w},${h * 0.04} ${w},${h * 0.17} 0,${h * 0.39}`} fill="url(#band1)" />
          <Polygon points={`0,${h * 0.84} ${w},${h * 0.66} ${w},${h * 0.74} 0,${h * 0.92}`} fill="url(#band2)" />
        </Svg>
  );
});

function Hero({ onForgot }: { onForgot: () => void }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const ab = useAppBrand();
  const now = useNow();
  const { employee, att } = useData();
  const { loc, punch, busy } = usePunch();
  const r = riyadhParts(now);
  const { rows, open, lastOut } = todaySessions(att);
  const state = !rows.length ? "in" : open ? "out" : "done";
  const worked = workedMinutes(rows, r.minutes);
  const shift = (att?.shift_hours ?? 8) * 60;
  const fg = "#fff";
  const h12 = r.h % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = now.toLocaleDateString(dateLocale(), { timeZone: "Asia/Riyadh", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const name = employee?.name_ar ?? "";
  const photo = usePhoto(employee?.id, employee?.has_photo);
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
    <View style={styles.hero} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* the artwork (gradient + slanted ribbons) is the only green: drawn at the card's measured size (not "100%") so it covers the whole card and all its text, however tall the content grows */}
      {ab.heroBg ? (
        <>
          <Image source={{ uri: ab.heroBg }} resizeMode="cover" style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} />
          <View style={[StyleSheet.absoluteFill, { pointerEvents: "none", backgroundColor: "rgba(0,0,0,.32)" }]} />
        </>
      ) : box.w > 0 ? <HeroArt w={box.w} h={box.h} c={ab.hero} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <View style={styles.avatar}>
          {photo ? <Image source={{ uri: photo }} resizeMode="cover" style={styles.avatarImg} />
            : <T size={19} weight={800} color="#E4E4BC">{name.charAt(0)}</T>}
        </View>
        <View style={{ flex: 1 }}>
          <T size={12.5} color={fg} style={{ opacity: 0.78 }}>{r.h < 12 ? "صباح الخير" : "مساء الخير"}</T>
          <T size={18} weight={800} color={fg} numberOfLines={1} style={{ letterSpacing: -0.3 }}>{shortName(name)}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", direction: "ltr", alignItems: "baseline", justifyContent: "center", marginTop: 14, gap: 6 }}>
        <T size={52} weight={300} color={fg} style={{ letterSpacing: -2 }}>{`${pad(h12)}:${pad(r.m)}`}</T>
        <T size={20} weight={300} color={fg} style={{ opacity: 0.7 }}>{`\u200E:${pad(r.s)}`}</T>
        <T size={14} weight={700} color={fg} style={{ opacity: 0.75 }}>{r.h < 12 ? "ص" : "م"}</T>
      </View>
      <T size={12.5} color={fg} center style={{ opacity: 0.78 }}>{date}</T>
      <Dial state={state} progress={worked / shift} busy={busy} watermark={ab.punch} onPress={() => punch(state === "in" ? "in" : "out")} />
      <View style={styles.chips}>
        <Chip icon="pin" text={locChip.text} tone={locChip.tone} />
        {open && att?.flexible_enabled && att.expected_checkout ? <Chip icon="flag" text={`الانصراف المتوقع ${att.expected_checkout}`} /> : null}
        {rows.length ? <Chip icon="clock" text={`ساعات اليوم ${Math.floor(worked / 60)}س ${String(worked % 60).padStart(2, "0")}د`} /> : null}
      </View>
      {rows.length ? (
        <View style={[styles.chips, { marginTop: 8 }]}>
          {rows.map((s, i) => (
            <View key={i} style={{ backgroundColor: "rgba(255,255,255,.12)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
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
      <Pressable onPress={onForgot} style={{ alignSelf: "center", marginTop: 8 }}><T size={12} weight={600} color={fg} style={{ opacity: 0.8 }}>نسيت البصمة؟</T></Pressable>
    </View>
  );
}

function Ledger({ items }: { items: [string, string, string][] }) {
  const t = useTheme();
  return (
    <View style={[styles.ledger, { backgroundColor: t.c }]}>
      {items.map(([v, l, ic], i) => (
        <View key={l} style={[styles.ledgerCell, i > 0 && { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: t.bd }]}>
          <LeaveIcon type={ic} size={34} color={t.dark ? "#29B35E" : "#014D3D"} />
          <T size={26} weight={300} style={{ letterSpacing: -0.8 }}>{v}</T>
          <T size={12} color={t.mu} center>{l}</T>
        </View>
      ))}
    </View>
  );
}

// Stage A1: the two lines the web /me home had under its leave tiles — «مرحّل» and the nearest public holiday. On a
// phone a fourth cell would squeeze the three ledger numbers, so they sit under it as slim pills (and hide when both
// are empty: no carry from last year, no holidays ahead).
function CarryNotes() {
  const t = useTheme();
  const { leave } = useData();
  const carry = Math.round(Number(leave?.carry ?? 0) * 100) / 100;
  const today = todayISO();
  const holiday = (leave?.upcoming_holidays ?? []).find((h) => h.date >= today);
  if (!(carry > 0) && !holiday) return null;
  const ink = t.dark ? "#29B35E" : "#014D3D";
  const pill = { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11, maxWidth: "100%" as const, backgroundColor: t.c, borderColor: t.bd };
  return (
    <View style={styles.notes}>
      {carry > 0 ? (
        <View style={pill}>
          <Icon name="history" size={13} color={ink} stroke={2} />
          <T size={11.5} weight={700}>{`مرحّل: ${carry} يوم`}</T>
        </View>
      ) : null}
      {holiday ? (
        <View style={pill}>
          <Icon name="calendar" size={13} color={ink} stroke={2} />
          <T size={11.5} weight={700} numberOfLines={1} style={{ flexShrink: 1 }}>{`أقرب إجازة رسمية: ${holiday.name} — ${dmy(holiday.date)}`}</T>
        </View>
      ) : null}
    </View>
  );
}

// Every screen of the app is one tap from here (the dock keeps only five places).
function Service({ label, icon, onPress, badge, wide, width }: { label: string; icon: IconName; onPress: () => void; badge?: number; wide?: boolean; width?: number }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.svc, width ? { width } : null, wide && styles.svcWide, { backgroundColor: t.c, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={[styles.svcIc, { backgroundColor: t.c2 }]}><Icon name={icon} size={21} color={t.dark ? "#29B35E" : "#014D3D"} /></View>
      <T size={12} weight={700} center numberOfLines={2}>{label}</T>
      {badge ? <View style={styles.svcBadge}><T size={10} weight={800} color="#fff">{badge}</T></View> : null}
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
  const { open } = useComposer();
  const { user } = useAuth();
  const { employee, leave, att, payslips, letters, approvals, requests, refresh } = useData();
  const [forgot, setForgot] = useState(false);
  const last = payslips[0];
  const fmt = (n: number | undefined) => (n == null ? "—" : String(Math.round(n * 100) / 100));
  const go = (p: string) => router.navigate(p as never);
  const isApprover = ["manager", "hr", "ceo", "admin", "admin_manager", "chairman"].includes(user?.role ?? "");
  const pendingDocs = letters.filter((l) => l.status === "pending").length;
  const services: { icon: IconName; label: string; onPress: () => void; badge?: number }[] = [
    { icon: "calendar", label: "طلب إجازة", onPress: () => open("annual") },
    { icon: "clock", label: "استئذان", onPress: () => open("permission") },
    { icon: "cash", label: "سلفة", onPress: () => open("advance") },
    { icon: "stopwatch", label: "عمل إضافي", onPress: () => go("/(tabs)/overtime") },
    { icon: "fingerprint", label: "نسيت بصمة", onPress: () => setForgot(true) },
    { icon: "file", label: "مستنداتي", onPress: () => go("/(tabs)/documents"), badge: pendingDocs },
    { icon: "history", label: "سجل الحضور", onPress: () => go("/(tabs)/attendance") },
    { icon: "star", label: "أهدافي", onPress: () => go("/(tabs)/goals") },
    { icon: "users", label: "فريقي", onPress: () => go("/(tabs)/team") },
    ...(isApprover ? [{ icon: "checks" as IconName, label: "الموافقات", onPress: () => go("/(tabs)/approvals"), badge: approvals.length }] : []),
  ];
  const L = useLayout();
  const grid = useTileWidth(L.cols, 10);
  const running = requests.filter((r) => r.status === "pending").slice(0, 2);
  return (
    <Page onRefresh={refresh}>
      <Hero onForgot={() => setForgot(true)} />
      <Ledger items={[[fmt(leave?.current), "رصيد الإجازة (يوم)", "annual"], [fmt(leave?.year_end), "رصيد نهاية العام", "year_end"], [att ? String(Math.max(0, att.remote_limit - att.remote_used)) : "—", "عن بعد المتبقي", "remote"]]} />
      <CarryNotes />

      <AnnouncementsCard />

      <T size={16} weight={800} style={styles.sec}>ماذا تحتاج اليوم؟</T>
      <View style={styles.svcGrid} onLayout={grid.onLayout}>
        {services.map((x, i) => <Service key={x.label} {...x} width={grid.tile} wide={services.length % L.cols === 1 && i === services.length - 1} />)}
      </View>

      {running.length ? (
        <>
          <T size={16} weight={800} style={styles.sec}>طلباتك الجارية</T>
          <Card>{running.map((r) => <RequestItem key={r.id} r={r} />)}</Card>
        </>
      ) : null}

      <T size={16} weight={800} style={styles.sec}>بياناتي</T>
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
  hero: { borderRadius: 30, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 18, overflow: "hidden", marginBottom: 14, ...shadow("#014D3D", 0.3, 16, 0, 14, 6) },
  avatar: { width: 46, height: 46, backgroundColor: "rgba(255,255,255,.14)", borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden", transform: [{ skewX: "-8deg" }] },
  // the photo is skewed back, so the tile keeps its slant and the face stays straight (52 > 46 leaves no gap in the corners)
  avatarImg: { width: 52, height: 52, transform: [{ skewX: "8deg" }] },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 6 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", marginTop: 10, borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, borderColor: "#fff" },
  ledger: { flexDirection: "row", borderRadius: 22, overflow: "hidden", marginBottom: 6, ...shadow("#014D3D", 0.08, 8, 0, 4, 2) },
  ledgerCell: { flex: 1, alignItems: "center", paddingVertical: 14, paddingHorizontal: 6, gap: 2 },
  notes: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8, marginBottom: 2 },
  sec: { marginTop: 18, marginBottom: 10, marginHorizontal: 2, letterSpacing: -0.3 },
  svcGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  svc: { width: "31.6%", alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 3, borderRadius: 18, minHeight: 92, ...shadow("#014D3D", 0.08, 8, 0, 4, 2) },
  svcWide: { width: "100%", flexDirection: "row", minHeight: 64, justifyContent: "flex-start", gap: 12, paddingHorizontal: 16, paddingTop: 10 },
  svcIc: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  svcBadge: { position: "absolute", top: 6, right: 8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#B3342B", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
});
