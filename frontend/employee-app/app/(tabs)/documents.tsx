// المستندات — their Docs.jsx (📄 مستندات بانتظار توقيعي): view, «موافق مع التوقيع» (my signature, kept on this device,
// goes on the document; if HR asked for it the direct manager signs next), approve without signature, reject with a
// reason (≥ 3 chars); and their MgrSignDocs: documents my team signed that wait for my signature as their manager.
import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { SigManager } from "@/components/sig-manager";
import { docs, type ManagerPending, type SignState } from "@/lib/port";
import { getSig, injectSignature, b64Utf8, utf8FromB64 } from "@/lib/signature";
import { router } from "expo-router";
import { Icon } from "@/components/icons";
import { dmy } from "@/components/shared";
import { Badge, Btn, Card, CardTitle, Empty, Input, Page, T, useToast } from "@/components/ui";
import { ApiError, letters, type Letter } from "@/lib/api";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

function Doc({ x, onDone, state, owner, name, needSig }: { x: Letter; onDone: () => Promise<void>; state?: SignState; owner: string; name: string; needSig: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  function signApprove() {
    const sig = getSig(owner);
    if (!sig) { needSig(); toast("أضف توقيعك أولاً ثم اضغط «موافق مع التوقيع»", "ok"); return; }
    Alert.alert("موافق مع التوقيع", "سيُضاف توقيعك على المستند في مكان توقيع الموظف ويُرسل للمسؤول. متأكد؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "متابعة", onPress: async () => {
        setBusy(true);
        try {
          const signed = injectSignature(await letters.html(x.id), "employee", sig, name);
          const r = await docs.employeeSign(x.id, { document_id: null, template_type: x.type.replace(/^template:/, ""), signed_base64: b64Utf8(signed) });
          toast(r.next === "manager"
            ? "✍️ تم التوقيع، المستند الآن عند مديرك المباشر لتوقيعه"
            : r.next === "hr"
              ? "✅ تم التوقيع وأُرسل المستند للموارد البشرية للاعتماد"
              : "✅ تم التوقيع واعتُمد المستند", "ok");
          await onDone();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : "تعذر التوقيع", "err");
        } finally {
          setBusy(false);
        }
      } },
    ]);
  }
  async function respond(action: "approved" | "rejected") {
    setBusy(true);
    try {
      await letters.respond(x.id, action, action === "rejected" ? reason.trim() : undefined);
      toast(action === "approved" ? "تم إرسال موافقتك على المستند" : "تم إرسال الرفض", "ok");
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
      {state?.stage === "manager" ? <T size={12} style={{ padding: 8, borderRadius: 8, backgroundColor: "rgba(245,158,11,.15)", marginTop: 6 }}>⏳ وقّعت — بانتظار توقيع مديرك المباشر قبل أن يذهب للموارد البشرية</T> : null}
      {x.status === "pending" && x.stage === "hr" ? <T size={12} style={{ padding: 8, borderRadius: 8, backgroundColor: "rgba(1,77,61,.10)", marginTop: 6 }}>🕓 وافقت — بانتظار اعتماد الموارد البشرية</T> : null}
      {state?.stage === "rejected" ? <T size={12} style={{ padding: 8, borderRadius: 8, backgroundColor: "rgba(229,72,77,.12)", marginTop: 6 }}>❌ رفض المدير التوقيع: {state.reject_reason ?? ""}</T> : null}
      {x.status === "pending" && (x.stage ?? "employee") === "employee" && !state ? (
        <>
          <Btn title="✍️ موافق مع التوقيع" onPress={signApprove} busy={busy} style={{ backgroundColor: "#014D3D" }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn title="موافقة بدون توقيع" icon={<Icon name="check" size={16} color="#fff" />} onPress={() => respond("approved")} busy={busy} style={{ flex: 1, backgroundColor: "#28B35D" }} kind="success" />
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
  const { letters: list, refresh, employee } = useData();
  const t = useTheme();
  const owner = employee?.emp_no || employee?.id || "me";
  const [states, setStates] = useState<Record<string, SignState>>({});
  const [sigOpen, setSigOpen] = useState(false);
  const load = useCallback(async () => {
    try { const r = await docs.states(); setStates(Object.fromEntries(r.map((x) => [x.request_id, x]))); } catch { setStates({}); }
  }, []);
  useEffect(() => { load(); }, [load, list]);
  return (
    <Page onRefresh={async () => { await Promise.all([refresh(), load()]); }}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <CardTitle icon="file">مستندات بانتظار توقيعي</CardTitle>
          <Btn kind="ghost" title={getSig(owner) ? "✍️ توقيعي" : "✍️ أضف توقيعي"} onPress={() => setSigOpen(true)} style={{ marginTop: 0, paddingVertical: 6 }} />
        </View>
        {!list.length ? <Empty text="لا توجد مستندات بانتظار توقيعك حاليًا ✓" /> : null}
        {list.map((x) => <Doc key={x.id} x={x} onDone={async () => { await refresh(); await load(); }} state={states[x.id]} owner={owner} name={employee?.name_ar ?? ""} needSig={() => setSigOpen(true)} />)}
      </Card>
      <ManagerSign owner={owner} name={employee?.name_ar ?? ""} needSig={() => setSigOpen(true)} />
      {sigOpen ? <SigManager owner={owner} visible onClose={() => setSigOpen(false)} /> : null}
      <View style={{ height: 1, backgroundColor: t.bg }} />
    </Page>
  );
}

function ManagerSign({ owner, name, needSig }: { owner: string; name: string; needSig: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [list, setList] = useState<ManagerPending[]>([]);
  const [busy, setBusy] = useState("");
  const [rej, setRej] = useState<Record<string, string | undefined>>({});
  const load = useCallback(() => docs.managerPending().then(setList).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  if (!list.length) return null;
  async function sign(x: ManagerPending) {
    const sig = getSig(owner);
    if (!sig) { needSig(); return toast("أضف توقيعك أولاً", "ok"); }
    setBusy(x.request_id);
    try {
      const d = await docs.content(x.document_id);
      const html = injectSignature(utf8FromB64(d.base64), "manager", sig, name);
      const r = await docs.managerSign(x.request_id, { action: "approved", signed_base64: b64Utf8(html) });
      toast(r.next === "hr" ? "✅ تم توقيعك وتحويل المستند للموارد البشرية" : "✅ تم توقيعك واعتُمد المستند", "ok");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر التوقيع", "err");
    } finally {
      setBusy("");
    }
  }
  async function reject(x: ManagerPending) {
    const r = (rej[x.request_id] ?? "").trim();
    if (r.length < 3) return toast("اكتب سبب الرفض", "err");
    setBusy(x.request_id);
    try { await docs.managerSign(x.request_id, { action: "rejected", reason: r }); toast("تم الرفض وإبلاغ الموظف", "ok"); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "تعذر", "err"); } finally { setBusy(""); }
  }
  return (
    <Card>
      <CardTitle icon="file">مستندات بانتظار توقيعي كمدير ({list.length})</CardTitle>
      {list.map((x) => (
        <View key={x.request_id} style={{ backgroundColor: t.c2, borderWidth: 1, borderColor: t.bd, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <T weight={700}>{x.employee_name || x.employee_id}</T>
          <T size={10.5} color={t.mu}>وقّعه الموظف {dmy(x.emp_signed_at)}</T>
          <Btn kind="ghost" title="عرض المستند" onPress={() => router.push({ pathname: "/document/[id]", params: { id: x.document_id, title: x.employee_name } })} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Btn kind="success" title="✍️ وقّع واعتمد" busy={busy === x.request_id} onPress={() => sign(x)} style={{ flex: 1 }} />
            <Btn kind="danger" title="رفض" onPress={() => setRej({ ...rej, [x.request_id]: rej[x.request_id] == null ? "" : undefined })} style={{ flex: 1 }} />
          </View>
          {rej[x.request_id] != null ? (
            <>
              <Input value={rej[x.request_id]} onChangeText={(v) => setRej({ ...rej, [x.request_id]: v })} placeholder="سبب الرفض (إجباري)" multiline />
              <Btn kind="danger" title="تأكيد الرفض" onPress={() => reject(x)} />
            </>
          ) : null}
        </View>
      ))}
    </Card>
  );
}
