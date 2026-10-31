// رفع مستند — their DocUpload: HR reviews it; once approved it is saved to my file and «وثائقي».
import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Btn, Card, Input, Label, T, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useData } from "@/lib/data";
import { pickFile, type Picked } from "@/lib/files";
import { submitRequest } from "@/lib/port";
import { useTheme } from "@/theme";
import { goBack } from "@/lib/nav";

export const DOC_TYPES: [string, string][] = [["id", "الهوية / الإقامة"], ["passport", "جواز السفر"], ["experience", "شهادة خبرة"], ["cv", "السيرة الذاتية"],
  ["national_address", "العنوان الوطني"], ["contract", "العقد"], ["graduation", "شهادة التخرج"], ["social_insurance", "شهادة التأمينات الاجتماعية"], ["other", "أخرى"]];

export default function UploadDocument() {
  const t = useTheme();
  const toast = useToast();
  const { refresh } = useData();
  const [type, setType] = useState("id");
  const [other, setOther] = useState("");
  const [file, setFile] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!file) return toast("اختر الملف", "err");
    const label = type === "other" ? other.trim() || "مستند آخر" : DOC_TYPES.find((x) => x[0] === type)![1];
    setBusy(true);
    try {
      await submitRequest("document", { doc_type: type, doc_label: label, notes: other }, file);
      toast("✅ أُرسل المستند للموارد البشرية للمراجعة", "ok");
      await refresh();
      goBack();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر الإرسال", "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="📤 رفع مستند">
      <Card>
        <T size={11} color={t.mu}>يُراجَع من الموارد البشرية، وعند الاعتماد يُحفظ تلقائياً في ملفك ووثائقي.</T>
        <Label>نوع المستند</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {DOC_TYPES.map(([k, l]) => (
            <Pressable key={k} onPress={() => setType(k)} style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, borderWidth: 2,
              borderColor: k === type ? t.bl : t.bd, backgroundColor: t.c2 }}>
              <T size={11} weight={k === type ? 700 : 500}>{l}</T>
            </Pressable>
          ))}
        </View>
        {type === "other" ? <Input label="اسم المستند" value={other} onChangeText={setOther} /> : null}
        <Btn kind="ghost" title={file ? `📎 ${file.name}` : "الملف (PDF / صورة)"} style={{ marginTop: 10 }}
          onPress={async () => { try { setFile(await pickFile()); } catch (e) { toast(e instanceof Error ? e.message : "تعذر قراءة الملف", "err"); } }} />
        <Btn title="إرسال للمراجعة" onPress={go} busy={busy} style={{ marginTop: 10 }} />
      </Card>
    </Screen>
  );
}
