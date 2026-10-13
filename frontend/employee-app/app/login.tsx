// Login (#sc-login): ARIBA wordmark, «تطبيق الموظف», username / password with the eye toggle (V001), «دخول».
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Icon } from "@/components/icons";
import { T } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { fonts, useTheme } from "@/theme";

export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (hide.current) clearTimeout(hide.current); }, []);

  function toggle() {
    setShow((s) => !s);
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setShow(false), 15000); // legacy: auto-hide after 15 s
  }

  async function submit() {
    setError(null);
    if (!username.trim() || !password) return setError("بيانات الدخول غير صحيحة");
    setBusy(true);
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error && e.message && !e.message.startsWith("HTTP") ? (e.message === "Invalid username or password" ? "بيانات الدخول غير صحيحة" : e.message) : "بيانات الدخول غير صحيحة");
    } finally {
      setBusy(false);
    }
  }

  const input = [styles.input, { borderColor: t.bd, backgroundColor: t.c2, color: t.tx, fontFamily: fonts.medium }];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center", alignItems: "center", padding: 20 }}>
      <View style={[styles.box, { backgroundColor: t.c }]}>
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <T size={36} weight={900} color={t.bl} style={{ letterSpacing: 3, marginBottom: 4 }}>ARIBA</T>
          <T size={13} color={t.mu}>تطبيق الموظف</T>
        </View>
        <T size={11} weight={600} color={t.mu} style={{ marginBottom: 4 }}>اسم المستخدم</T>
        <TextInput value={username} onChangeText={setUsername} placeholder="EMPxxx" placeholderTextColor={t.dm} autoCapitalize="none" autoCorrect={false} style={input} />
        <T size={11} weight={600} color={t.mu} style={{ marginBottom: 4 }}>كلمة المرور</T>
        <View>
          <TextInput value={password} onChangeText={setPassword} placeholder="****" placeholderTextColor={t.dm} secureTextEntry={!show}
            onSubmitEditing={submit} style={[input, { paddingLeft: 40 }]} />
          <Pressable onPress={toggle} style={styles.eye}><Icon name="eye" size={18} color={show ? "#29B35E" : "#8a94a0"} /></Pressable>
        </View>
        {error ? <T size={12} color={t.rd} center style={{ marginBottom: 8 }}>{error}</T> : null}
        <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, { backgroundColor: t.dark ? "#29B35E" : "#014D3D", opacity: pressed || busy ? 0.8 : 1 }]}>
          <T size={15} weight={700} color="#fff">{busy ? "..." : "دخول"}</T>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", maxWidth: 360, borderRadius: 20, paddingVertical: 36, paddingHorizontal: 28, borderWidth: 1, borderColor: "rgba(59,130,246,.2)",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 32, shadowOffset: { width: 0, height: 24 }, elevation: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, marginBottom: 12, textAlign: "right" },
  eye: { position: "absolute", left: 0, top: 0, bottom: 12, width: 40, alignItems: "center", justifyContent: "center" },
  btn: { borderRadius: 12, padding: 13, alignItems: "center", marginTop: 4 },
});
