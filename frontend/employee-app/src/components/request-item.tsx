// One request line (legacy renderLv item: type, status badge, 🗑, detail, notes) + the legacy type list.
import { Pressable, View } from "react-native";
import { StatusLine } from "@/components/status-icon";
import { Badge, T } from "./ui";
import { Icon } from "./icons";
import { LeaveIcon, hasLeaveIcon } from "./leave-icon";
import type { LeavePolicy, MyRequest, RequestType } from "@/lib/api";
import { requestDetail, statusText } from "@/lib/labels";
import { useTheme } from "@/theme";

// Legacy LVL order (06-leave-types.js + V114 forgot_punch). Overtime has its own tab.
export const TYPES: [RequestType, string][] = [
  ["annual", "سنوية"], ["sick", "مرضية"], ["emergency", "اضطرارية"], ["death", "وفاة"], ["marriage", "زواج"], ["maternity", "أمومة"],
  ["paternity", "أبوة"], ["umrah", "عمرة"], ["hajj", "حج"], ["remote", "عن بعد"], ["permission", "استئذان"],
  ["maternity_permission", "استئذان أمومة"], ["early_leave", "خروج مبكر"], ["unpaid", "بدون راتب"], ["salary_advance", "راتب مقدم"],
  ["advance", "سلفة"], ["mission", "مهمة خارجية"], ["forgot_punch", "نسيان بصمة"],
];
export const NAME = Object.fromEntries([...TYPES, ["overtime", "عمل إضافي"], ["unpaid", "إجازة بدون راتب"], ["salary_advance", "طلب راتب مقدم"],
  ["iban_change", "تغيير الآيبان"], ["profile_edit", "تعديل بيانات"], ["document", "رفع مستند"], ["leave_cancel", "طلب إلغاء إجازة"]]) as Record<string, string>;
/** The types with a leave row (the API's LEAVE_FORM_TYPES): only these can be cancelled or have their dates changed. */
export const LEAVE_TYPES = new Set(["annual", "sick", "emergency", "death", "marriage", "maternity", "paternity", "umrah", "hajj", "remote", "mission", "unpaid"]);
export const HOURLY: RequestType[] = ["permission", "maternity_permission", "early_leave"];
const TONE = { gr: "bg", rd: "br", am: "ba" } as const;

type Action = [string, ((r: MyRequest) => void) | undefined, string];
type LeaveActions = { policy?: LeavePolicy | null; onCancel?: (r: MyRequest) => void; onEdit?: (r: MyRequest) => void; onCancelRequest?: (r: MyRequest) => void };

export function RequestItem({ r, onDelete, policy, onCancel, onEdit, onCancelRequest }: { r: MyRequest; onDelete?: (r: MyRequest) => void } & LeaveActions) {
  const t = useTheme();
  const st = statusText(r);
  // Stage 14: the design's employee leave actions, each shown only while HR's switch for it is on
  const leave = LEAVE_TYPES.has(r.type) && !r.payload?.cancelled;
  const actions: Action[] = [];
  if (leave && policy && r.status === "pending" && policy.emp_edit_pending) actions.push(["تعديل التواريخ", onEdit, t.bl]);
  if (leave && policy && r.status === "pending" && policy.emp_cancel_pending) actions.push(["إلغاء الطلب", onCancel, t.am]);
  if (leave && policy && r.status === "approved" && !r.cancel_pending && policy.emp_request_cancel_approved) actions.push(["طلب إلغاء الإجازة", onCancelRequest, t.am]);
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.bd }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          {hasLeaveIcon(r.type) ? <LeaveIcon type={r.type} size={30} color={t.dark ? "#29B35E" : "#014D3D"} /> : null}
          <T size={12} weight={700}>{NAME[r.type] ?? r.type}</T>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Badge text={st.text} tone={TONE[st.tone]} />
          {onDelete && r.status !== "approved" ? (
            <Pressable onPress={() => onDelete(r)} style={{ borderWidth: 1, borderColor: t.rd, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Icon name="trash" size={14} color={t.rd} stroke={2} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <T size={11} color={t.mu} style={{ marginTop: 4 }}>{requestDetail(r)}</T>
      {r.notes ? <T size={10} color={t.dm} style={{ marginTop: 3 }}>{r.notes}</T> : null}
      {r.payload?.cancelled ? (
        <StatusLine name="cancelled" size={12} style={{ marginTop: 3 }}><T size={10} color={t.am}>{"أُلغيت هذه الإجازة" + (r.payload.cancelled.reason ? ": " + r.payload.cancelled.reason : "")}</T></StatusLine>
      ) : null}
      {r.cancel_pending ? <StatusLine name="wait" size={12} style={{ marginTop: 3 }}><T size={10} color={t.am}>طلب إلغاء هذه الإجازة قيد الاعتماد</T></StatusLine> : null}
      {actions.some(([, fn]) => fn) ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {actions.map(([label, fn, color]) => (fn ? (
            <Pressable key={label} onPress={() => fn(r)} style={{ borderWidth: 1, borderColor: color, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 3 }}>
              <T size={11} weight={700} color={color}>{label}</T>
            </Pressable>
          ) : null))}
        </View>
      ) : null}
      {r.payload?.submitted_by_manager ? <T size={10} color={t.bl} style={{ marginTop: 3 }}>👤 قدّمه عنك مديرك: {r.payload.submitted_by_name ?? ""}</T> : null}
      {r.payload?.escalated_from && r.status === "pending" ? <T size={10} color={t.am} style={{ marginTop: 3 }}>⏱ انتقل للموارد البشرية لانتهاء مهلة الرد</T> : null}
      {r.payload?.returned && r.status === "pending" ? <T size={10} color={t.am} style={{ marginTop: 3 }}>↩ أعادته الموارد البشرية لمديرك: {r.payload.return_note ?? ""}</T> : null}
      {r.rejection_reason ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}><Icon name="xCircle" size={13} color={t.rd} stroke={2} /><T size={11} color={t.rd} style={{ flexShrink: 1 }}>سبب الرفض: {r.rejection_reason}</T></View> : null}
    </View>
  );
}

