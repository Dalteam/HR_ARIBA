// الموافقات — legacy requests/004 renderApprovals (manager / hr / ceo): طلبات بانتظار موافقتك + مسار الطلب.
import { useState } from "react";
import { View } from "react-native";
import { NAME } from "@/components/request-item";
import { Badge, Btn, Card, CardTitle, Empty, Input, Page, T, useToast } from "@/components/ui";
import { ApiError, requests, type MyRequest } from "@/lib/api";
import { useData } from "@/lib/data";
import { requestDetail } from "@/lib/labels";
import { useTheme } from "@/theme";

function Item({ r, onDone }: { r: MyRequest; onDone: () => Promise<void> }) {
  const t = useTheme();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) return toast("اكتب سبب الرفض", "err");
    setBusy(true);
    try {
      await requests.decide(r.id, action, action === "reject" ? reason.trim() : undefined);
      toast(action === "approve" ? "تمت الموافقة وانتقل الطلب للمرحلة التالية" : "تم رفض الطلب", "ok");
      await onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر تنفيذ العملية", "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ backgroundColor: t.c2, borderWidth: 1, borderColor: t.bd, borderRightWidth: 3, borderRightColor: t.am, borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <T weight={700} style={{ flex: 1 }}>{r.employee_name}</T>
        <Badge text={NAME[r.type] ?? r.type} tone="ba" />
      </View>
      <T size={11} color={t.mu} style={{ marginTop: 4 }}>{requestDetail(r)}</T>
      {r.notes ? <T size={11} color={t.dm} style={{ marginTop: 2 }}>{r.notes}</T> : null}
      {rejecting ? <Input value={reason} onChangeText={setReason} placeholder="سبب الرفض:" /> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn kind="success" title="موافقة" icon="check" onPress={() => decide("approve")} busy={busy} style={{ flex: 1 }} />
        <Btn kind="danger" title={rejecting ? "تأكيد الرفض" : "رفض"} icon="x" onPress={() => (rejecting ? decide("reject") : setRejecting(true))} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export default function Approvals() {
  const t = useTheme();
  const { approvals, refresh } = useData();
  return (
    <Page onRefresh={refresh}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <T size={14} weight={800}>طلبات بانتظار موافقتك</T>
          <Badge text={String(approvals.length)} tone="ba" />
        </View>
        {!approvals.length ? <Empty text="لا توجد طلبات" /> : null}
        {approvals.map((r) => <Item key={r.id} r={r} onDone={refresh} />)}
      </Card>
      <Card>
        <T size={11} color={t.mu}>الموظف → المدير المباشر → الموارد البشرية → الرئيس التنفيذي → الموظف</T>
      </Card>
    </Page>
  );
}
