// Login — their EmpLogin: ARIBA wordmark, username / password with the eye toggle, «تذكرني على هذا الجهاز», sign in
// with Face ID / fingerprint (after it was enabled once), «نسيت كلمة المرور؟» (temporary password to the registered
// e-mail, by username or iqama number) and «نسيان هذا الجهاز».
import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Icon } from "@/components/icons";
import { Btn, Sheet, T } from "@/components/ui";
import { InstallHint } from "@/components/install-hint";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { biometricAvailable, biometricEnabled, forgetDevice, remember, remembered } from "@/lib/biometric";
import { fonts, useAppBrand, useTheme } from "@/theme";
import { shadow } from "@/lib/shadow";
import { inputAlign, tr, useLang } from "@/i18n";

export default function Login() {
  const t = useTheme();
  const ab = useAppBrand();
  const { lang, setLang } = useLang();
  const { signIn, signInBiometric } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [rm, setRm] = useState(false);
  const [bio, setBio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; good: boolean } | null>(null);
  const [forgot, setForgot] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const u = await remembered();
      if (u) { setUsername(u); setRm(true); }
      setBio((await biometricAvailable()) && (await biometricEnabled()));
    })();
    return () => { if (hide.current) clearTimeout(hide.current); };
  }, []);

  function toggle() {
    setShow((s) => !s);
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setShow(false), 15000); // their auto-hide after 15 s
  }

  async function submit() {
    setError(null);
    if (!username.trim() || !password) return setError("بيانات الدخول غير صحيحة");
    setBusy(true);
    try {
      await signIn(username.trim(), password);
      await remember(rm ? username.trim().toLowerCase() : null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? "محاولات كثيرة. حاول بعد قليل." : e instanceof ApiError && e.status === 0 ? "تعذر الاتصال بالخادم. تأكد من الإنترنت." : "بيانات الدخول غير صحيحة");
    } finally {
      setBusy(false);
    }
  }

  async function doBio() {
    if (!bio) return setMsg({ t: "سجّل الدخول أولًا ثم فعّل البصمة لهذا الجهاز.", good: false });
    setBusy(true);
    try {
      if (!(await signInBiometric())) setMsg({ t: "تم إلغاء التحقق بالبصمة أو فشل. يمكنك الدخول بكلمة المرور.", good: false });
    } catch {
      setMsg({ t: "انتهت صلاحية الدخول المحفوظ، اكتب كلمة المرور.", good: false });
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    await forgetDevice();
    setRm(false); setBio(false); setUsername("");
    setMsg({ t: "تم نسيان هذا الجهاز", good: true });
  }

  const input = [styles.input, { textAlign: (lang === "en" ? "left" : "right") as "left" | "right", borderColor: t.bd, backgroundColor: t.c2, color: t.tx, fontFamily: fonts.medium }];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Language" onPress={() => { setLang(lang === "en" ? "ar" : "en"); }}
        style={{ position: "absolute", top: 18, left: 18, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c, borderWidth: 1, borderColor: t.bd }}>
        <T size={13} weight={800} color={t.bl}>{lang === "en" ? "العربية" : "English"}</T>
      </Pressable>
      <View style={[styles.box, { backgroundColor: t.c }]}>
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          {ab.logo ? <Image source={{ uri: ab.logo }} resizeMode="contain" style={{ width: 150, height: 64, alignSelf: "center", marginBottom: 4 }} /> : <T size={36} weight={900} color={t.bl} style={{ letterSpacing: 3, marginBottom: 4 }}>ARIBA</T>}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Switch value={rm} onValueChange={setRm} trackColor={{ true: t.gr, false: t.bd }} />
          <T size={12} color={t.mu}>تذكرني على هذا الجهاز</T>
        </View>
        {error ? <T size={12} color={t.rd} center style={{ marginBottom: 8 }}>{error}</T> : null}
        <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, { backgroundColor: t.dark ? "#29B35E" : "#014D3D", opacity: pressed || busy ? 0.8 : 1 }]}>
          <T size={15} weight={700} color="#fff">{busy ? "..." : "دخول"}</T>
        </Pressable>
        {Platform.OS === "web" ? null : (
          <Pressable onPress={doBio} disabled={busy} style={[styles.bio, { borderColor: t.bd, opacity: bio ? 1 : 0.78 }]}>
            <T size={14} weight={700} color={t.dark ? "#29B35E" : "#014D3D"}>🔐 الدخول بالبصمة / Face ID</T>
          </Pressable>
        )}
        <Pressable onPress={() => setForgot(true)} style={{ marginTop: 10, alignItems: "center" }}>
          <T size={12} weight={700} color={t.dark ? "#29B35E" : "#014D3D"}>نسيت كلمة المرور؟</T>
        </Pressable>
        {rm || bio ? (
          <Pressable onPress={forget} style={{ marginTop: 8, alignItems: "center" }}>
            <T size={11} color={t.mu}>نسيان هذا الجهاز (حذف البيانات المحفوظة)</T>
          </Pressable>
        ) : null}
        {msg ? <T size={12} center color={msg.good ? t.bl : t.am} style={{ marginTop: 8 }}>{msg.t}</T> : null}
        <InstallHint />
      </View>
      {forgot ? <ForgotSheet onClose={() => setForgot(false)} /> : null}
    </KeyboardAvoidingView>
  );
}

/** Their ForgotDialog: a temporary password to the e-mail on my record (the old password works until it is used). */
function ForgotSheet({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const [mode, setMode] = useState<"user" | "iq">("user");
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  async function go() {
    const val = v.trim();
    if (!val) return setMsg({ t: "اكتب القيمة المطلوبة", ok: false });
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; message: string; sent_to?: string }>("/auth/password-recovery", {
        method: "POST", body: JSON.stringify(mode === "user" ? { username: val } : { iqama: val }) });
      setMsg({ t: r.message + (r.sent_to ? ` (${r.sent_to})` : ""), ok: true });
      setDone(true);
    } catch {
      setMsg({ t: "تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة أخرى.", ok: false });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible onClose={onClose}>
      <View style={{ alignItems: "center" }}><Icon name="key" size={34} color="#014D3D" stroke={1.8} /></View>
      <T weight={800} size={16} center style={{ marginVertical: 8 }}>استرجاع بيانات الدخول</T>
      <T size={13} color="#555" style={{ marginBottom: 10 }}>
        {mode === "user" ? "اكتب اسم المستخدم وسنرسل لك كلمة مرور مؤقتة على بريدك الإلكتروني المسجّل." : "اكتب رقم الإقامة / الهوية وسنرسل لك اسم المستخدم وكلمة مرور مؤقتة على بريدك الإلكتروني المسجّل."}
      </T>
      <TextInput value={v} onChangeText={setV} autoCapitalize="none" keyboardType={mode === "iq" ? "number-pad" : "default"} placeholder={tr(mode === "user" ? "اسم المستخدم" : "رقم الإقامة")}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 11, fontSize: 15, textAlign: inputAlign(), fontFamily: fonts.medium }} />
      <Pressable onPress={() => { setMode(mode === "user" ? "iq" : "user"); setMsg(null); }} style={{ marginVertical: 10 }}>
        <T size={12} color="#29B35E">{mode === "user" ? "نسيت اسم المستخدم؟ استخدم رقم الإقامة" : "استخدم اسم المستخدم"}</T>
      </Pressable>
      {msg ? <T size={12} color={msg.ok ? t.bl : t.am} style={{ marginBottom: 10 }}>{msg.t}</T> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn kind="ghost" title="إغلاق" onPress={onClose} style={{ flex: 1 }} />
        {!done ? <Btn title="إرسال" onPress={go} busy={busy} style={{ flex: 1 }} /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", maxWidth: 360, borderRadius: 20, paddingVertical: 36, paddingHorizontal: 28, borderWidth: 1, borderColor: "rgba(59,130,246,.2)",
    ...shadow("#000", 0.25, 32, 0, 24, 12) },
  input: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, marginBottom: 12, textAlign: "right" },
  eye: { position: "absolute", left: 0, top: 0, bottom: 12, width: 40, alignItems: "center", justifyContent: "center" },
  btn: { borderRadius: 12, padding: 13, alignItems: "center", marginTop: 4 },
  bio: { borderRadius: 10, padding: 11, alignItems: "center", marginTop: 10, borderWidth: 1 },
});
