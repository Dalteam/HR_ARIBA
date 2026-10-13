// Pieces used on several tabs: forgot-punch modal (legacy requests/027), «جهة العمل ومواقع العمل» card (locations/033),
// money / date formatting.
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Btn, Card, CardTitle, isoDate, PickerField, Sheet, T, useToast } from "./ui";
import { Icon } from "./icons";
import { ApiError, requests } from "@/lib/api";
import { useData } from "@/lib/data";
import { haversine } from "@/lib/geo";
import { usePunch } from "@/lib/punch";
import { fonts, useTheme } from "@/theme";

export const sar = (v: unknown) => `${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
export const dmy = (v: string | null | undefined) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "—");
export const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

export function ForgotPunchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const { refresh } = useData();
  const [kind, setKind] = useState<"in" | "out" | "both">("in");
  const [date, setDate] = useState(todayISO());
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(null);
    if (!date) return setErr("اختر التاريخ");
    if (date > todayISO()) return setErr("لا يمكن اختيار تاريخ في المستقبل");
    if (!t1) return setErr("اختر الوقت");
    if (kind === "both") {
      if (!t2) return setErr("اختر وقت الخروج");
      if (t2 <= t1) return setErr("وقت الخروج لازم يكون بعد وقت الدخول");
    }
    if (!notes.trim()) return setErr("اكتب السبب");
    setBusy(true);
    try {
      await requests.submit({ type: "forgot_punch", punch_kind: kind, on_date: date, time_from: t1, time_to: kind === "both" ? t2 : undefined, notes: notes.trim() });
      toast("تم إرسال الطلب — بانتظار الموارد البشرية", "ok");
      setT1(""); setT2(""); setNotes("");
      onClose();
      refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "حصلت مشكلة");
    } finally {
      setBusy(false);
    }
  }

  const kinds: [typeof kind, string][] = [["in", "دخول"], ["out", "خروج"], ["both", "دخول وخروج"]];
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Icon name="fingerprint" size={19} color="#014D3D" stroke={2} />
        <T size={17} weight={700} color="#111">نسيان بصمة</T>
      </View>
      <T size={12.5} color="#555" style={{ lineHeight: 21, marginBottom: 10 }}>
        اختر نوع البصمة اللي نسيتها والتاريخ والوقت واكتب السبب. الطلب بيروح للموارد البشرية مباشرة، ولما يوافقوا بيتسجل الحضور/الانصراف في سجلك.
      </T>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
        {kinds.map(([k, label]) => {
          const on = k === kind;
          return (
            <Pressable key={k} onPress={() => setKind(k)} style={{ flex: 1, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 8, borderWidth: 2, borderColor: on ? "#014D3D" : "#ddd", backgroundColor: on ? "#ecfdf5" : "#f9fafb" }}>
              <T size={13} weight={on ? 700 : 500} color="#111" center>{label}</T>
            </Pressable>
          );
        })}
      </View>
      <PickerField label="التاريخ" value={date} onChange={setDate} mode="date" maximumDate={new Date()} />
      <PickerField label={kind === "out" ? "وقت الخروج" : "وقت الدخول"} value={t1} onChange={setT1} mode="time" />
      {kind === "both" ? <PickerField label="وقت الخروج" value={t2} onChange={setT2} mode="time" /> : null}
      <T size={12} color="#444" style={{ marginTop: 6, marginBottom: 3 }}>السبب (مطلوب)</T>
      <TextInput value={notes} onChangeText={setNotes} multiline returnKeyType="done" submitBehavior="blurAndSubmit" placeholder="اكتب سبب نسيان البصمة" placeholderTextColor="#999"
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, minHeight: 70, fontSize: 14, color: "#111", backgroundColor: "#fff", textAlign: "right", textAlignVertical: "top", fontFamily: fonts.medium }} />
      {err ? <T size={12.5} color="#B54A4A" style={{ marginTop: 8 }}>{err}</T> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn title="إرسال الطلب" kind="teal" onPress={send} busy={busy} style={{ flex: 1, borderRadius: 8 }} />
        <Btn title="إلغاء" kind="ghost" onPress={onClose} style={{ borderRadius: 8, backgroundColor: "#f3f4f6", borderColor: "#ccc" }} />
      </View>
    </Sheet>
  );
}

export function LocationsCard() {
  const t = useTheme();
  const { employee, att } = useData();
  const { fix } = usePunch();
  const locs = (att?.locations ?? []).filter((l) => l.type !== "remote");
  return (
    <Card>
      <CardTitle icon="pin">جهة العمل ومواقع العمل</CardTitle>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <T size={12} color={t.mu}>جهة العمل:</T>
        <T size={13} weight={700}>{employee?.workplace?.name_ar ?? "—"}</T>
      </View>
      {!locs.length ? <T size={11} color={t.mu}>لا يوجد موقع عمل</T> : null}
      {locs.map((l, i) => {
        const zero = Number(l.latitude) === 0 && Number(l.longitude) === 0;
        let st = { txt: `نصف القطر ${l.radius_m || 200} م`, color: t.mu };
        if (zero) st = { txt: "إحداثيات غير مضبوطة", color: "#B54A4A" };
        else if (fix) {
          const d = haversine(fix, Number(l.latitude), Number(l.longitude));
          st = d <= (l.radius_m || 200) ? { txt: "داخل النطاق", color: "#1F8D49" } : { txt: d >= 1000 ? `${(d / 1000).toFixed(1)} كم` : `${Math.round(d)} م`, color: t.mu };
        }
        return (
          <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: i === locs.length - 1 ? 0 : 1, borderBottomColor: t.bd }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: "rgba(41,179,94,.15)", alignItems: "center", justifyContent: "center" }}>
              <Icon name="pin" size={18} color="#1F8D49" stroke={2} />
            </View>
            <T size={13} weight={800} style={{ flex: 1 }} numberOfLines={1}>{l.name}</T>
            <View style={{ backgroundColor: t.dark ? "rgba(228,228,188,.14)" : "rgba(1,77,61,.1)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
              <T size={10} weight={700} color={t.dark ? "#E4E4BC" : "#014D3D"}>{l.type === "hq" ? "مقر رئيسي" : "مشروع"}</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              {st.txt === "داخل النطاق" ? <Icon name="check" size={13} color={st.color} stroke={2.4} /> : null}
              <T size={11} weight={700} color={st.color}>{st.txt}</T>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

export { isoDate };
