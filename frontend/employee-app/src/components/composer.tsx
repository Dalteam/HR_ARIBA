// «+» in the dock: one bottom sheet for every request the app can send, in three steps (type → details → sent).
// The fields, the rules and the submit calls are the ones that used to live inline in the Leaves tab (their Leaves.jsx
// «إرسال طلب جديد»); nothing was dropped: all 18 request types, the attachment, the approval path, the upcoming holidays,
// the forgot-punch modal, and shortcuts to overtime / document upload / profile edit / IBAN change.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useInsets } from "@/lib/insets";
import { router } from "expo-router";
import { ForgotPunchSheet, todayISO } from "@/components/shared";
import { Btn, Input, PickerField, T, useToast } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { LeaveIcon, hasLeaveIcon } from "@/components/leave-icon";
import { HOURLY, TYPES } from "@/components/request-item";
import { ApiError, requests, type RequestType } from "@/lib/api";
import { pickFile, type Picked } from "@/lib/files";
import { calendarDays, submitRequest, workdays } from "@/lib/port";
import { useData } from "@/lib/data";
import { shadow } from "@/lib/shadow";
import { useTileWidth } from "@/lib/grid";
import { useLayout } from "@/lib/responsive";
import { error as hapticError, select, success, tap } from "@/lib/haptics";
import { useTheme } from "@/theme";

type Target = RequestType | "overtime" | "document" | "profile" | "iban";
const ICON: Record<string, IconName> = {
  annual: "calendar", sick: "clipboard", emergency: "alert", death: "calendar", marriage: "calendar", maternity: "calendar", paternity: "calendar",
  umrah: "calendar", hajj: "calendar", remote: "home", permission: "clock", maternity_permission: "clock", early_leave: "exit", unpaid: "calendar",
  salary_advance: "cash", advance: "cash", mission: "building", forgot_punch: "fingerprint", overtime: "stopwatch", document: "file", profile: "user", iban: "bank",
};
const LABEL = Object.fromEntries(TYPES) as Record<string, string>;
// grouped so the first screen reads as four short lists instead of one wall of 22 boxes
const GROUPS: { title: string; items: Target[] }[] = [
  { title: "إجازات", items: ["annual", "sick", "emergency", "remote", "unpaid", "mission", "marriage", "death", "maternity", "paternity", "umrah", "hajj"] },
  { title: "استئذان وبصمة", items: ["permission", "early_leave", "maternity_permission", "forgot_punch", "overtime"] },
  { title: "مالية", items: ["advance", "salary_advance"] },
  { title: "ملفي", items: ["document", "profile", "iban"] },
];
const EXTRA_LABEL: Record<string, string> = { overtime: "عمل إضافي", document: "رفع مستند", profile: "تعديل بياناتي", iban: "تغيير الآيبان" };
const nameOf = (k: string) => LABEL[k] ?? EXTRA_LABEL[k] ?? k;

const Ctx = createContext<{ open: (type?: Target) => void }>({ open: () => {} });
export const useComposer = () => useContext(Ctx);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [first, setFirst] = useState<RequestType | null>(null);
  const [forgot, setForgot] = useState(false);
  const open = useCallback((type?: Target) => {
    if (type === "forgot_punch") return setForgot(true);
    if (type === "overtime") return router.navigate("/(tabs)/overtime" as never);
    if (type === "document") return router.push("/upload-document" as never);
    if (type === "profile") return router.push("/profile-edit" as never);
    if (type === "iban") return router.push("/iban-change" as never);
    setFirst((type as RequestType) ?? null);
    setVisible(true);
  }, []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <ComposerSheet visible={visible} first={first} onClose={() => setVisible(false)} onForgot={() => { setVisible(false); setForgot(true); }} />
      <ForgotPunchSheet visible={forgot} onClose={() => setForgot(false)} />
    </Ctx.Provider>
  );
}

function ComposerSheet({ visible, first, onClose, onForgot }: { visible: boolean; first: RequestType | null; onClose: () => void; onForgot: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const insets = useInsets();
  const { height } = useWindowDimensions();
  const { leave, refresh } = useData();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [type, setType] = useState<RequestType>("annual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [dur, setDur] = useState("1");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<Picked | null>(null);
  const [shown, setShown] = useState(false);
  const y = useRef(new Animated.Value(height)).current;
  const L = useLayout();
  const grid = useTileWidth(L.cols, 8);
  const twoStage = type === "unpaid" || type === "salary_advance";
  const today = todayISO();
  const upcoming = (leave?.upcoming_holidays ?? []).filter((h) => h.date >= today).slice(0, 4);
  // Stage A2: the whole announced calendar when the API sends it, the four upcoming rows otherwise.
  const announced = leave?.holidays ?? leave?.upcoming_holidays ?? [];

  const slide = useCallback((to: number, done?: () => void) => {
    Animated.timing(y, { toValue: to, duration: to === 0 ? 420 : 260, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start(done);
  }, [y]);

  useEffect(() => {
    if (visible) {
      setStep(first ? 1 : 0); if (first) setType(first);
      setFrom(""); setTo(""); setDate(todayISO()); setTime(""); setDur("1"); setAmount(""); setNotes(""); setFile(null);
      y.setValue(height); setShown(true); requestAnimationFrame(() => slide(0));
    } else if (shown) {
      slide(height, () => setShown(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // drag the handle down: the sheet follows the finger 1:1, and a quick flick closes it even when it has not travelled far
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => { if (g.vy > 0.5 || g.dy > 140) onClose(); else slide(0); },
  })).current;

  function pickType(k: Target) {
    select();
    if (k === "forgot_punch") return onForgot();
    if (k === "overtime" || k === "document" || k === "profile" || k === "iban") { onClose(); return setTimeout(() => router.navigate(k === "overtime" ? "/(tabs)/overtime" as never : k === "document" ? "/upload-document" as never : k === "profile" ? "/profile-edit" as never : "/iban-change" as never), 250); }
    setType(k as RequestType); setStep(1);
  }

  async function attach() {
    try { setFile(await pickFile()); } catch (e) { toast(e instanceof Error ? e.message : "تعذر قراءة المرفق", "err"); }
  }

  async function submit() {
    const n = notes.trim() || undefined;
    let body: Parameters<typeof requests.submit>[0] | null = null;
    let port: Record<string, unknown> | null = null;
    const bad = (m: string) => { hapticError(); toast(m, "err"); };
    if (type === "advance" || type === "salary_advance") {
      if (!(Number(amount) > 0)) return bad("أدخل مبلغ السلفة");
      if (type === "salary_advance" && !n) return bad("اكتب سبب طلب الراتب المقدم");
      if (type === "salary_advance") port = { amount: Number(amount), notes: n };
      else body = { type, amount: String(Number(amount)), notes: n };
    } else if (HOURLY.includes(type)) {
      if (!date || !time) return bad("حدد التاريخ والوقت");
      body = { type, on_date: date, time_from: time, hours: String(Number(dur) || 1), notes: n };
    } else {
      if (!from || !to || to < from) return bad("حدد الفترة بشكل صحيح");
      if (type === "unpaid" && !n) return bad("اكتب سبب الإجازة بدون راتب");
      if (type === "annual" && leave && leave.current <= 0) return bad("يتجاوز الرصيد المتاح");
      if (type === "unpaid") port = { from, to, days: calendarDays(from, to), notes: n };
      else body = { type, from_date: from, to_date: to, notes: n };
    }
    setBusy(true);
    try {
      // their submit sends the payload and the attachment together (ariba_submit_request)
      if (port || file) await submitRequest(type, port ?? toPayload(body!), file);
      else await requests.submit(body!);
      success();
      setStep(2);
      refresh();
    } catch (e) {
      hapticError();
      toast(e instanceof ApiError ? e.message : "تعذر إرسال الطلب", "err");
    } finally {
      setBusy(false);
    }
  }

  // Annual leave is counted in workdays (Sunday–Thursday, official holidays out) exactly like the API request_days,
  // so «سيتبقى» can no longer promise a balance the server then refuses; every other type stays calendar days.
  const span = from && to && to >= from ? calendarDays(from, to) : 0;
  const days = type === "annual" ? (from && to && to >= from ? workdays(from, to, announced) : 0) : span;
  const after = type === "annual" && leave ? Math.round((leave.current - days) * 100) / 100 : null;

  if (!shown && !visible) return null;
  return (
    <Modal visible={shown || visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق">
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(1,26,21,.55)", opacity: y.interpolate({ inputRange: [0, height], outputRange: [1, 0], extrapolate: "clamp" }) }]} />
        </Pressable>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", pointerEvents: "box-none" }}>
          <Animated.View style={[styles.sheet, { backgroundColor: t.c, width: "100%", maxWidth: L.sheetMax, paddingBottom: Math.max(16, insets.bottom), maxHeight: height * 0.9, transform: [{ translateY: y }] }]}>
            <View {...pan.panHandlers} style={styles.grab} accessibilityLabel="اسحب للأسفل للإغلاق"><View style={[styles.grabBar, { backgroundColor: t.bd }]} /></View>
            <View style={styles.head}>
              {step === 1 ? (
                <Pressable onPress={() => { tap(); setStep(0); }} accessibilityLabel="رجوع" style={[styles.round, { backgroundColor: t.c2 }]}><Icon name="chevronRight" size={18} color={t.tx} /></Pressable>
              ) : null}
              <T size={20} weight={800} style={{ flex: 1, letterSpacing: -0.3 }}>{step === 0 ? "ماذا تريد أن تطلب؟" : step === 1 ? nameOf(type) : "تم"}</T>
              <Pressable onPress={onClose} accessibilityLabel="إغلاق" style={[styles.round, { backgroundColor: t.c2 }]}><Icon name="x" size={18} color={t.tx} /></Pressable>
            </View>
            <View style={styles.prog}>{[0, 1, 2].map((i) => <View key={i} style={[styles.progBar, { backgroundColor: i <= step ? "#29B35E" : t.bd }]} />)}</View>

            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 6 }} onScrollBeginDrag={Keyboard.dismiss}>
              {step === 0 ? GROUPS.map((g) => (
                <View key={g.title} style={{ marginBottom: 14 }}>
                  <T size={12} weight={700} color={t.mu} style={{ marginBottom: 8 }}>{g.title}</T>
                  <View style={styles.types} onLayout={grid.onLayout}>
                    {g.items.map((k) => (
                      <Pressable key={k} onPress={() => pickType(k)} accessibilityRole="button" accessibilityLabel={nameOf(k)}
                        style={({ pressed }) => [styles.type, grid.tile ? { width: grid.tile } : null, { backgroundColor: t.c2, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                        <View style={[styles.typeIc, { backgroundColor: t.c }]}>{hasLeaveIcon(k) ? <LeaveIcon type={k} size={34} color={t.dark ? "#29B35E" : "#014D3D"} /> : <Icon name={ICON[k] ?? "file"} size={20} color={t.dark ? "#29B35E" : "#014D3D"} />}</View>
                        <T size={12} weight={700} center numberOfLines={2}>{nameOf(k)}</T>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )) : null}

              {step === 1 ? (
                <View>
                  {upcoming.length ? (
                    <View style={[styles.note, { backgroundColor: t.c2 }]}>
                      <T size={12} weight={800} color={t.bl} style={{ marginBottom: 4 }}>إجازات رسمية قادمة</T>
                      {upcoming.map((h, i) => (
                        <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                          <T size={12}>{h.name}</T><T size={12} color={t.mu}>{`${h.date}${h.days ? ` (${h.days} يوم)` : ""}`}</T>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {type === "advance" || type === "salary_advance" ? (
                    <Input label="المبلغ بالريال" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                  ) : HOURLY.includes(type) ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <PickerField label="التاريخ" value={date} onChange={setDate} mode="date" />
                      <PickerField label="الوقت" value={time} onChange={setTime} mode="time" />
                      <Input label="المدة (س)" value={dur} onChangeText={setDur} keyboardType="decimal-pad" />
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <PickerField label="من تاريخ" value={from} onChange={setFrom} mode="date" />
                      <PickerField label="إلى تاريخ" value={to} onChange={setTo} mode="date" />
                    </View>
                  )}
                  {type === "annual" && leave ? (
                    <View style={[styles.calc, { backgroundColor: "rgba(214,212,148,.35)" }]}>
                      <T size={12.5} weight={600} color={t.dark ? "#E4E4BC" : "#6F6410"}>{`المتاح لك ${leave.current}`}</T>
                      {from && to && to >= from ? <T size={11.5} color={t.mu}>{`المدة المحتسبة ${days} يوم عمل`}</T> : null}
                      {from && to && to >= from ? <T size={11} color={t.mu}>بدون الجمعة والسبت والإجازات الرسمية</T> : null}
                      {after != null && days > 0 ? <T size={12.5} weight={700} color={after < 0 ? t.rd : t.dark ? "#E4E4BC" : "#6F6410"}>{`سيتبقى ${after}`}</T> : null}
                    </View>
                  ) : null}
                  <Input label={twoStage ? "السبب" : "ملاحظات"} value={notes} onChangeText={setNotes} placeholder={twoStage ? "مطلوب" : "اختياري"} multiline />
                  <Btn kind="ghost" title={file ? `📎 ${file.name}` : "📎 مرفق الطلب (اختياري)"} onPress={file ? () => setFile(null) : attach} style={{ marginTop: 8 }} />
                  <T size={11} color={t.mu} style={{ marginTop: 4 }}>يمكن إرسال الطلب بدون مرفق. الحد الأقصى 12 MB.{file ? " — اضغط لإزالته" : ""}</T>
                </View>
              ) : null}

              {step === 2 ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <View style={styles.okMark}><Icon name="check" size={40} color="#012A21" stroke={2.4} /></View>
                  <T size={19} weight={800} style={{ marginTop: 14 }}>أُرسل طلبك</T>
                  <T size={12.5} color={t.mu} center style={{ marginTop: 4 }}>{twoStage ? "بانتظار المدير المباشر، ثم الموارد البشرية" : "بانتظار الاعتماد · ستصلك النتيجة في إشعاراتك"}</T>
                </View>
              ) : null}
            </ScrollView>

            {step === 1 ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                <T size={11.5} color={t.mu} style={{ marginBottom: 6 }}>
                  {twoStage ? "المسار: المدير المباشر ← الموارد البشرية (اعتماد نهائي). يصلك إشعار وإيميل عند كل خطوة." : "المسار: المدير المباشر ← الموارد البشرية ← الرئيس التنفيذي."}
                </T>
                <Btn kind="primary" title="أرسل الطلب" icon={<Icon name="send" size={16} color="#012A21" />} onPress={submit} busy={busy} style={{ marginTop: 0 }} />
              </View>
            ) : null}
            {step === 2 ? <View style={{ paddingHorizontal: 20 }}><Btn kind="ghost" title="تم" onPress={onClose} style={{ marginTop: 4 }} /></View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Our NewRequest fields → their payload names (when the request goes with an attachment). */
function toPayload(b: Parameters<typeof requests.submit>[0]): Record<string, unknown> {
  return { from: b.from_date, to: b.to_date, date: b.on_date, time: b.time_from, dur: b.hours ? Number(b.hours) : undefined,
    amount: b.amount ? Number(b.amount) : undefined, notes: b.notes };
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, ...shadow("#000", 0.35, 25, 0, -10, 20) },
  grab: { alignItems: "center", paddingTop: 10, paddingBottom: 8 },
  grabBar: { width: 40, height: 5, borderRadius: 3 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingBottom: 10 },
  round: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  prog: { flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingBottom: 12 },
  progBar: { flex: 1, height: 4, borderRadius: 2 },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  type: { width: "31.6%", alignItems: "center", gap: 7, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 18, minHeight: 88 },
  typeIc: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  note: { padding: 10, borderRadius: 14, marginBottom: 12 },
  calc: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, marginTop: 10 },
  okMark: { width: 84, height: 84, borderRadius: 26, backgroundColor: "#29B35E", alignItems: "center", justifyContent: "center", transform: [{ skewX: "-8deg" }] },
});
