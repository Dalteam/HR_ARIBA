// المهام والاجتماعات / توفر الفريق — their TeamTasks (pages/team/index.jsx): team availability (consecutive leaves merged,
// remote work is not an absence, "leave soon" = within 14 days), send a task or a meeting invitation to the selected
// people, and the inbox / sent lists with done · accept · decline (with a reason) · cancel.
import { dateLocale } from "@/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "@/components/screen";
import { Icon } from "@/components/icons";
import { Badge, Btn, Card, Empty, Input, Loading, PickerField, Sheet, T, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { tasks, type Availability, type Task } from "@/lib/port";
import { useTheme } from "@/theme";

const D = (s: string) => { const p = s.slice(0, 10).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addD = (s: string, n: number) => iso(D(s) + n * 864e5);
const fmt = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
// Sunday–Thursday working week (their isLeaveWorkday without the holiday table).
const isWork = (s: string) => { const d = new Date(D(s)).getUTCDay(); return d !== 5 && d !== 6; };
const nextWork = (s: string) => { let d = addD(s, 1), i = 0; while (!isWork(d) && i++ < 10) d = addD(d, 1); return d; };
type Span = { from: string; to: string; types: string[]; days: number };
function merge(ls: Availability["items"][number]["leaves"]): Span[] {
  const a = ls.filter((l) => l.type !== "remote").map((l) => ({ from: l.from.slice(0, 10), to: l.to.slice(0, 10), types: [l.type], days: 0 }))
    .sort((x, y) => (x.from < y.from ? -1 : 1));
  const out: Span[] = [];
  a.forEach((l) => { const p = out[out.length - 1]; if (p && l.from <= nextWork(p.to)) { if (l.to > p.to) p.to = l.to; p.types = p.types.concat(l.types); } else out.push(l); });
  out.forEach((l) => { l.days = Math.round((D(l.to) - D(l.from)) / 864e5) + 1; });
  return out;
}
function stateOf(e: Availability["items"][number], day: string) {
  let cur: Span | null = null, nxt: Span | null = null;
  merge(e.leaves).forEach((l) => { if (!cur && l.from <= day && day <= l.to) cur = l; else if (!nxt && l.from > day) nxt = l; });
  const n = nxt as Span | null;
  return { cur: cur as Span | null, nxt: n, st: cur ? "leave" : n && n.from <= addD(day, 14) ? "soon" : "avail" };
}
const LT: Record<string, string> = { annual: "سنوية", sick: "مرضية", emergency: "طارئة", death: "وفاة", marriage: "زواج", maternity: "وضع", paternity: "أبوة", umrah: "عمرة", hajj: "حج", remote: "عمل عن بعد" };
const ST: Record<Task["status"], [string, "ba" | "bg" | "br" | "bk"]> = { open: ["مفتوحة", "ba"], done: ["تم", "bg"], accepted: ["مقبول", "bg"], declined: ["اعتذار", "br"], cancelled: ["ملغاة", "bk"] };

export default function TasksScreen() {
  const t = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<"team" | "inbox" | "sent">("team");
  const [av, setAv] = useState<Availability | null>(null);
  const [inbox, setInbox] = useState<Task[] | null>(null);
  const [sent, setSent] = useState<Task[] | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [compose, setCompose] = useState<"task" | "meeting" | null>(null);
  const [decl, setDecl] = useState<Task | null>(null);
  const [why, setWhy] = useState("");

  const refresh = useCallback(async () => {
    tasks.availability().then(setAv).catch(() => setAv({ items: [], today: iso(Date.now()), allowed: false }));
    tasks.list("inbox").then((r) => setInbox(r.items)).catch(() => setInbox([]));
    tasks.list("sent").then((r) => setSent(r.items)).catch(() => setSent([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function act(task: Task, st: Task["status"], note?: string) {
    try { await tasks.update(task.id, st, note); toast("✓ تم", "ok"); refresh(); } catch (e) { toast(e instanceof ApiError ? e.message : "تعذر", "err"); }
  }
  const rows = useMemo(() => (av?.items ?? []).map((e) => ({ e, s: stateOf(e, av!.today) })), [av]);
  const ids = Object.keys(sel).filter((k) => sel[k]);
  const openN = (inbox ?? []).filter((x) => x.status === "open").length;

  const card = (x: Task, isIn: boolean) => (
    <View key={x.id} style={{ borderWidth: 1, borderColor: t.bd, borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <T weight={800} style={{ flex: 1 }}>{(x.kind === "meeting" ? "📅 " : "✓ ") + x.title}</T>
        <Badge text={ST[x.status][0]} tone={ST[x.status][1]} />
      </View>
      <T size={12} color={t.mu} style={{ marginVertical: 3 }}>
        {(isIn ? "من: " + (x.from_name ?? "") : "إلى: " + (x.to_name ?? "")) + " • "
          + (x.kind === "meeting" && x.start_at ? new Date(x.start_at).toLocaleString(dateLocale(), { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : x.due_date ? "الموعد: " + fmt(x.due_date) : "")
          + (x.location ? " • " + x.location : "")}
      </T>
      {x.details ? <T size={12.5}>{x.details}</T> : null}
      {x.response_note ? <T size={11.5} color={t.mu}>{x.response_note}</T> : null}
      {isIn && x.status === "open" ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
          {x.kind === "meeting"
            ? <><Btn title="قبول" onPress={() => act(x, "accepted")} style={{ flex: 1 }} /><Btn kind="ghost" title="اعتذار" onPress={() => { setWhy(""); setDecl(x); }} style={{ flex: 1 }} /></>
            : <Btn title="تم الإنجاز" onPress={() => act(x, "done")} style={{ flex: 1 }} />}
        </View>
      ) : null}
      {!isIn && x.status === "open" ? <Btn kind="ghost" title="إلغاء" onPress={() => act(x, "cancelled")} style={{ marginTop: 6 }} /> : null}
    </View>
  );

  return (
    <Screen title="المهام والاجتماعات / توفر الفريق">
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
        {([["team", "الفريق والتوفر"], ["inbox", "الوارد" + (openN ? ` (${openN})` : "")], ["sent", "المرسل"]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: t.bd, backgroundColor: tab === k ? "#014D3D" : "transparent" }}>
            <T size={13} weight={700} color={tab === k ? "#fff" : t.tx}>{l}</T>
          </Pressable>
        ))}
      </View>
      {tab === "team" ? (
        !av ? <Loading /> : !av.allowed ? <Empty text="هذه الصفحة للمدراء والإدارة" /> : (
          <Card>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <Badge text={`متاح: ${rows.filter((r) => r.s.st !== "leave").length}`} tone="bg" />
              <Badge text={`في إجازة: ${rows.filter((r) => r.s.st === "leave").length}`} tone="br" />
              <Badge text={`سيبدأ إجازة خلال 14 يوم: ${rows.filter((r) => r.s.st === "soon").length}`} tone="ba" />
            </View>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
              <Btn title={`✓ إرسال مهمة${ids.length ? ` (${ids.length})` : ""}`} onPress={() => (ids.length ? setCompose("task") : toast("اختر موظفاً على الأقل", "err"))} style={{ flex: 1 }} />
              <Btn title={`📅 دعوة اجتماع${ids.length ? ` (${ids.length})` : ""}`} onPress={() => (ids.length ? setCompose("meeting") : toast("اختر موظفاً على الأقل", "err"))} style={{ flex: 1 }} />
            </View>
            {!rows.length ? <Empty text="لا نتائج" /> : null}
            {rows.map(({ e, s }) => (
              <Pressable key={e.id} onPress={() => setSel({ ...sel, [e.id]: !sel[e.id] })}
                style={{ flexDirection: "row", gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.bd, backgroundColor: sel[e.id] ? "rgba(41,179,94,.08)" : "transparent" }}>
                <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.6, borderColor: sel[e.id] ? "#29B35E" : t.mu, backgroundColor: sel[e.id] ? "#29B35E" : "transparent", alignItems: "center", justifyContent: "center" }}>{sel[e.id] ? <Icon name="check" size={13} color="#012A21" stroke={3} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <T weight={700}>{e.name}</T>
                  <T size={11.5} color={t.mu}>{[e.job, e.dept].filter(Boolean).join(" • ")}</T>
                  {s.cur ? <T size={12} color={t.mu}>{`من ${fmt(s.cur.from)} إلى ${fmt(s.cur.to)} — ${s.cur.days} يوم (${LT[s.cur.types[0]] ?? s.cur.types[0]}) • يعود للعمل: ${fmt(nextWork(s.cur.to))}`}</T>
                    : s.nxt ? <T size={12} color={t.mu}>{`إجازته القادمة: من ${fmt(s.nxt.from)} إلى ${fmt(s.nxt.to)} — ${s.nxt.days} يوم (${LT[s.nxt.types[0]] ?? s.nxt.types[0]})`}</T> : null}
                </View>
                <Badge text={s.st === "leave" ? "في إجازة" : s.st === "soon" ? "متاح — إجازة قريبة" : "متاح"} tone={s.st === "leave" ? "br" : s.st === "soon" ? "ba" : "bg"} />
              </Pressable>
            ))}
          </Card>
        )
      ) : null}
      {tab === "inbox" ? (!inbox ? <Loading /> : !inbox.length ? <Empty text="لا شيء هنا" /> : inbox.map((x) => card(x, true))) : null}
      {tab === "sent" ? (!sent ? <Loading /> : !sent.length ? <Empty text="لا شيء هنا" /> : sent.map((x) => card(x, false))) : null}
      {compose ? <Compose kind={compose} ids={ids} onClose={() => setCompose(null)} onSent={() => { setCompose(null); setSel({}); refresh(); }} /> : null}
      <Sheet visible={!!decl} onClose={() => setDecl(null)}>
        <T weight={800} size={15}>سبب الاعتذار</T>
        <Input label="اختياري" value={why} onChangeText={setWhy} multiline />
        <Btn title="اعتذار" onPress={() => { const x = decl!; setDecl(null); act(x, "declined", why.trim() || undefined); }} style={{ marginTop: 10 }} />
      </Sheet>
    </Screen>
  );
}

function Compose({ kind, ids, onClose, onSent }: { kind: "task" | "meeting"; ids: string[]; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loc, setLoc] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!title.trim()) return toast("اكتب العنوان", "err");
    const body: Parameters<typeof tasks.send>[0] = { to: ids, kind, title: title.trim(), details: details.trim() || null };
    if (kind === "meeting") {
      if (!date || !from) return toast("حدد وقت الاجتماع", "err");
      body.start = `${date}T${from}:00+03:00`;
      if (to) body.end = `${date}T${to}:00+03:00`;
      body.location = loc.trim() || null;
    } else body.due = due || null;
    setBusy(true);
    try { const r = await tasks.send(body); toast(`✓ أُرسلت إلى ${r.sent ?? ids.length} موظف`, "ok"); onSent(); }
    catch (e) { setBusy(false); toast(e instanceof ApiError ? e.message : "تعذر الإرسال", "err"); }
  }
  return (
    <Sheet visible onClose={onClose}>
      <T weight={800} size={15}>{kind === "meeting" ? "📅 دعوة اجتماع" : "✓ مهمة جديدة"} ({ids.length})</T>
      <Input label="العنوان" value={title} onChangeText={setTitle} />
      <Input label="التفاصيل" value={details} onChangeText={setDetails} multiline />
      {kind === "meeting" ? (
        <>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <PickerField label="التاريخ" value={date} onChange={setDate} mode="date" />
            <PickerField label="من" value={from} onChange={setFrom} mode="time" />
            <PickerField label="إلى" value={to} onChange={setTo} mode="time" />
          </View>
          <Input label="المكان / الرابط" value={loc} onChangeText={setLoc} />
        </>
      ) : <PickerField label="الموعد النهائي (اختياري)" value={due} onChange={setDue} mode="date" />}
      <Btn title="إرسال" onPress={send} busy={busy} style={{ marginTop: 10 }} />
    </Sheet>
  );
}
