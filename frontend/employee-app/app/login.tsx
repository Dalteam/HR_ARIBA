import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, Card, ErrorText, Field, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/theme";

export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!username.trim() || !password) return setError("أدخل اسم المستخدم وكلمة المرور");
    setBusy(true);
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تسجيل الدخول");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center", padding: 16 }}
    >
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <Image source={require("../assets/brand/ariba-logo.png")} style={{ width: 120, height: 60 }} resizeMode="contain" />
        <Txt bold style={{ fontSize: 18, marginTop: 10 }}>تطبيق الموظف - اريبا</Txt>
      </View>
      <Card>
        <Field
          label="اسم المستخدم"
          placeholder="EMPxxx"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <Field label="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        <ErrorText message={error} />
        <Button title="دخول" onPress={submit} busy={busy} />
      </Card>
    </KeyboardAvoidingView>
  );
}
