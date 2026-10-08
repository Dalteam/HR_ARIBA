// One form: the HTML HR sent + موافقة / اعتراض (reason ≥ 3 letters), legacy V71.
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { Loading, Txt } from "@/components/ui";
import { ApiError, letters } from "@/lib/api";
import { fonts, useTheme } from "@/theme";

export default function LetterScreen() {
  const t = useTheme();
  const { id, title, status } = useLocalSearchParams<{ id: string; title?: string; status?: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    letters.html(id).then(setHtml).catch(() => setHtml("<p style='font-family:sans-serif;text-align:center'>تعذر تحميل النموذج</p>"));
  }, [id]);

  async function respond(action: "approved" | "rejected") {
    if (action === "rejected" && reason.trim().length < 3) {
      Alert.alert("❌", "اكتب سبب الاعتراض (3 أحرف على الأقل)");
      return;
    }
    setBusy(true);
    try {
      await letters.respond(id, action, action === "rejected" ? reason.trim() : undefined);
      Alert.alert(action === "approved" ? "✅ تمت الموافقة" : "تم إرسال الاعتراض");
      router.back();
    } catch (e) {
      Alert.alert("❌", e instanceof ApiError ? e.message : "تعذر الإرسال");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ headerShown: true, title: title ?? "النموذج", headerTitleStyle: { fontFamily: fonts.bold } }} />
      {html === null ? <Loading /> : <WebView originWhitelist={["*"]} source={{ html }} style={{ flex: 1 }} />}
      {status === "pending" ? (
        <View style={[styles.bar, { backgroundColor: t.c, borderTopColor: t.bd }]}>
          {rejecting ? (
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="سبب الاعتراض"
              placeholderTextColor={t.dm}
              style={[styles.input, { borderColor: t.bd, backgroundColor: t.c2, color: t.tx, fontFamily: fonts.medium }]}
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable disabled={busy} onPress={() => respond("approved")} style={[styles.btn, { backgroundColor: t.gr }]}>
              <Txt bold style={{ color: "#fff" }}>موافقة</Txt>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => (rejecting ? respond("rejected") : setRejecting(true))}
              style={[styles.btn, { backgroundColor: t.rd }]}
            >
              <Txt bold style={{ color: "#fff" }}>{rejecting ? "إرسال الاعتراض" : "اعتراض"}</Txt>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: 12, gap: 8, borderTopWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, textAlign: "right" },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
});
