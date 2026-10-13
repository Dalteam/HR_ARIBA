// One request line (legacy renderLv item: type, status badge, 🗑, detail, notes) + the legacy type list.
import { Pressable, View } from "react-native";
import { Badge, T } from "./ui";
import { Icon } from "./icons";
import type { MyRequest, RequestType } from "@/lib/api";
import { requestDetail, statusText } from "@/lib/labels";
import { useTheme } from "@/theme";

// Legacy LVL order (06-leave-types.js + V114 forgot_punch). Overtime has its own tab.
export const TYPES: [RequestType, string][] = [
  ["annual", "سنوية"], ["sick", "مرضية"], ["emergency", "اضطرارية"], ["death", "وفاة"], ["marriage", "زواج"], ["maternity", "أمومة"],
  ["paternity", "أبوة"], ["umrah", "عمرة"], ["hajj", "حج"], ["remote", "عن بعد"], ["permission", "استئذان"],
  ["maternity_permission", "استئذان أمومة"], ["early_leave", "خروج مبكر"], ["advance", "سلفة"], ["mission", "مهمة خارجية"], ["forgot_punch", "نسيان بصمة"],
];
export const NAME = Object.fromEntries([...TYPES, ["overtime", "عمل إضافي"]]) as Record<string, string>;
export const HOURLY: RequestType[] = ["permission", "maternity_permission", "early_leave"];
const TONE = { gr: "bg", rd: "br", am: "ba" } as const;

export function RequestItem({ r, onDelete }: { r: MyRequest; onDelete?: (r: MyRequest) => void }) {
  const t = useTheme();
  const st = statusText(r);
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.bd }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <T size={12} weight={700}>{NAME[r.type] ?? r.type}</T>
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
      {r.law_note ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}><Icon name="info" size={13} color={t.am} stroke={2} /><T size={10} color={t.am} style={{ flexShrink: 1 }}>{r.law_note}</T></View> : null}
      {r.rejection_reason ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}><Icon name="xCircle" size={13} color={t.rd} stroke={2} /><T size={11} color={t.rd} style={{ flexShrink: 1 }}>سبب الرفض: {r.rejection_reason}</T></View> : null}
    </View>
  );
}

