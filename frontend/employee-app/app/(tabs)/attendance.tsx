// الحضور — legacy main/08 (att-big, loc-badge) + V117 028 (حالة الحضور اليوم، رجوع للعمل، سجل آخر 31 يوم)
// + V122b 034 (location text) + 022 (استعلام عن حضور بفترة محددة).
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ForgotPunchSheet, todayISO } from "@/components/shared";
import { Icon, type IconName } from "@/components/icons";
import { Btn, Card, CardTitle, Empty, isoDate, Page, PickerField, T } from "@/components/ui";
import { attendance, type MySession } from "@/lib/api";
import { useData } from "@/lib/data";
import { distanceText } from "@/lib/geo";
import { todaySessions, usePunch } from "@/lib/punch";
import { useTheme } from "@/theme";

const STATUS: Record<string, string> = { present: "حاضر", late: "متأخر", remote: "عن بعد", absent: "غائب", leave: "إجازة" };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Status({ text, kind, icon }: { text: string; kind: "in" | "none"; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, padding: 10, marginVertical: 8, backgroundColor: kind === "in" ? "rgba(41,179,94,.1)" : "rgba(65,64,66,.08)" }}>
      {icon ? <Icon name={icon} size={16} color={kind === "in" ? t.gr : t.mu} stroke={2} /> : null}
      <T size={13} center color={kind === "in" ? t.gr : t.mu}>{text}</T>
    </View>
  );
}

function hours(r: MySession) {
  if (!r.time_in || !r.time_out) return "";
  const m = Number(r.time_out.slice(0, 2)) * 60 + Number(r.time_out.slice(3, 5)) - (Number(r.time_in.slice(0, 2)) * 60 + Number(r.time_in.slice(3, 5)));
  return `${(Math.max(0, m) / 60).toFixed(1)} س`;
}

export default function Attendance() {
  const t = useTheme();
  const now = useClock();
  const { att, refresh } = useData();
  const { loc, punch, busy } = usePunch();
  const [forgot, setForgot] = useState(false);
  const { rows, open, lastOut } = todaySessions(att);
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(todayISO());
  const [found, setFound] = useState<MySession[] | null>(null);
  const [searching, setSearching] = useState(false);

  const time = now.toLocaleTimeString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const badge = (() => {
    switch (loc.kind) {
      case "inside": return { icon: "pin" as const, dot: t.gr, text: loc.name, color: t.gr };
      case "outside": return { icon: "xCircle" as const, dot: t.rd, text: `خارج النطاق — أقرب موقع ${loc.name} (${distanceText(loc.distance)})`, color: t.rd };
      case "none": return { icon: "alert" as const, dot: t.am, text: "لا يوجد موقع عمل", color: t.am };
      case "unset": return { icon: "alert" as const, dot: t.am, text: "إحداثيات موقع عملك غير مضبوطة", color: t.am };
      case "denied": return { icon: "xCircle" as const, dot: t.rd, text: "فعّل صلاحية الموقع", color: t.rd };
      case "error": return { icon: "xCircle" as const, dot: t.rd, text: "تعذر تحديد الموقع", color: t.rd };
      default: return { icon: "pin" as const, dot: t.mu, text: "جاري تحديد الموقع...", color: t.mu };
    }
  })();

  // Last 31 days: one line per day — first check-in → last check-out (×sessions), status of the first session.
  const byDay = new Map<string, MySession[]>();
  for (const r of att?.history ?? []) if (r.time_in) byDay.set(r.work_date, [...(byDay.get(r.work_date) ?? []), r]);
  const days = [...byDay.keys()].sort().reverse().slice(0, 31);

  async function search() {
    setSearching(true);
    try {
      setFound(await attendance.range(from, to));
    } catch {
      setFound([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Page onRefresh={refresh}>
      <View style={{ alignItems: "center", paddingVertical: 20 }}>
        <T size={40} weight={900} color={t.cy}>{time}</T>
        <T size={12} color={t.mu} style={{ marginTop: 4 }}>{date}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: t.c2, borderRadius: 10, marginBottom: 10 }}>
        <Icon name={badge.icon} size={16} color={badge.dot} stroke={2} />
        <T size={12} color={badge.color} style={{ flexShrink: 1 }}>{badge.text}</T>
      </View>

      <Card>
        <CardTitle icon="fingerprint">حالة الحضور اليوم</CardTitle>
        {!rows.length ? (
          <>
            <Status kind="none" text="لم تسجل حضورك بعد" />
            <Btn kind="success" title="تسجيل الحضور" icon="login" onPress={() => punch("in")} busy={busy} />
          </>
        ) : open ? (
          <>
            <Status kind="in" icon="checkCircle" text={`حضور — ${rows[0].time_in}${rows.length > 1 ? ` (جلسة حالية من ${open.time_in})` : ""}`} />
            {lastOut && rows.length > 1 ? <T size={11} color={t.mu} center style={{ marginVertical: 4 }}>رجعت للعمل بعد انصراف الساعة {lastOut}</T> : null}
            <Btn kind="danger" title="تسجيل الانصراف" icon="logout" onPress={() => punch("out")} busy={busy} />
          </>
        ) : (
          <>
            <Status kind="in" icon="logout" text={`آخر انصراف — ${lastOut ?? ""}`} />
            <Btn kind="success" title="رجوع للعمل — تسجيل حضور مرة أخرى" icon="back" onPress={() => punch("in")} busy={busy} />
          </>
        )}
        {rows.length > 1 ? (
          <T size={11} color={t.mu} style={{ marginTop: 8 }}>جلسات اليوم: {rows.map((r) => `${r.time_in} → ${r.time_out ?? "…"}`).join("  |  ")}</T>
        ) : null}
        <Btn kind="ghost" title="نسيت البصمة" icon="alert" onPress={() => setForgot(true)} style={{ marginTop: 8, paddingVertical: 8 }} />
      </Card>

      <Card>
        <CardTitle icon="calendar">سجل آخر 31 يوم</CardTitle>
        {!days.length ? <Empty text="لا يوجد سجل" /> : null}
        {days.map((d) => {
          const rs = byDay.get(d)!.slice().sort((a, b) => String(a.time_in).localeCompare(String(b.time_in)));
          const last = rs[rs.length - 1];
          return (
            <View key={d} style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.bd }}>
              <T size={11}>{d}</T>
              <T size={11}>{`${rs[0].time_in} → ${last.time_out ?? "…"}${rs.length > 1 ? ` (×${rs.length})` : ""}`}</T>
              <T size={11}>{STATUS[rs[0].status] ?? rs[0].status}</T>
            </View>
          );
        })}
      </Card>

      <Card>
        <CardTitle icon="search">استعلام عن حضور بفترة محددة</CardTitle>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PickerField label="من" value={from} onChange={setFrom} mode="date" />
          <PickerField label="إلى" value={to} onChange={setTo} mode="date" />
        </View>
        <Btn kind="success" title="بحث" onPress={search} busy={searching} />
        {found && !found.length ? <Empty text="لا يوجد سجل" /> : null}
        {(found ?? []).map((r) => (
          <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.bd }}>
            <T size={11}>{r.work_date}</T>
            <T size={11}>{`${r.time_in ?? "—"} → ${r.time_out ?? "—"}`}</T>
            <T size={11}>{hours(r)}</T>
            <T size={11} color={r.status === "late" ? "#B54A4A" : "#1F8D49"}>{r.status === "late" ? "متأخر" : "حاضر"}</T>
          </View>
        ))}
      </Card>
      <ForgotPunchSheet visible={forgot} onClose={() => setForgot(false)} />
    </Page>
  );
}
