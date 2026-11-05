// مستهدفات / تقييم عضو في فريقي — their GoalOverlay (MgrTeam) with TargetsEditor and EvalForm: choose the period,
// add / edit / delete targets (the employee is notified), and evaluate: the period's targets become items scored by
// their progress, saved as a draft, sent for approval, then approved (the employee gets the result).
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { Badge, Btn, Card, Empty, Input, Loading, T, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { curKey, keyLabel, overallOf, pct, PT, ratingOf, shiftKey, type PeriodType } from "@/lib/goals";
import { goals, type EvalItem, type Target } from "@/lib/port";
import { useTheme } from "@/theme";

function PeriodPick({ type, keyv, onChange }: { type: PeriodType; keyv: string; onChange: (t: PeriodType, k: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(Object.keys(PT) as PeriodType[]).map((k) => (
          <Pressable key={k} onPress={() => onChange(k, curKey(k))} style={{ flex: 1, padding: 7, borderRadius: 9, borderWidth: 2, borderColor: k === type ? t.bl : t.bd, backgroundColor: t.c2 }}>
            <T size={12} center weight={k === type ? 700 : 500}>{PT[k]}</T>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Btn kind="ghost" title="›" onPress={() => onChange(type, shiftKey(type, keyv, -1))} style={{ marginTop: 0, paddingHorizontal: 14 }} />
        <T weight={700} center style={{ flex: 1 }}>{keyLabel(type, keyv)}</T>
        <Btn kind="ghost" title="‹" onPress={() => onChange(type, shiftKey(type, keyv, 1))} style={{ marginTop: 0, paddingHorizontal: 14 }} />
      </View>
    </View>
  );
}

export default function TeamGoals() {
  const { id, name, mode } = useLocalSearchParams<{ id: string; name: string; mode: "goals" | "eval" }>();
  const [type, setType] = useState<PeriodType>("quarterly");
  const [key, setKey] = useState(curKey("quarterly"));
  const onPeriod = (t: PeriodType, k: string) => { setType(t); setKey(k); };
  // opened without an employee (e.g. a typed URL): nothing to load, and the server would answer 403 for employee_id=undefined
  if (!id) return <Screen title="🎯 المستهدفات"><Card><T>اختر موظفاً من «فريقي» أولاً.</T></Card></Screen>;
  return (
    <Screen title={(mode === "eval" ? "⭐ تقييم " : "🎯 مستهدفات ") + (name ?? "")}>
      <Card>
        <PeriodPick type={type} keyv={key} onChange={onPeriod} />
        {mode === "eval" ? <EvalForm key={type + key} id={id} type={type} keyv={key} /> : <Targets id={id} name={name ?? ""} type={type} keyv={key} />}
      </Card>
    </Screen>
  );
}

const blank = { title: "", description: "", unit: "", target_value: "", actual_value: "", weight: "1", status: "active" };
type Form = typeof blank & { id?: string };

function Targets({ id, name, type, keyv }: { id: string; name: string; type: PeriodType; keyv: string }) {
  const t = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Target[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => goals.targets(id, keyv.slice(0, 4)).then((r) => setRows(r.targets)).catch((e) => { setRows([]); toast(e.message, "err"); }), [id, keyv, toast]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const shown = (rows ?? []).filter((x) => x.period_type === type && x.period_key === keyv);
  async function save() {
    if (!form) return;
    if (!form.title.trim()) return toast("اكتب عنوان المستهدف", "err");
    setBusy(true);
    try {
      await goals.saveTarget({ id: form.id, employee_id: id, period_type: type, period_key: keyv, title: form.title.trim(), description: form.description,
        unit: form.unit, target_value: form.target_value === "" ? null : Number(form.target_value), actual_value: form.actual_value === "" ? null : Number(form.actual_value),
        weight: Number(form.weight) || 1, status: form.status });
      toast("✓ حُفظ المستهدف" + (form.id ? "" : " وأُشعر الموظف"), "ok");
      setForm(null);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر الحفظ", "err");
    } finally {
      setBusy(false);
    }
  }
  const del = (x: Target) => Alert.alert("حذف المستهدف؟", x.title, [{ text: "إلغاء", style: "cancel" },
    { text: "حذف", style: "destructive", onPress: async () => { try { await goals.deleteTarget(x.id); await load(); } catch (e) { toast(e instanceof ApiError ? e.message : "تعذر الحذف", "err"); } } }]);
  const set = (k: keyof Form) => (v: string) => setForm((p) => (p ? { ...p, [k]: v } : p));
  return (
    <View>
      <Btn title="+ مستهدف جديد" onPress={() => setForm({ ...blank })} style={{ marginTop: 0, marginBottom: 8 }} />
      {rows === null ? <Loading /> : !shown.length ? <Empty text={`لا مستهدفات (${PT[type]} — ${keyLabel(type, keyv)}) لـ ${name}`} /> : null}
      {shown.map((x) => { const p = pct(x); return (
        <View key={x.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.bd }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <T weight={700} style={{ flex: 1 }}>{x.title}</T>
            {x.status === "done" ? <Badge text="منجز" tone="bg" /> : null}
            {p != null ? <T size={11}>{p}%</T> : null}
          </View>
          {x.description ? <T size={11} color={t.mu}>{x.description}</T> : null}
          <T size={11} color={t.mu}>{`المطلوب: ${x.target_value ?? "—"} ${x.unit ?? ""} · المنجز: ${x.actual_value ?? 0} · الوزن ${x.weight}`}</T>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
            <Btn kind="ghost" title="تعديل" style={{ flex: 1, marginTop: 0 }} onPress={() => setForm({ id: x.id, title: x.title, description: x.description ?? "", unit: x.unit ?? "",
              target_value: x.target_value == null ? "" : String(x.target_value), actual_value: x.actual_value == null ? "" : String(x.actual_value), weight: String(x.weight), status: x.status })} />
            <Btn kind="danger" title="حذف" style={{ flex: 1, marginTop: 0 }} onPress={() => del(x)} />
          </View>
        </View>); })}
      {form ? (
        <View style={{ marginTop: 12, borderWidth: 1, borderColor: t.bd, borderRadius: 10, padding: 10, backgroundColor: t.c2 }}>
          <T weight={700} size={12}>{(form.id ? "تعديل مستهدف" : "مستهدف جديد") + ` — ${PT[type]} ${keyLabel(type, keyv)}`}</T>
          <Input label="العنوان *" value={form.title} onChangeText={set("title")} />
          <Input label="الوصف" value={form.description} onChangeText={set("description")} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Input label="القيمة المستهدفة" value={form.target_value} onChangeText={set("target_value")} keyboardType="decimal-pad" />
            <Input label="الوحدة" value={form.unit} onChangeText={set("unit")} />
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Input label="المنجز حتى الآن" value={form.actual_value} onChangeText={set("actual_value")} keyboardType="decimal-pad" />
            <Input label="الوزن" value={form.weight} onChangeText={set("weight")} keyboardType="decimal-pad" />
          </View>
          {form.id ? <Btn kind="ghost" title={form.status === "done" ? "الحالة: منجز" : "الحالة: نشط"} onPress={() => set("status")(form.status === "done" ? "active" : "done")} /> : null}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Btn title="حفظ" onPress={save} busy={busy} style={{ flex: 1 }} />
            <Btn kind="ghost" title="إلغاء" onPress={() => setForm(null)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const SB = { draft: ["مسودة", "ba"], pending: ["بانتظار الاعتماد", "bk"], approved: ["معتمد", "bg"] } as const;

function EvalForm({ id, type, keyv }: { id: string; type: PeriodType; keyv: string }) {
  const t = useTheme();
  const toast = useToast();
  const [d, setD] = useState<Awaited<ReturnType<typeof goals.evaluation>> | null>(null);
  const [items, setItems] = useState<EvalItem[]>([]);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setD(null);
    try {
      const r = await goals.evaluation(id, type, keyv);
      setD(r);
      if (r.evaluation?.items?.length) { setItems(r.evaluation.items); setComments(r.evaluation.comments ?? ""); }
      else {
        setItems(r.targets.map((x) => ({ target_id: x.id, title: x.title, target: x.target_value, unit: x.unit ?? "", actual: x.actual_value, weight: x.weight, score: pct(x) ?? 0, comment: "" })));
        setComments("");
      }
    } catch (e) { toast(e instanceof ApiError ? e.message : "تعذر التحميل", "err"); }
  }, [id, type, keyv, toast]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Loading />;
  const ev = d.evaluation, locked = ev?.status === "approved", overall = overallOf(items);
  const up = (i: number, k: keyof EvalItem, v: string) => setItems((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function act(submit: boolean) {
    setBusy(true);
    try { await goals.saveEvaluation(id, type, keyv, items, comments, submit); toast(submit ? "✓ أُرسل التقييم للاعتماد" : "✓ حُفظت المسودة", "ok"); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "تعذر الحفظ", "err"); } finally { setBusy(false); }
  }
  const approve = () => Alert.alert("اعتماد التقييم نهائياً؟", "سيصل الموظف إشعار وبريد إلكتروني بالنتيجة.", [{ text: "إلغاء", style: "cancel" }, { text: "اعتماد", onPress: async () => {
    setBusy(true);
    try { await goals.approve(ev!.id); toast("✅ اعتُمد التقييم وأُرسلت النتيجة للموظف", "ok"); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "تعذر الاعتماد", "err"); } finally { setBusy(false); }
  } }]);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {ev ? <Badge text={SB[ev.status][0]} tone={SB[ev.status][1]} /> : null}
        <T size={12} style={{ flex: 1 }}>النتيجة الإجمالية: <T weight={800} size={16} color={t.gr}>{overall == null ? "—" : overall + "%"}</T></T>
        {overall != null ? <Badge text={ratingOf(overall)} tone="bg" /> : null}
      </View>
      {!items.length ? <Empty text={`لا مستهدفات للفترة ${PT[type]} ${keyLabel(type, keyv)} — أضف مستهدفات أو بنداً يدوياً.`} /> : null}
      {items.map((it, i) => (
        <View key={i} style={{ borderWidth: 1, borderColor: t.bd, borderRadius: 10, padding: 10, marginBottom: 8 }}>
          {it.manual ? <Input placeholder="عنوان البند" value={String(it.title)} editable={!locked} onChangeText={(v) => up(i, "title", v)} /> : <T weight={700}>{it.title}</T>}
          {!it.manual ? <T size={11} color={t.mu}>{`المطلوب ${it.target ?? "—"} ${it.unit ?? ""} · المنجز ${it.actual ?? 0}`}</T> : null}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Input label="الدرجة %" value={String(it.score)} editable={!locked} keyboardType="decimal-pad" onChangeText={(v) => up(i, "score", v)} />
            <Input label="الوزن" value={String(it.weight)} editable={!locked && !!it.manual} keyboardType="decimal-pad" onChangeText={(v) => up(i, "weight", v)} />
          </View>
          <Input placeholder="ملاحظة على البند (اختياري)" value={it.comment ?? ""} editable={!locked} onChangeText={(v) => up(i, "comment", v)} />
          {!locked && it.manual ? <Btn kind="ghost" title="✕ حذف البند" onPress={() => setItems((a) => a.filter((_, j) => j !== i))} /> : null}
        </View>
      ))}
      {!locked ? <Btn kind="ghost" title="+ بند يدوي" onPress={() => setItems((a) => [...a, { title: "", weight: 1, score: 0, comment: "", manual: true }])} style={{ marginTop: 0 }} /> : null}
      <Input label="ملاحظات عامة (تصل للموظف مع النتيجة)" value={comments} editable={!locked} onChangeText={setComments} multiline />
      {!locked ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          <Btn kind="ghost" title="حفظ كمسودة" onPress={() => act(false)} busy={busy} disabled={!items.length} style={{ flex: 1 }} />
          <Btn title="إرسال للاعتماد" onPress={() => act(true)} busy={busy} disabled={!items.length} style={{ flex: 1 }} />
        </View>
      ) : null}
      {ev && ev.status === "pending" && d.can_approve ? <Btn kind="success" title="✅ اعتماد نهائي" onPress={approve} busy={busy} /> : null}
    </View>
  );
}
