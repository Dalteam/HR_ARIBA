// عمل إضافي — legacy requests/009 (V21) and their Overtime.jsx: ⏱️ طلب عمل إضافي (+ optional attachment) + 📋 طلبات العمل الإضافي.
// Stage A1: the list is the same request line as «طلباتي» (reason, rejection reason, sent date, 🗑 before approval),
// which is what the web /me area showed.
import { useState } from "react";
import { Alert, View } from "react-native";
import { RequestItem } from "@/components/request-item";
import { dmy, todayISO } from "@/components/shared";
import { Btn, Card, CardTitle, Empty, Input, Page, PickerField, useToast } from "@/components/ui";
import { ApiError, requests, type MyRequest } from "@/lib/api";
import { pickFile, type Picked } from "@/lib/files";
import { submitRequest } from "@/lib/port";
import { useData } from "@/lib/data";

export default function Overtime() {
  const toast = useToast();
  const { requests: list, refresh } = useData();
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<Picked | null>(null);
  const ot = list.filter((r) => r.type === "overtime");

  async function submit() {
    if (!date || !(Number(hours) >= 0.5)) return toast("حدد التاريخ والساعات (0.5 على الأقل)", "err");
    setBusy(true);
    try {
      if (file) await submitRequest("overtime", { date, hours: Number(hours), notes: reason.trim() || undefined }, file);
      else await requests.submit({ type: "overtime", on_date: date, hours: String(Number(hours)), notes: reason.trim() || undefined });
      toast("تم إرسال الطلب", "ok");
      setReason("");
      setFile(null);
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر إرسال الطلب", "err");
    } finally {
      setBusy(false);
    }
  }

  function remove(r: MyRequest) {
    Alert.alert("حذف الطلب", "هل تريد حذف طلب العمل الإضافي؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try { await requests.remove(r.id); toast("تم الحذف", "ok"); await refresh(); } catch (e) { toast(e instanceof ApiError ? e.message : "تعذر الحذف", "err"); }
      } },
    ]);
  }

  return (
    <Page onRefresh={refresh}>
      <Card>
        <CardTitle icon="stopwatch">طلب عمل إضافي</CardTitle>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PickerField label="التاريخ" value={date} onChange={setDate} mode="date" />
          <Input label="عدد الساعات" value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
        </View>
        <Input label="السبب / المهمة" value={reason} onChangeText={setReason} multiline />
        <Btn kind="ghost" title={file ? `📎 ${file.name}` : "📎 مرفق (اختياري)"} style={{ marginTop: 8 }}
          onPress={async () => { try { setFile(file ? null : await pickFile()); } catch (e) { toast(e instanceof Error ? e.message : "تعذر قراءة المرفق", "err"); } }} />
        <Btn kind="primary" title="⏱️ إرسال الطلب" onPress={submit} busy={busy} />
      </Card>
      <Card>
        <CardTitle icon="clipboard">طلبات العمل الإضافي</CardTitle>
        {!ot.length ? <Empty text="لا توجد طلبات" /> : null}
        {ot.map((r) => <RequestItem key={r.id} r={r} onDelete={remove} meta={`أُرسل ${dmy(r.created_at)}`} />)}
      </Card>
    </Page>
  );
}
