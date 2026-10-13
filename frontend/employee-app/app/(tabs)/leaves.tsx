// الإجازات — legacy requests/004 (second renderLv / changeRequestType / submitLv) + 027 (نسيان بصمة) + 035 (حذف).
// Order as in the prototype: «📋 طلباتي» then «إرسال طلب جديد» with the 4-column type grid.
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { ForgotPunchSheet, todayISO } from "@/components/shared";
import { Btn, Card, CardTitle, Empty, Input, Page, PickerField, T, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ApiError, requests, type MyRequest, type RequestType } from "@/lib/api";
import { HOURLY, RequestItem, TYPES } from "@/components/request-item";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

export default function Leaves() {
  const t = useTheme();
  const toast = useToast();
  const { requests: list, leave, refresh } = useData();
  const [type, setType] = useState<RequestType>("annual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [dur, setDur] = useState("1");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const mine = list.filter((r) => r.type !== "overtime");

  function pick(k: RequestType) {
    if (k === "forgot_punch") return setForgot(true);
    setType(k);
  }

  async function submit() {
    const n = notes.trim() || undefined;
    let body: Parameters<typeof requests.submit>[0];
    if (type === "advance") {
      if (!(Number(amount) > 0)) return toast("أدخل مبلغ السلفة", "err");
      body = { type, amount: String(Number(amount)), notes: n };
    } else if (HOURLY.includes(type)) {
      if (!date || !time) return toast("حدد التاريخ والوقت", "err");
      body = { type, on_date: date, time_from: time, hours: String(Number(dur) || 1), notes: n };
    } else {
      if (!from || !to || to < from) return toast("حدد الفترة بشكل صحيح", "err");
      if (type === "annual" && leave && leave.current <= 0) return toast("يتجاوز الرصيد المتاح", "err");
      body = { type, from_date: from, to_date: to, notes: n };
    }
    setBusy(true);
    try {
      await requests.submit(body);
      toast("تم إرسال الطلب", "ok");
      setFrom(""); setTo(""); setTime(""); setAmount(""); setNotes("");
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر إرسال الطلب", "err");
    } finally {
      setBusy(false);
    }
  }

  function remove(r: MyRequest) {
    Alert.alert("حذف الطلب", "هل تريد حذف هذا الطلب؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try { await requests.remove(r.id); toast("تم الحذف", "ok"); await refresh(); } catch (e) { toast(e instanceof ApiError ? e.message : "تعذر الحذف", "err"); }
      } },
    ]);
  }

  return (
    <Page onRefresh={refresh}>
      <Card>
        <CardTitle icon="clipboard">طلباتي</CardTitle>
        {!mine.length ? <Empty text="لا توجد طلبات" /> : null}
        {mine.map((r) => <RequestItem key={r.id} r={r} onDelete={remove} />)}
      </Card>

      <Card>
        <CardTitle>إرسال طلب جديد</CardTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {TYPES.map(([k, label]) => {
            const on = k === type;
            return (
              <Pressable key={k} onPress={() => pick(k)}
                style={{ width: "23.3%", borderWidth: 2, borderColor: on ? t.bl : t.bd, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, backgroundColor: t.c2 }}>
                <T size={11} center weight={on ? 700 : 500}>{label}</T>
              </Pressable>
            );
          })}
        </View>

        {type === "advance" ? (
          <Input label="مبلغ السلفة" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        ) : HOURLY.includes(type) ? (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <PickerField label="التاريخ" value={date} onChange={setDate} mode="date" />
            <PickerField label="الوقت" value={time} onChange={setTime} mode="time" />
            <Input label="المدة (س)" value={dur} onChangeText={setDur} keyboardType="decimal-pad" />
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <PickerField label="من تاريخ" value={from} onChange={setFrom} mode="date" />
            <PickerField label="إلى تاريخ" value={to} onChange={setTo} mode="date" />
          </View>
        )}
        <Input label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="اختياري" multiline />
        <Btn kind="primary" title="إرسال الطلب" icon={<Icon name="send" size={16} color={t.dark ? "#013D31" : "#fff"} />} onPress={submit} busy={busy} />
      </Card>
      <ForgotPunchSheet visible={forgot} onClose={() => setForgot(false)} />
    </Page>
  );
}
