// عمل إضافي — legacy requests/009 (V21): ⏱️ طلب عمل إضافي + 📋 طلبات العمل الإضافي.
import { useState } from "react";
import { View } from "react-native";
import { todayISO } from "@/components/shared";
import { Badge, Btn, Card, CardTitle, Empty, Input, Page, PickerField, T, useToast } from "@/components/ui";
import { ApiError, requests } from "@/lib/api";
import { useData } from "@/lib/data";
import { statusText } from "@/lib/labels";
import { useTheme } from "@/theme";

const TONE = { gr: "bg", rd: "br", am: "ba" } as const;

export default function Overtime() {
  const t = useTheme();
  const toast = useToast();
  const { requests: list, refresh } = useData();
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ot = list.filter((r) => r.type === "overtime");

  async function submit() {
    if (!date || !(Number(hours) >= 0.5)) return toast("حدد التاريخ والساعات (0.5 على الأقل)", "err");
    setBusy(true);
    try {
      await requests.submit({ type: "overtime", on_date: date, hours: String(Number(hours)), notes: reason.trim() || undefined });
      toast("تم إرسال الطلب", "ok");
      setReason("");
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر إرسال الطلب", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page onRefresh={refresh}>
      <Card>
        <CardTitle>⏱️ طلب عمل إضافي</CardTitle>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PickerField label="التاريخ" value={date} onChange={setDate} mode="date" />
          <Input label="عدد الساعات" value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
        </View>
        <Input label="السبب / المهمة" value={reason} onChangeText={setReason} multiline />
        <Btn kind="primary" title="⏱️ إرسال الطلب" onPress={submit} busy={busy} />
      </Card>
      <Card>
        <CardTitle icon="clipboard">طلبات العمل الإضافي</CardTitle>
        {!ot.length ? <Empty text="لا توجد طلبات" /> : null}
        {ot.map((r) => (
          <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.bd }}>
            <T size={12}><T size={12} weight={700}>{r.on_date}</T> — {Number(r.hours ?? 0)} ساعة</T>
            <Badge text={statusText(r).text} tone={TONE[statusText(r).tone]} />
          </View>
        ))}
      </Card>
    </Page>
  );
}
