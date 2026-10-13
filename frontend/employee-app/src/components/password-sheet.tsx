// Change-password modal (legacy js/auth-permissions/024 forced + 026 optional): white card, eye toggles,
// rules: ≥ 8 chars, letters and digits, repeat must match, different from the old one.
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Btn, Sheet, T } from "./ui";
import { Icon } from "./icons";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fonts } from "@/theme";

function PwInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ccc", borderRadius: 8, marginBottom: 8, backgroundColor: "#fff" }}>
      <Pressable onPress={() => setShow((s) => !s)} style={{ width: 34, alignItems: "center" }}>
        <Icon name="eye" size={18} color={show ? "#29B35E" : "#8a94a0"} />
      </Pressable>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#999" secureTextEntry={!show}
        autoCapitalize="none" style={{ flex: 1, padding: 10, fontSize: 14, color: "#111", fontFamily: fonts.medium, textAlign: "right" }} />
    </View>
  );
}

export function PasswordSheet({ visible, forced, onClose, onDone }: { visible: boolean; forced?: boolean; onClose: () => void; onDone?: () => void }) {
  const { user, changePassword } = useAuth();
  const [oldPw, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr(null);
    if (!oldPw) return setErr("اكتب كلمة المرور الحالية");
    if (pw.length < 8 || !/[A-Za-z؀-ۿ]/.test(pw) || !/\d/.test(pw)) return setErr("كلمة المرور لازم تكون 8 أحرف على الأقل وفيها حروف وأرقام");
    if (pw !== pw2) return setErr("كلمتا المرور غير متطابقتين");
    if (pw === oldPw) return setErr("كلمة المرور الجديدة لازم تختلف عن الحالية");
    setBusy(true);
    try {
      await changePassword(oldPw, pw);
      setOld(""); setPw(""); setPw2("");
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "تعذر حفظ كلمة المرور");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={forced ? () => {} : onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Icon name="lock" size={19} color="#014D3D" stroke={2} />
        <T size={17} weight={700} color="#111">{forced ? "غيّر كلمة المرور" : "تغيير كلمة المرور"}</T>
      </View>
      {forced ? <T size={12.5} color="#555" style={{ marginBottom: 10, lineHeight: 20 }}>حسابك <T size={12.5} weight={700} color="#111">{user?.username}</T> — غيّر كلمة المرور الافتراضية</T> : null}
      <PwInput value={oldPw} onChange={setOld} placeholder="كلمة المرور الحالية" />
      <PwInput value={pw} onChange={setPw} placeholder="كلمة المرور الجديدة" />
      <PwInput value={pw2} onChange={setPw2} placeholder="أعد كتابة كلمة المرور الجديدة" />
      {err ? <T size={12.5} color="#B54A4A" style={{ marginBottom: 8 }}>{err}</T> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn title="حفظ كلمة المرور" kind="teal" onPress={save} busy={busy} style={{ flex: 1, borderRadius: 8 }} />
        {!forced ? <Btn title="إلغاء" kind="ghost" onPress={onClose} style={{ borderRadius: 8, backgroundColor: "#f3f4f6", borderColor: "#ccc" }} /> : null}
      </View>
    </Sheet>
  );
}
