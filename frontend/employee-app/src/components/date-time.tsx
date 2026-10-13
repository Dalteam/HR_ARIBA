// One date / time picker for the whole app (replaces the OS pickers, which followed the device calendar —
// e.g. Hijri — and showed grey, unreadable time wheels in dark mode). Gregorian, Arabic labels, brand colours.
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { brand, useTheme } from "@/theme";
import { Icon } from "./icons";
import { T } from "./ui";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]; // Sunday first
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Month grid (week starts Sunday, laid out right-to-left by the app's RTL). Tap the header for years, then months. */
export function Calendar({ title, value, onPick, maximumDate }: { title?: string; value: string; onPick: (iso: string) => void; maximumDate?: Date }) {
  const t = useTheme();
  const today = isoDate(new Date());
  const sel = value || today;
  const [view, setView] = useState(() => ({ y: Number(sel.slice(0, 4)), m: Number(sel.slice(5, 7)) - 1 }));
  const [mode, setMode] = useState<"days" | "years" | "months">("days");
  const [page, setPage] = useState(() => Number(sel.slice(0, 4)) - 7);
  const max = maximumDate ? isoDate(maximumDate) : null;
  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const move = (n: number) => {
    if (mode === "years") return setPage((p) => p + n * 12);
    if (mode === "months") return setView(({ y, m }) => ({ y: y + n, m }));
    setView(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  };
  const accent = t.dark ? brand.green : brand.dark;
  const head = mode === "years" ? `${page} – ${page + 11}` : mode === "months" ? String(view.y) : `${MONTHS[view.m]} ${view.y}`;
  const chip = (label: string, on: boolean, press: () => void, key: string | number) => (
    <Pressable key={key} onPress={press} style={[styles.chip3, { borderColor: on ? accent : t.bd, backgroundColor: on ? accent : t.c2 }]}>
      <T size={13} weight={on ? 800 : 600} color={on ? (t.dark ? brand.dark : "#fff") : t.tx} center>{label}</T>
    </Pressable>
  );

  return (
    <View style={[styles.panel, { backgroundColor: t.c, borderColor: t.bd }]}>
      {title ? <T size={11} weight={700} color={t.mu} center style={{ marginBottom: 4 }}>{title}</T> : null}
      <View style={styles.head}>
        <Pressable onPress={() => move(-1)} hitSlop={10} style={styles.nav}><Icon name="chevronRight" size={20} color={accent} stroke={2.2} /></Pressable>
        <Pressable onPress={() => { setPage(view.y - 7); setMode(mode === "days" ? "years" : "days"); }} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <T size={14} weight={800}>{head}</T>
          <Icon name={mode === "days" ? "chevronDown" : "chevronUp"} size={15} color={accent} stroke={2.2} />
        </Pressable>
        <Pressable onPress={() => move(1)} hitSlop={10} style={styles.nav}><Icon name="chevronLeft" size={20} color={accent} stroke={2.2} /></Pressable>
      </View>
      {mode === "years" ? (
        <View style={styles.grid}>{Array.from({ length: 12 }, (_, i) => page + i).map((y) => chip(String(y), y === view.y, () => { setView((v) => ({ ...v, y })); setMode("months"); }, y))}</View>
      ) : mode === "months" ? (
        <View style={styles.grid}>{MONTHS.map((n, i) => chip(n, i === view.m, () => { setView((v) => ({ ...v, m: i })); setMode("days"); }, n))}</View>
      ) : (
        <>
          <View style={styles.row}>
            {DAYS.map((d) => <T key={d} size={9.5} weight={700} color={t.mu} center style={styles.cell}>{d}</T>)}
          </View>
          {Array.from({ length: cells.length / 7 }, (_, r) => (
            <View key={r} style={styles.row}>
              {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
                if (!d) return <View key={i} style={styles.cell} />;
                const iso = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
                const on = iso === sel;
                const off = max !== null && iso > max;
                return (
                  <Pressable key={i} disabled={off} onPress={() => onPick(iso)} style={styles.cell}>
                    <View style={[styles.day, on && { backgroundColor: accent }, !on && iso === today && { borderWidth: 1.5, borderColor: accent }]}>
                      <T size={13} weight={on ? 800 : 600} color={on ? (t.dark ? brand.dark : "#fff") : off ? t.bd : t.tx}>{d}</T>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </>
      )}
      <Pressable onPress={() => { setView({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); setMode("days"); onPick(today); }} style={[styles.todayBtn, { borderColor: accent }]}>
        <T size={12} weight={800} color={accent}>اليوم</T>
      </Pressable>
    </View>
  );
}

/** Hour and minute buttons; the minute grid is in 5-minute steps with ±1 fine-tuning. */
export function TimeGrid({ title, value, onPick, onDone }: { title?: string; value: string; onPick: (v: string) => void; onDone: () => void }) {
  const t = useTheme();
  const accent = t.dark ? brand.green : brand.dark;
  const [h, m] = (value || hhmm(new Date())).split(":").map(Number);
  const set = (hh: number, mm: number) => onPick(`${pad((hh + 24) % 24)}:${pad((mm + 60) % 60)}`);
  const chip = (label: string, on: boolean, press: () => void, key: string | number) => (
    <Pressable key={key} onPress={press} style={[styles.chip, { borderColor: on ? accent : t.bd, backgroundColor: on ? accent : t.c2 }]}>
      <T size={13} weight={on ? 800 : 600} color={on ? (t.dark ? brand.dark : "#fff") : t.tx} center>{label}</T>
    </Pressable>
  );
  return (
    <View style={[styles.panel, { backgroundColor: t.c, borderColor: t.bd }]}>
      {title ? <T size={11} weight={700} color={t.mu} center>{title}</T> : null}
      <T size={26} weight={900} color={accent} center>{`${pad(h)}:${pad(m)}`}</T>
      <T size={11} color={t.mu} center style={{ marginTop: -4, marginBottom: 6 }}>{`${h % 12 || 12}:${pad(m)} ${h < 12 ? "صباحاً" : "مساءً"}`}</T>
      <T size={11} weight={700} color={t.mu} style={{ marginBottom: 4 }}>الساعة</T>
      <View style={styles.grid}>{Array.from({ length: 24 }, (_, i) => chip(pad(i), i === h, () => set(i, m), i))}</View>
      <T size={11} weight={700} color={t.mu} style={{ marginTop: 8, marginBottom: 4 }}>الدقيقة</T>
      <View style={styles.grid}>{Array.from({ length: 12 }, (_, i) => chip(pad(i * 5), i * 5 === m, () => set(h, i * 5), i))}</View>
      <View style={[styles.row, { gap: 8, marginTop: 8 }]}>
        {chip("− دقيقة", false, () => set(h, m - 1), "minus")}
        {chip("+ دقيقة", false, () => set(h, m + 1), "plus")}
      </View>
      <Pressable onPress={onDone} style={[styles.todayBtn, { borderColor: accent, backgroundColor: accent }]}>
        <T size={12} weight={800} color={t.dark ? brand.dark : "#fff"}>تم</T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 12, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingHorizontal: 4 },
  nav: { padding: 4 },
  row: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 3 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  todayBtn: { alignSelf: "center", marginTop: 8, borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip3: { flexBasis: "30%", flexGrow: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 12, alignItems: "center" },
  chip: { minWidth: 44, flexGrow: 1, flexBasis: "14%", borderWidth: 1, borderRadius: 9, paddingVertical: 8, alignItems: "center" },
});
