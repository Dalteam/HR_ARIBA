// One date / time picker for the whole app (replaces the OS pickers, which followed the device calendar —
// e.g. Hijri — and showed grey, unreadable time wheels in dark mode). Gregorian, Arabic labels, brand colours.
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { brand, useTheme } from "@/theme";
import { Icon } from "./icons";
import { T } from "./text";
import { shadow } from "@/lib/shadow";
import { select } from "@/lib/haptics";

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

const ROW = 44;   // height of one wheel row
const ROWS = 5;   // rows visible; the middle one is the selection

/** One scroll wheel: it snaps to a row and reports the row it settles on. */
function Wheel({ items, index, onChange, width }: { items: string[]; index: number; onChange: (i: number) => void; width: number }) {
  const t = useTheme();
  const ref = useRef<any>(null); // the ScrollView instance
  const last = useRef(index);
  const at = (y: number) => Math.max(0, Math.min(items.length - 1, Math.round(y / ROW)));
  useEffect(() => { ref.current?.scrollTo({ y: index * ROW, animated: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Commit the row the wheel stopped on and align it exactly (covers drags, flicks, mouse wheels and trackpads).
  const settle = (y: number) => {
    const i = at(y);
    if (Math.abs(y - i * ROW) > 1) ref.current?.scrollTo({ y: i * ROW, animated: true });
    if (i !== index) onChange(i);
  };
  return (
    <View style={{ width, height: ROW * ROWS }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y, i = at(y);
          if (i !== last.current) { last.current = i; select(); }
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => settle(y), 140);
        }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: ROW * Math.floor(ROWS / 2) }}
      >
        {items.map((label, i) => (
          <Pressable key={label} onPress={() => { ref.current?.scrollTo({ y: i * ROW, animated: true }); onChange(i); }} style={{ height: ROW, alignItems: "center", justifyContent: "center" }}>
            <T size={i === index ? 24 : 18} weight={i === index ? 800 : 500} color={i === index ? t.tx : t.mu}>{label}</T>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));
const PERIODS = ["ص", "م"];

/** On a phone / tablet: the system's own spinner (hour, minute, AM/PM wheels), which scrolls and snaps natively. */
type PickerEvent = { type?: string };
// Loaded only when the picker opens (a missing native module must not stop the whole app from starting); null = use the wheels.
function loadNativePicker(): any {
  try { return require("@react-native-community/datetimepicker").default; } catch { return null; }
}

function NativeTime(props: { title?: string; value: string; onPick: (v: string) => void; onDone: () => void }) {
  const Picker = useMemo(loadNativePicker, []);
  return Picker ? <NativeTimeView Picker={Picker} {...props} /> : <WheelTime {...props} />;
}

function NativeTimeView({ Picker: DateTimePicker, title, value, onPick, onDone }: { Picker: any; title?: string; value: string; onPick: (v: string) => void; onDone: () => void }) {
  const t = useTheme();
  const accent = t.dark ? brand.green : brand.dark;
  const [h, m] = (value || hhmm(new Date())).split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  const change = (e: PickerEvent, picked?: Date) => {
    if (Platform.OS === "android") { if (e.type === "set" && picked) onPick(hhmm(picked)); onDone(); return; } // Android shows its own dialog
    if (picked) onPick(hhmm(picked));
  };
  return (
    <View style={[styles.panel, { backgroundColor: t.c, borderColor: t.bd }]}>
      {title ? <T size={12} weight={700} color={t.mu} center style={{ marginBottom: 6 }}>{title}</T> : null}
      <DateTimePicker
        value={d} mode="time" display="spinner" is24Hour={false} locale="en-US"
        themeVariant={t.dark ? "dark" : "light"} textColor={t.tx} onChange={change}
        style={{ alignSelf: "center", height: 200, width: "100%" }}
      />
      <Pressable onPress={onDone} style={[styles.todayBtn, { borderColor: accent, backgroundColor: accent }]}>
        <T size={13} weight={800} color={t.dark ? brand.dark : "#fff"}>تم</T>
      </Pressable>
    </View>
  );
}

/** Time picker: system wheels on a device, three scroll wheels (hour 1-12, minute 00-59, AM/PM) on the web preview. The value stays "HH:MM" in 24 hours. */
export function TimeGrid(props: { title?: string; value: string; onPick: (v: string) => void; onDone: () => void }) {
  return Platform.OS === "web" ? <WheelTime {...props} /> : <NativeTime {...props} />;
}

function WheelTime({ title, value, onPick, onDone }: { title?: string; value: string; onPick: (v: string) => void; onDone: () => void }) {
  const t = useTheme();
  const accent = t.dark ? brand.green : brand.dark;
  const [h, m] = (value || hhmm(new Date())).split(":").map(Number);
  const pm = h >= 12;
  const hourIdx = (h % 12 || 12) - 1;
  const emit = (hour12: number, mm: number, isPm: boolean) => onPick(`${pad((hour12 % 12) + (isPm ? 12 : 0))}:${pad(mm)}`);
  return (
    <View style={[styles.panel, { backgroundColor: t.c, borderColor: t.bd }]}>
      {title ? <T size={12} weight={700} color={t.mu} center style={{ marginBottom: 6 }}>{title}</T> : null}
      <View style={{ direction: "ltr", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
        <View pointerEvents="none" style={[styles.band, { backgroundColor: t.c2 }]} />
        <Wheel items={HOURS} index={hourIdx} width={84} onChange={(i) => emit(i + 1, m, pm)} />
        <T size={24} weight={800} color={t.mu}>:</T>
        <Wheel items={MINUTES} index={m} width={84} onChange={(i) => emit(h % 12 || 12, i, pm)} />
        <Wheel items={PERIODS} index={pm ? 1 : 0} width={64} onChange={(i) => emit(h % 12 || 12, m, i === 1)} />
      </View>
      <Pressable onPress={onDone} style={[styles.todayBtn, { borderColor: accent, backgroundColor: accent }]}>
        <T size={13} weight={800} color={t.dark ? brand.dark : "#fff"}>تم</T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 12, ...shadow("#000", 0.18, 18, 0, 8, 8) },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingHorizontal: 4 },
  nav: { padding: 4 },
  row: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 3 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  todayBtn: { alignSelf: "center", marginTop: 8, borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip3: { flexBasis: "30%", flexGrow: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 12, alignItems: "center" },
  band: { position: "absolute", left: 0, right: 0, top: ROW * Math.floor(ROWS / 2), height: ROW, borderRadius: 12 },
  chip: { minWidth: 44, flexGrow: 1, flexBasis: "14%", borderWidth: 1, borderRadius: 9, paddingVertical: 8, alignItems: "center" },
});
