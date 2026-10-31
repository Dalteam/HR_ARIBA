// طلب تعديل بياناتي — their EditData: the change applies only after HR approves; optional supporting file.
import { useState } from "react";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Btn, Card, Input, T, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useData } from "@/lib/data";
import { pickFile, type Picked } from "@/lib/files";
import { submitRequest } from "@/lib/port";
import { useTheme } from "@/theme";
import { goBack } from "@/lib/nav";

const FIELDS: [string, string, "phone-pad" | "email-address" | "default"][] = [
  ["mobile", "الجوال", "phone-pad"], ["email", "البريد الإلكتروني", "email-address"], ["address", "العنوان", "default"], ["city", "المدينة", "default"],
  ["nameEn", "الاسم بالإنجليزي", "default"], ["emergencyName", "اسم جهة الطوارئ", "default"], ["emergencyPhone", "جوال الطوارئ", "phone-pad"],
];

export default function ProfileEdit() {
  const t = useTheme();
  const toast = useToast();
  const { employee: e, refresh } = useData();
  const cur: Record<string, string> = { mobile: e?.mobile ?? "", email: e?.email ?? "", nameEn: e?.name_en ?? "" };
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, cur[k] ?? ""])));
  const [file, setFile] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    const changes: Record<string, string> = {};
    for (const [k] of FIELDS) { const nv = (v[k] ?? "").trim(); if (nv && nv !== (cur[k] ?? "")) changes[k] = nv; }
    if (!Object.keys(changes).length) return toast("لم تغيّر أي بيان", "err");
    setBusy(true);
    try {
      await submitRequest("profile_edit", { changes }, file);
      toast("✅ أُرسل طلب التعديل للموارد البشرية", "ok");
      await refresh();
      goBack();
    } catch (er) {
      toast(er instanceof ApiError ? er.message : "تعذر الإرسال", "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="✏️ طلب تعديل بياناتي">
      <Card>
        <T size={11} color={t.mu}>التعديل لا يُطبَّق إلا بعد موافقة الموارد البشرية.</T>
        {FIELDS.map(([k, label, kb]) => (
          <Input key={k} label={label} value={v[k]} keyboardType={kb} autoCapitalize="none" onChangeText={(x) => setV((p) => ({ ...p, [k]: x }))} />
        ))}
        <Btn kind="ghost" title={file ? `📎 ${file.name}` : "📎 مرفق داعم (اختياري) — يُحفظ في ملفك بعد الاعتماد"} style={{ marginTop: 10 }}
          onPress={async () => { try { setFile(file ? null : await pickFile()); } catch (er) { toast(er instanceof Error ? er.message : "تعذر قراءة الملف", "err"); } }} />
        <Btn title="إرسال للاعتماد" onPress={go} busy={busy} style={{ marginTop: 10 }} />
      </Card>
    </Screen>
  );
}
