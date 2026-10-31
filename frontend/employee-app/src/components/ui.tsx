// Building blocks with the legacy employee app's final look (css/02-styles.css + V118 js/core-ui/030 overrides):
// .card, .card-title, .btn(-success|-danger|-primary), .b badges, label/input, .hr-pay-row, .profile-info, toast.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle, RefreshControl,
} from "react-native";
import { brand, fonts, useTheme } from "@/theme";
import { Icon, type IconName } from "./icons";
import { tap } from "@/lib/haptics";
import { inputAlign, tr, useLang } from "@/i18n";
import { MAX_FONT_SCALE, useLayout } from "@/lib/responsive";
import { Calendar, TimeGrid } from "./date-time";
import { T } from "./text";

export { T };
import { shadow } from "@/lib/shadow";

export function Page({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const t = useTheme();
  const L = useLayout();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: L.gutter, paddingBottom: 110, width: "100%", maxWidth: L.contentMax, alignSelf: "center" }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      refreshControl={onRefresh ? (
        <RefreshControl refreshing={refreshing} tintColor={t.bl} onRefresh={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }} />
      ) : undefined}
    >
      {children}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.c, borderColor: t.dark ? "rgba(255,255,255,.08)" : "rgba(1,77,61,.08)", ...shadow(t.dark ? "#000" : "#014D3D", 0.07, 12, 0, 8, 2) }, style]}>
      {children}
    </View>
  );
}

export function CardTitle({ children, icon }: { children: ReactNode; icon?: ReactNode | IconName }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 }}>
      {typeof icon === "string" ? <Icon name={icon} size={18} color={t.dark ? brand.green : brand.dark} stroke={2} /> : icon}
      <T size={14} weight={800}>{children}</T>
    </View>
  );
}

type BtnKind = "success" | "danger" | "primary" | "ghost" | "teal";
export function Btn({ title, onPress, kind = "primary", busy, disabled, icon, style }: {
  title: string; onPress: () => void; kind?: BtnKind; busy?: boolean; disabled?: boolean; icon?: ReactNode | IconName; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { success: t.gr, danger: t.rd, primary: "#29B35E", ghost: t.c2, teal: "#014D3D" }[kind];
  const fg = kind === "ghost" ? t.tx : kind === "primary" || (kind === "success" && t.dark) ? "#012A21" : "#fff";
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        kind === "ghost" && { borderWidth: 1, borderColor: t.bd, ...shadow("#000", 0, 0, 0, 0) }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <>{typeof icon === "string" ? <Icon name={icon} size={17} color={fg} stroke={2} /> : icon}<T size={13} weight={800} color={fg}>{title}</T></>}
    </Pressable>
  );
}

export function Badge({ text, tone }: { text: string; tone: "bg" | "br" | "ba" | "bk" }) {
  const t = useTheme();
  const map = { bg: ["rgba(16,185,129,.15)", t.dark ? "#5BD48A" : "#0F7A45"], br: ["rgba(239,68,68,.15)", t.dark ? "#FF8A7E" : "#B3342B"], ba: ["rgba(214,212,148,.35)", t.dark ? "#E4E4BC" : "#6F6410"], bk: ["rgba(100,116,139,.15)", t.mu] }[tone];
  return (
    <View style={{ backgroundColor: map[0], borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
      <T size={12} weight={600} color={map[1]}>{text}</T>
    </View>
  );
}

// .hr-pay-row (js/payroll/019): label in --mu, bold value; total / deduction / net variants.
export function PayRow({ label, value, kind }: { label: string; value: string; kind?: "total" | "ded" | "net" }) {
  const t = useTheme();
  const color = kind === "total" ? t.gr : kind === "ded" ? t.rd : kind === "net" ? t.cy : t.tx;
  return (
    <View style={[styles.payRow, { borderBottomColor: "rgba(36,48,68,.25)" },
      kind === "total" && { marginTop: 6, borderTopWidth: 1, borderTopColor: t.bd },
      kind === "net" && { borderBottomWidth: 0, marginTop: 4, paddingTop: 12 }]}>
      <T size={kind === "net" ? 16 : kind === "total" ? 13 : 12} weight={kind === "net" ? 800 : 500} color={kind === "net" ? t.tx : t.mu}>{label}</T>
      <T size={kind === "net" ? 17 : kind === "total" ? 13 : 12} weight={kind === "net" ? 800 : 700} color={color}>{kind === "ded" ? `- ${value}` : value}</T>
    </View>
  );
}

// .profile-info box.
export function InfoBox({ label, value }: { label: string; value?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexBasis: "48%", flexGrow: 1, padding: 10, borderWidth: 1, borderColor: t.bd, borderRadius: 10, backgroundColor: t.c2 }}>
      <T size={11.5} color={t.mu}>{label}</T>
      <T size={12} weight={700} style={{ marginTop: 3 }}>{value || "—"}</T>
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <T size={11} weight={600} color={t.mu} style={{ marginTop: 8, marginBottom: 4 }}>{children}</T>;
}

export function Input(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, placeholder, ...rest } = props;
  useLang();
  return (
    <View style={{ flex: 1 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholderTextColor={t.dm}
        placeholder={placeholder ? tr(placeholder) : placeholder}
        {...(props.multiline ? { returnKeyType: "done" as const, submitBehavior: "blurAndSubmit" as const } : null)}
        {...rest}
        style={[styles.input, { textAlign: inputAlign(), borderColor: t.bd, backgroundColor: t.c2, color: t.tx, fontFamily: fonts.medium }, props.multiline && { minHeight: 64, textAlignVertical: "top" }, style]}
      />
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Date / time field: tap fills today / now and opens the app's own calendar or time grid (components/date-time.tsx).
export function PickerField({ label, value, onChange, mode, maximumDate, placeholder }: {
  label?: string; value: string; onChange: (v: string) => void; mode: "date" | "time"; maximumDate?: Date; placeholder?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const toggle = () => {
    // First tap on an empty field fills today / now, so the picker opens on it.
    if (!open && !value) onChange(mode === "date" ? isoDate(new Date()) : hhmm(new Date()));
    setOpen((o) => !o);
  };
  return (
    <View style={{ flex: 1 }}>
      {label ? <Label>{label}</Label> : null}
      <Pressable onPress={toggle} onLayout={(e) => setNarrow(e.nativeEvent.layout.width < 130)} style={[styles.input, { borderColor: open ? (t.dark ? brand.green : brand.dark) : t.bd, backgroundColor: t.c2, flexDirection: "row", alignItems: "center", gap: 8 }]}>
        {narrow ? null : <Icon name={mode === "date" ? "calendar" : "clock"} size={17} color={t.dark ? brand.green : brand.dark} stroke={2} />}
        <T size={narrow ? 12 : 13} weight={600} color={value ? t.tx : t.dm} style={{ flex: 1 }} numberOfLines={1}>{value || placeholder || (mode === "date" ? "اختر التاريخ" : "اختر الوقت")}</T>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickOverlay} onPress={() => setOpen(false)}>
          <Pressable style={{ width: "100%", maxWidth: 360 }} onPress={() => {}}>
            {mode === "date"
              ? <Calendar title={label} value={value} maximumDate={maximumDate} onPick={(d) => { onChange(d); setOpen(false); }} />
              : <TimeGrid title={label} value={value} onPick={onChange} onDone={() => setOpen(false)} />}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
      <ActivityIndicator color={t.bl} />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  const t = useTheme();
  return <T center color={t.mu} style={{ padding: 18 }}>{text}</T>;
}

// White modal card of the legacy patches (forgot punch, change password): not themed, Tahoma-like look.
export function Sheet({ visible, onClose, children, scrollEnabled = true }: { visible: boolean; onClose: () => void; children: ReactNode; scrollEnabled?: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={Keyboard.dismiss}>
            <ScrollView scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{children}</ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --------------------------------------------------------------------------- toast (top, centred, 3 s)
type ToastKind = "ok" | "err" | "info";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const [msg, setMsg] = useState<{ text: string; kind: ToastKind } | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, kind: ToastKind = "info") => {
    setMsg({ text, kind });
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3000);
  }, [fade]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View style={[{ pointerEvents: "none" }, styles.toast, { opacity: fade, backgroundColor: t.c, borderColor: msg.kind === "err" ? t.rd : msg.kind === "ok" ? t.gr : t.bd }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {msg.kind !== "info" ? <Icon name={msg.kind === "err" ? "xCircle" : "checkCircle"} size={18} color={msg.kind === "err" ? t.rd : t.gr} stroke={2} /> : null}
            <T size={13} center style={{ flexShrink: 1 }}>{msg.text}</T>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 16, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth, ...shadow("#014D3D", 0.07, 12, 0, 8, 2) },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 16, marginTop: 10,
    ...shadow("#014D3D", 0.14, 8, 0, 6, 2) },
  payRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: 1 },
  input: { borderWidth: 1, borderRadius: 8, padding: 9, fontSize: 13, minHeight: 40, textAlign: "right" },
  pickOverlay: { flex: 1, backgroundColor: "rgba(1,32,26,.55)", alignItems: "center", justifyContent: "center", padding: 18 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,.72)", alignItems: "center", justifyContent: "center", padding: 16 },
  sheet: { backgroundColor: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 400, maxHeight: "92%" },
  toast: { position: "absolute", top: 54, alignSelf: "center", maxWidth: "90%", borderWidth: 1, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18,
    ...shadow("#000", 0.4, 10, 0, 4, 6) },
});
