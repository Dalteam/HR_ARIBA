// طلباتي — their Leaves.jsx «📋 طلباتي» and the delegation card. Sending a request is the «+» in the dock (components/composer.tsx),
// which holds every type, rule and attachment that used to be the inline form here.
import { dateLocale } from "@/i18n";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Btn, Card, CardTitle, Empty, Page, PickerField, Sheet, T, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useComposer } from "@/components/composer";
import { dmy, todayISO } from "@/components/shared";
import { ApiError, requests, type LeavePolicy, type MyRequest } from "@/lib/api";
import { DelegationCard } from "@/components/delegation";
import { RequestItem } from "@/components/request-item";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

const DAY = 86400000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Requests grouped by the day they were sent, newest day first. */
function byDay(list: MyRequest[]): [string, MyRequest[]][] {
  const m = new Map<string, MyRequest[]>();
  for (const r of [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const k = ymd(new Date(r.created_at));
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()];
}
function dayLabel(k: string) {
  const now = new Date();
  if (k === ymd(now)) return "اليوم";
  if (k === ymd(new Date(now.getTime() - DAY))) return "أمس";
  const [y, mo, d] = k.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Stage A1: the web /me/leaves page listed the official holidays under the request route; in the app they only lived
// inside the «+» sheet. The same rows here, so a vacation can be planned without opening the composer.
function HolidaysCard() {
  const t = useTheme();
  const { leave } = useData();
  const today = todayISO();
  const rows = (leave?.upcoming_holidays ?? []).filter((h) => h.date >= today);
  if (!rows.length) return null;
  return (
    <Card>
      <CardTitle icon="calendar">إجازات رسمية قادمة</CardTitle>
      {rows.map((h) => (
        <View key={h.date} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.bd }}>
          <T size={12.5} weight={700} numberOfLines={1} style={{ flexShrink: 1 }}>{h.name}</T>
          <T size={12} color={t.mu}>{`${dmy(h.date)}${h.days > 1 ? ` (${h.days} يوم)` : ""}`}</T>
        </View>
      ))}
    </Card>
  );
}

export default function Leaves() {
  const t = useTheme();
  const toast = useToast();
  const { open } = useComposer();
  const { requests: list, refresh } = useData();
  const mine = list.filter((r) => r.type !== "overtime");
  const pending = mine.filter((r) => r.status === "pending").length;
  // Stage 14: which of the three leave actions HR has switched on (the API checks each action itself)
  const [policy, setPolicy] = useState<LeavePolicy | null>(null);
  const [editing, setEditing] = useState<{ r: MyRequest; from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    requests.policy().then(setPolicy).catch(() => setPolicy(null));
  }, [list]);

  const fail = (e: unknown, fallback: string) => toast(e instanceof ApiError ? e.message : fallback, "err");
  function cancel(r: MyRequest) {
    Alert.alert("إلغاء الطلب", "تُلغى الإجازة قبل الموافقة عليها ويُبلَّغ من ينتظر ردّه. هل أنت متأكد؟", [
      { text: "رجوع", style: "cancel" },
      { text: "إلغاء الطلب", style: "destructive", onPress: async () => {
        try { await requests.cancel(r.id); toast("تم إلغاء الطلب", "ok"); await refresh(); } catch (e) { fail(e, "تعذر الإلغاء"); }
      } },
    ]);
  }
  function cancelRequest(r: MyRequest) {
    Alert.alert("طلب إلغاء الإجازة", "يُرسل طلب إلغاء لإجازتك المعتمدة ويمرّ بالموافقات، وعند اعتماده ترجع أيامها لرصيدك. هل أنت متأكد؟", [
      { text: "رجوع", style: "cancel" },
      { text: "إرسال الطلب", onPress: async () => {
        try { await requests.cancelRequest(r.id); toast("تم إرسال طلب الإلغاء", "ok"); await refresh(); } catch (e) { fail(e, "تعذر الإرسال"); }
      } },
    ]);
  }
  async function saveDates() {
    if (!editing) return;
    setBusy(true);
    try {
      const done = await requests.editDates(editing.r.id, editing.from, editing.to);
      toast("تم تعديل التواريخ (" + done.days + " يوم)", "ok");
      setEditing(null);
      await refresh();
    } catch (e) {
      fail(e, "تعذر التعديل");
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
      <Btn kind="primary" title="طلب جديد" icon={<Icon name="send" size={16} color="#012A21" />} onPress={() => open()} style={{ marginTop: 0, marginBottom: 14 }} />
      <Card>
        <CardTitle icon="clipboard">طلباتي</CardTitle>
        {pending ? <View style={{ marginBottom: 6 }}><T size={12} color={t.mu}>{`${pending} طلب بانتظار الاعتماد`}</T></View> : null}
        {!mine.length ? <Empty text="لا توجد طلبات" /> : null}
        {byDay(mine).map(([day, rows]) => (
          <View key={day}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 2 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.bd }} />
              <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: t.bg, borderWidth: 1, borderColor: t.bd }}>
                <T size={11.5} weight={800} color={t.mu}>{dayLabel(day)}</T>
              </View>
              <View style={{ flex: 1, height: 1, backgroundColor: t.bd }} />
            </View>
            {rows.map((r) => (
              <RequestItem key={r.id} r={r} onDelete={remove} policy={policy} onCancel={cancel} onCancelRequest={cancelRequest}
                onEdit={(x) => setEditing({ r: x, from: String(x.payload?.from ?? ""), to: String(x.payload?.to ?? "") })} />
            ))}
          </View>
        ))}
      </Card>
      <DelegationCard />
      <HolidaysCard />
      <Sheet visible={!!editing} onClose={() => setEditing(null)}>
        <T size={15} weight={800} style={{ marginBottom: 10 }}>تعديل تواريخ الإجازة</T>
        {editing ? (
          <>
            <PickerField label="من" mode="date" value={editing.from} onChange={(v) => setEditing({ ...editing, from: v })} />
            <PickerField label="إلى" mode="date" value={editing.to} onChange={(v) => setEditing({ ...editing, to: v })} />
            <T size={11} color={t.mu} style={{ marginTop: 6 }}>يُعاد حساب الأيام والرصيد، ويُبلَّغ من ينتظر ردّه بالتواريخ الجديدة.</T>
            <Btn kind="primary" title="حفظ" busy={busy} onPress={saveDates} style={{ marginTop: 12 }} />
          </>
        ) : null}
      </Sheet>
    </Page>
  );
}
