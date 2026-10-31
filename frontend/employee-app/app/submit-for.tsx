// طلب نيابةً عن موظف — their OnBehalf (MgrTeam): the direct manager submits for a team member who delegated him; the
// manager's own submission counts as his approval, so it goes to HR (HR and the employee are notified).
import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { Btn, Card, Input, Label, PickerField, T, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { calendarDays, manager } from "@/lib/port";
import { useTheme } from "@/theme";
import { goBack } from "@/lib/nav";

const TYPES: [string, string][] = [["annual", "سنوية"], ["sick", "مرضية"], ["emergency", "اضطرارية"], ["unpaid", "إجازة بدون راتب"], ["salary_advance", "طلب راتب مقدم"]];

export default function SubmitFor() {
  const t = useTheme();
  const toast = useToast();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [type, setType] = useState("annual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const adv = type === "salary_advance";
  async function go() {
    const p: Record<string, unknown> = { notes };
    if (adv) { p.amount = Number(amount) || 0; if (!((p.amount as number) > 0)) return toast("أدخل المبلغ", "err"); }
    else { if (!from || !to || to < from) return toast("حدد الفترة", "err"); p.from = from; p.to = to; p.days = calendarDays(from, to); }
    setBusy(true);
    try {
      await manager.submitFor(id, type, p);
      toast("✅ قُدّم الطلب نيابةً عن الموظف — أُبلغت الموارد البشرية والموظف", "ok");
      goBack();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر الإرسال", "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title={`📝 طلب نيابةً عن ${name ?? ""}`}>
      <Card>
        <Label>النوع</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {TYPES.map(([k, l]) => (
            <Pressable key={k} onPress={() => setType(k)} style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, borderWidth: 2, borderColor: k === type ? t.bl : t.bd, backgroundColor: t.c2 }}>
              <T size={11} weight={k === type ? 700 : 500}>{l}</T>
            </Pressable>
          ))}
        </View>
        {adv ? <Input label="المبلغ" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /> : (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <PickerField label="من" value={from} onChange={setFrom} mode="date" />
            <PickerField label="إلى" value={to} onChange={setTo} mode="date" />
          </View>
        )}
        <Input label="ملاحظات / السبب" value={notes} onChangeText={setNotes} multiline />
        <Btn title="إرسال" onPress={go} busy={busy} style={{ marginTop: 10 }} />
      </Card>
    </Screen>
  );
}
