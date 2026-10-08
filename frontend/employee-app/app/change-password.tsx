import { useState } from "react";
import { Button, Card, ErrorText, Field, Screen, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";

// Forced on first sign-in or after HR issues a temporary password (backend: must_change_password).
export default function ChangePassword() {
  const { changePassword, signOut } = useAuth();
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (newPassword !== confirm) return setError("كلمتا المرور غير متطابقتين");
    setBusy(true);
    try {
      await changePassword(oldPassword, newPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تغيير كلمة المرور");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card title="تغيير كلمة المرور">
        <Txt muted style={{ marginBottom: 12 }}>يجب تغيير كلمة المرور المؤقتة قبل المتابعة.</Txt>
        <Field label="كلمة المرور الحالية" secureTextEntry value={oldPassword} onChangeText={setOld} />
        <Field label="كلمة المرور الجديدة" secureTextEntry value={newPassword} onChangeText={setNew} />
        <Field label="تأكيد كلمة المرور" secureTextEntry value={confirm} onChangeText={setConfirm} />
        <ErrorText message={error} />
        <Button title="حفظ" onPress={submit} busy={busy} />
      </Card>
      <Button title="تسجيل الخروج" kind="danger" onPress={signOut} />
    </Screen>
  );
}
