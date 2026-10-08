// الحضور — legacy main/08-attendance-gps-forgot.js + V117 (رجوع للعمل، جلسات اليوم، سجل 31 يوم) + V122b (حالة الموقع).
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Button, Card, ErrorText, Loading, Txt } from "@/components/ui";
import { ApiError, attendance, type MyAttendance, type MySession } from "@/lib/api";
import { currentFix, distanceText, evaluate, type Fix, type LocState } from "@/lib/geo";
import { fonts, useTheme } from "@/theme";

const STATUS: Record<string, string> = { present: "حاضر", late: "متأخر", remote: "عن بعد", absent: "غائب", leave: "إجازة" };

function riyadhNow() {
  const n = new Date();
  const time = n.toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const date = n.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return { time, date, minutes: Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) };
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

function useClock() {
  const [now, setNow] = useState(riyadhNow);
  useEffect(() => {
    const id = setInterval(() => setNow(riyadhNow()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function badge(state: LocState): { text: string; color: "gr" | "rd" | "am" | "mu" | "bl" } {
  switch (state.kind) {
    case "loading":
      return { text: "جاري تحديد الموقع...", color: "mu" };
    case "denied":
      return { text: "❌ فعّل صلاحية الموقع", color: "rd" };
    case "error":
      return { text: "❌ تعذر تحديد الموقع", color: "rd" };
    case "none":
      return { text: "⚠️ لا يوجد موقع عمل", color: "am" };
    case "unset":
      return { text: "⚠️ إحداثيات موقع عملك غير مضبوطة", color: "am" };
    case "inside":
      return { text: `📍 ${state.name}`, color: "gr" };
    case "remote":
      return { text: `🏠 ${state.name}`, color: "bl" };
    case "outside":
      return { text: `❌ خارج النطاق — أقرب موقع ${state.name} (${distanceText(state.distance)})`, color: "rd" };
  }
}

export default function Attendance() {
  const t = useTheme();
  const now = useClock();
  const [data, setData] = useState<MyAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [loc, setLoc] = useState<LocState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await attendance.mine());
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل البيانات");
    }
  }, []);

  const locate = useCallback(async (): Promise<Fix | null> => {
    try {
      const f = await currentFix();
      if (f === "denied") {
        setLoc({ kind: "denied" });
        return null;
      }
      setFix(f);
      return f;
    } catch {
      setLoc({ kind: "error" });
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      locate();
      const id = setInterval(locate, 15000); // legacy V122b re-checks every 15 s
      return () => clearInterval(id);
    }, [load, locate]),
  );

  useEffect(() => {
    if (fix && data) setLoc(evaluate(fix, data.locations));
  }, [fix, data]);

  async function punch(action: "in" | "out") {
    if (busy) return;
    setBusy(true);
    try {
      const f = await locate();
      if (!f) {
        Alert.alert("تعذر تحديد الموقع", "فعّل صلاحية الموقع وحاول مرة أخرى");
        return;
      }
      const s = await attendance.punch(action, f.lat, f.lng);
      if (action === "in") Alert.alert("✅ تم تسجيل حضورك", s.late_minutes > 0 ? `تأخير ${s.late_minutes} دقيقة` : undefined);
      else Alert.alert("🚪 تم تسجيل انصرافك", s.early_minutes > 0 ? `خروج مبكر ${s.early_minutes} دقيقة` : undefined);
      await load();
    } catch (e) {
      Alert.alert("❌", e instanceof ApiError ? e.message : "تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) return <Loading />;

  const today = (data?.today ?? []).filter((r) => r.time_in);
  const open = [...today].reverse().find((r) => !r.time_out);
  const outs = today.map((r) => r.time_out).filter(Boolean).sort() as string[];
  const lastOut = outs[outs.length - 1];
  const worked = open?.time_in ? Math.max(0, now.minutes - toMin(open.time_in)) : 0;
  const b = badge(loc);
  const canPunch = loc.kind === "inside" || loc.kind === "remote";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), locate()]); setRefreshing(false); }} />}
    >
      <View style={[styles.big, { backgroundColor: t.c, borderColor: t.bd }]}>
        <Txt bold style={{ fontSize: 34, textAlign: "center", fontFamily: fonts.bold }}>{now.time}</Txt>
        <Txt muted style={{ textAlign: "center" }}>{now.date}</Txt>
      </View>

      <View style={[styles.badge, { backgroundColor: t.c, borderColor: t.bd }]}>
        <View style={[styles.dot, { backgroundColor: t[b.color] }]} />
        <Txt style={{ color: t[b.color], flexShrink: 1 }}>{b.text}</Txt>
      </View>
      {data && data.locations.some((l) => l.type === "remote") ? (
        <Txt muted style={{ textAlign: "center", fontSize: 11 }}>
          عن بعد: {data.remote_limit - data.remote_used} يوم متبقي من {data.remote_limit}
        </Txt>
      ) : null}
      <ErrorText message={error} />

      <Card title="حالة الحضور اليوم">
        {!today.length ? (
          <>
            <Status text="لم تسجل حضورك بعد" color={t.mu} bg={t.c2} />
            <Button title="📍 تسجيل الحضور" onPress={() => punch("in")} busy={busy} />
          </>
        ) : open ? (
          <>
            <Status
              text={`✅ حضور — ${today[0].time_in}${today.length > 1 ? ` (جلسة حالية من ${open.time_in})` : ""}`}
              color={t.gr}
              bg="rgba(41,179,94,.1)"
            />
            {lastOut && today.length > 1 ? <Txt muted style={styles.note}>رجعت للعمل بعد انصراف الساعة {lastOut}</Txt> : null}
            {open.location_name ? <Txt muted style={styles.note}>📍 {open.location_name}</Txt> : null}
            <Txt bold style={{ fontSize: 22, color: t.cy, textAlign: "center", paddingVertical: 10 }}>
              ⏱ {Math.floor(worked / 60)} ساعة {worked % 60} دقيقة
            </Txt>
            {data?.expected_checkout ? <Txt muted style={styles.note}>الانصراف المتوقع: {data.expected_checkout}</Txt> : null}
            <Button title="🚪 تسجيل الانصراف" kind="danger" onPress={() => punch("out")} busy={busy} />
          </>
        ) : (
          <>
            <Status text={`🚪 آخر انصراف — ${lastOut ?? ""}`} color={t.rd} bg="rgba(239,68,68,.08)" />
            <Txt muted style={styles.note}>
              انصرفت بالخطأ؟ تقدر ترجع تسجل حضور تاني، وبيتحسب انصرافك على آخر مرة بتسجل فيها انصراف.
            </Txt>
            <Button title="↩ رجوع للعمل — تسجيل حضور مرة أخرى" onPress={() => punch("in")} busy={busy} />
          </>
        )}
        <Pressable
          onPress={() => router.push({ pathname: "/leaves", params: { type: "forgot_punch" } })}
          style={[styles.forgot, { borderColor: t.bd }]}
        >
          <Txt muted style={{ fontSize: 12, textAlign: "center" }}>⚠️ نسيت البصمة</Txt>
        </Pressable>
        {!canPunch && loc.kind !== "loading" ? (
          <Txt muted style={[styles.note, { marginTop: 8 }]}>البصمة متاحة داخل نطاق موقع العمل فقط.</Txt>
        ) : null}
        {today.length > 1 ? (
          <Txt muted style={{ marginTop: 8, fontSize: 11 }}>
            جلسات اليوم: {today.map((r) => `${r.time_in} → ${r.time_out ?? "…"}`).join("  |  ")}
          </Txt>
        ) : null}
      </Card>

      <Card title="سجل آخر 31 يوم">
        <History rows={data?.history ?? []} />
      </Card>
    </ScrollView>
  );
}

function Status({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={[styles.status, { backgroundColor: bg }]}>
      <Txt bold style={{ color, textAlign: "center" }}>{text}</Txt>
    </View>
  );
}

// One line per day: first check-in → last check-out (×sessions), status of the first session (legacy V117).
function History({ rows }: { rows: MySession[] }) {
  const t = useTheme();
  const by = new Map<string, MySession[]>();
  for (const r of rows) if (r.time_in) by.set(r.work_date, [...(by.get(r.work_date) ?? []), r]);
  const dates = [...by.keys()].sort().reverse().slice(0, 31);
  if (!dates.length) return <Txt muted style={{ textAlign: "center", padding: 10 }}>لا يوجد سجل</Txt>;
  return (
    <>
      {dates.map((d) => {
        const rs = by.get(d)!.slice().sort((a, b) => String(a.time_in).localeCompare(String(b.time_in)));
        const last = rs[rs.length - 1];
        const st = rs[0].status;
        const color = st === "late" ? t.am : st === "present" ? t.gr : st === "remote" ? t.bl : t.mu;
        return (
          <View key={d} style={[styles.hist, { borderBottomColor: t.bd }]}>
            <Txt style={{ fontSize: 12 }}>{d}</Txt>
            <Txt style={{ fontSize: 12 }}>
              {rs[0].time_in} → {last.time_out ?? "…"}
              {rs.length > 1 ? ` (×${rs.length})` : ""}
            </Txt>
            <Txt style={{ fontSize: 12, color }}>{STATUS[st] ?? st}</Txt>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  big: { borderWidth: 1, borderRadius: 14, paddingVertical: 18, gap: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { borderRadius: 10, padding: 12, marginBottom: 10 },
  note: { fontSize: 11, textAlign: "center", marginBottom: 6, lineHeight: 18 },
  forgot: { borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8 },
  hist: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
});
