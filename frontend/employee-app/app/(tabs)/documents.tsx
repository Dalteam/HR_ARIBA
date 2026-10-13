// المستندات — legacy forms/020 (📄 مستندات بانتظار توقيعي): view, موافقة / رفض (reason ≥ 3 chars).
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/icons";
import { dmy } from "@/components/shared";
import { Badge, Btn, Card, CardTitle, Empty, Input, Page, T, useToast } from "@/components/ui";
import { ApiError, letters, type Letter } from "@/lib/api";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

function Doc({ x, onDone }: { x: Letter; onDone: () => Promise<void> }) {
  const t = useTheme();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function respond(action: "approved" | "rejected") {
    setBusy(true);
    try {
      await letters.respond(x.id, action, action === "rejected" ? reason.trim() : undefined);
      toast(action === "approved" ? "تمت الموافقة" : "تم إرسال الرفض", "ok");
      await onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر الإرسال", "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ padding: 12, marginBottom: 10, backgroundColor: t.c2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="file" size={18} color={t.tx} />
        <View style={{ flex: 1 }}>
          <T size={13} weight={700}>{x.title}</T>
          <T size={10.5} color={t.mu}>{dmy(x.created_at)}</T>
        </View>
        {x.status !== "pending" ? <Badge text={x.status === "approved" ? "موافق" : "مرفوض"} tone={x.status === "approved" ? "bg" : "br"} /> : null}
      </View>
      <Btn kind="ghost" title="عرض المستند" icon={<Icon name="eye" size={16} color={t.tx} />}
        onPress={() => router.push({ pathname: "/letter/[id]", params: { id: x.id, title: x.title } })} />
      {x.status === "pending" ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn title="موافقة" icon={<Icon name="check" size={16} color="#fff" />} onPress={() => respond("approved")} busy={busy} style={{ flex: 1, backgroundColor: "#12b76a" }} kind="success" />
            <Btn title="رفض" icon={<Icon name="x" size={16} color="#fff" />} onPress={() => setRejecting(true)} style={{ flex: 1, backgroundColor: t.rd }} kind="danger" />
          </View>
          {rejecting ? (
            <>
              <Input value={reason} onChangeText={setReason} placeholder="اكتب سبب الرفض هنا (إجباري)..." multiline />
              <Btn kind="danger" title="تأكيد الرفض" disabled={reason.trim().length < 3} busy={busy} onPress={() => respond("rejected")} />
            </>
          ) : null}
        </>
      ) : x.rejection_reason ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}><Icon name="xCircle" size={13} color={t.rd} stroke={2} /><T size={11} color={t.rd} style={{ flexShrink: 1 }}>سبب الرفض: {x.rejection_reason}</T></View> : null}
    </Card>
  );
}

export default function Documents() {
  const { letters: list, refresh } = useData();
  return (
    <Page onRefresh={refresh}>
      <Card>
        <CardTitle icon="file">مستندات بانتظار توقيعي</CardTitle>
        {!list.length ? <Empty text="لا توجد مستندات" /> : null}
        {list.map((x) => <Doc key={x.id} x={x} onDone={refresh} />)}
      </Card>
    </Page>
  );
}
