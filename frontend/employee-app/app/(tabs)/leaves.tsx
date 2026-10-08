// الإجازات والطلبات — legacy main/07-leaves.js + secure workflow (004) + V114 نسيان بصمة (027) + V21 عمل إضافي (009).
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, Card, ErrorText, Field, Txt } from "@/components/ui";
import { ApiError, requests, type MyLeave, type MyRequest, type NewRequest, type RequestType } from "@/lib/api";
import { HOURLY, REQUEST_TYPES, requestDetail, statusText } from "@/lib/labels";
import { fonts, useTheme } from "@/theme";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

export default function Leaves() {
  const t = useTheme();
  const params = useLocalSearchParams<{ type?: string }>();
  const [leave, setLeave] = useState<MyLeave | null>(null);
  const [list, setList] = useState<MyRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<RequestType>("annual");
  const [f, setF] = useState({ from: "", to: "", date: todayISO(), time: "", time2: "", hours: "1", amount: "", notes: "" });
  const [kind, setKind] = useState<"in" | "out" | "both">("in");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (params.type && REQUEST_TYPES.some((x) => x.key === params.type)) setType(params.type as RequestType);
  }, [params.type]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, r] = await Promise.all([requests.leave(), requests.mine()]);
      setLeave(l);
      setList(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل البيانات");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const isHourly = HOURLY.includes(type);

  function build(): NewRequest | string {
    const notes = f.notes.trim() || undefined;
    if (type === "advance") {
      const amount = Number(f.amount);
      if (!(amount > 0)) return "أدخل مبلغ السلفة";
      return { type, amount: String(amount), notes };
    }
    if (isHourly) {
      if (!DATE.test(f.date) || !TIME.test(f.time)) return "حدد التاريخ والوقت";
      return { type, on_date: f.date, time_from: f.time, hours: String(Number(f.hours) || 1), notes };
    }
    if (type === "overtime") {
      if (!DATE.test(f.date) || !(Number(f.hours) >= 0.5)) return "حدد التاريخ والساعات (0.5 على الأقل)";
      return { type, on_date: f.date, hours: String(Number(f.hours)), notes };
    }
    if (type === "forgot_punch") {
      if (!DATE.test(f.date)) return "اختر التاريخ";
      if (f.date > todayISO()) return "لا يمكن اختيار تاريخ في المستقبل";
      if (!TIME.test(f.time)) return "اختر الوقت";
      if (kind === "both" && (!TIME.test(f.time2) || f.time2 <= f.time)) return "وقت الخروج لازم يكون بعد وقت الدخول";
      if (!notes) return "اكتب السبب";
      return { type, punch_kind: kind, on_date: f.date, time_from: f.time, time_to: kind === "both" ? f.time2 : undefined, notes };
    }
    if (!DATE.test(f.from) || !DATE.test(f.to) || f.to < f.from) return "حدد الفترة بشكل صحيح";
    return { type, from_date: f.from, to_date: f.to, notes };
  }

  async function submit() {
    const body = build();
    if (typeof body === "string") {
      Alert.alert("❌", body);
      return;
    }
    setBusy(true);
    try {
      await requests.submit(body);
      Alert.alert("✅ تم إرسال الطلب", type === "forgot_punch" ? "بانتظار الموارد البشرية" : undefined);
      setF((s) => ({ ...s, from: "", to: "", time: "", time2: "", amount: "", notes: "" }));
      await load();
    } catch (e) {
      Alert.alert("❌", e instanceof ApiError ? e.message : "تعذر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  function remove(r: MyRequest) {
    Alert.alert("حذف الطلب", "هل تريد حذف هذا الطلب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await requests.remove(r.id);
            await load();
          } catch (e) {
            Alert.alert("❌", e instanceof ApiError ? e.message : "تعذر الحذف");
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <ErrorText message={error} />
      <Card>
        <View style={styles.between}>
          <Txt bold>رصيد الإجازة</Txt>
          <View>
            <Txt bold style={{ fontSize: 22, color: t.gr }}>
              {leave ? leave.current : "—"} <Txt muted style={{ fontSize: 11 }}>يوم</Txt>
            </Txt>
            {leave && leave.carry > 0 ? <Txt style={{ fontSize: 10, color: t.pu }}>{leave.carry} مرحّل</Txt> : null}
          </View>
        </View>
        {leave ? <Txt muted style={{ fontSize: 11 }}>رصيد نهاية السنة: {leave.year_end} يوم</Txt> : null}
        {leave?.upcoming_holidays.length ? (
          <View style={[styles.hols, { borderColor: t.bd }]}>
            <Txt bold style={{ fontSize: 12, color: t.bl, marginBottom: 6 }}>🗓️ إجازات رسمية قادمة</Txt>
            {leave.upcoming_holidays.map((h) => (
              <View key={h.date + h.name} style={styles.between}>
                <Txt style={{ fontSize: 11 }}>{h.name}</Txt>
                <Txt muted style={{ fontSize: 11 }}>{h.date}{h.days ? ` (${h.days} يوم)` : ""}</Txt>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card title="إرسال طلب جديد">
        <Txt muted style={{ fontSize: 11, marginBottom: 8 }}>
          {type === "forgot_punch"
            ? "الطلب بيروح للموارد البشرية مباشرة، ولما يوافقوا بيتسجل الحضور/الانصراف في سجلك."
            : "مسار الاعتماد: المدير المباشر → الموارد البشرية → الرئيس التنفيذي."}
        </Txt>
        <View style={styles.grid}>
          {REQUEST_TYPES.map((x) => {
            const on = x.key === type;
            return (
              <Pressable
                key={x.key}
                onPress={() => setType(x.key)}
                style={[styles.type, { borderColor: on ? x.color : t.bd, backgroundColor: on ? x.color + "22" : t.c2 }]}
              >
                <Txt style={{ fontSize: 11, textAlign: "center", fontFamily: on ? fonts.bold : fonts.medium }}>{x.ar}</Txt>
              </Pressable>
            );
          })}
        </View>

        {type === "advance" ? (
          <Field label="مبلغ السلفة" value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder="0.00" />
        ) : isHourly ? (
          <>
            <Field label="التاريخ" value={f.date} onChangeText={set("date")} placeholder="YYYY-MM-DD" />
            <Field label="الوقت" value={f.time} onChangeText={set("time")} placeholder="HH:MM" />
            <Field label="المدة (س)" value={f.hours} onChangeText={set("hours")} keyboardType="decimal-pad" />
          </>
        ) : type === "overtime" ? (
          <>
            <Field label="التاريخ" value={f.date} onChangeText={set("date")} placeholder="YYYY-MM-DD" />
            <Field label="الساعات" value={f.hours} onChangeText={set("hours")} keyboardType="decimal-pad" />
          </>
        ) : type === "forgot_punch" ? (
          <>
            <View style={[styles.grid, { marginBottom: 10 }]}>
              {(["in", "out", "both"] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={[styles.kind, { borderColor: kind === k ? t.bl : t.bd, backgroundColor: kind === k ? t.bl + "18" : t.c2 }]}
                >
                  <Txt bold={kind === k} style={{ textAlign: "center" }}>{k === "in" ? "دخول" : k === "out" ? "خروج" : "دخول وخروج"}</Txt>
                </Pressable>
              ))}
            </View>
            <Field label="التاريخ" value={f.date} onChangeText={set("date")} placeholder="YYYY-MM-DD" />
            <Field label={kind === "out" ? "وقت الخروج" : "وقت الدخول"} value={f.time} onChangeText={set("time")} placeholder="HH:MM" />
            {kind === "both" ? <Field label="وقت الخروج" value={f.time2} onChangeText={set("time2")} placeholder="HH:MM" /> : null}
          </>
        ) : (
          <>
            <Field label="من تاريخ" value={f.from} onChangeText={set("from")} placeholder="YYYY-MM-DD" />
            <Field label="إلى تاريخ" value={f.to} onChangeText={set("to")} placeholder="YYYY-MM-DD" />
          </>
        )}
        <Field
          label={type === "forgot_punch" ? "السبب (مطلوب)" : "ملاحظات"}
          value={f.notes}
          onChangeText={set("notes")}
          placeholder={type === "forgot_punch" ? "اكتب سبب نسيان البصمة" : "اختياري"}
          multiline
        />
        <Button title="إرسال الطلب" onPress={submit} busy={busy} />
      </Card>

      <Card title="📋 طلباتي">
        {!list.length ? <Txt muted style={{ textAlign: "center", padding: 14 }}>لا توجد طلبات حتى الآن</Txt> : null}
        {list.map((r) => {
          const st = statusText(r);
          return (
            <View key={r.id} style={[styles.item, { borderBottomColor: t.bd }]}>
              <View style={styles.between}>
                <Txt bold style={{ fontSize: 12 }}>{REQUEST_TYPES.find((x) => x.key === r.type)?.ar ?? r.type}</Txt>
                <Txt bold style={{ fontSize: 11, color: t[st.tone] }}>{st.text}</Txt>
              </View>
              <Txt muted style={{ fontSize: 11, marginTop: 4 }}>{requestDetail(r)}</Txt>
              {r.notes ? <Txt style={{ fontSize: 10, color: t.dm, marginTop: 3 }}>{r.notes}</Txt> : null}
              {r.rejection_reason ? <Txt style={{ fontSize: 11, color: t.rd, marginTop: 3 }}>❌ {r.rejection_reason}</Txt> : null}
              {r.status !== "approved" ? (
                <Pressable onPress={() => remove(r)} style={{ alignSelf: "flex-end", marginTop: 4 }}>
                  <Txt style={{ fontSize: 11, color: t.rd }}>حذف</Txt>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  hols: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  type: { width: "23.5%", borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 2 },
  kind: { flex: 1, borderWidth: 2, borderRadius: 8, paddingVertical: 9 },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
