// Their Delegation card (sql/16): let my direct manager submit leaves and requests on my behalf (HR still decides).
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { Card, CardTitle, T, useToast } from "./ui";
import { ApiError } from "@/lib/api";
import { delegation, type Delegation } from "@/lib/port";
import { useTheme } from "@/theme";

export function DelegationCard() {
  const t = useTheme();
  const toast = useToast();
  const [d, setD] = useState<Delegation | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { delegation.get().then(setD).catch(() => setD({ manager_id: null, active: false })); }, []);
  if (!d || !d.manager_id) return null;
  async function flip() {
    if (!d) return;
    setBusy(true);
    try {
      const r = await delegation.set(!d.active);
      setD({ ...d, active: r.active });
      toast(r.active ? "✓ فعّلت تفويض مديرك المباشر" : "✓ ألغيت التفويض", "ok");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر الحفظ", "err");
    } finally {
      setBusy(false);
    }
  }
  const who = d.manager_name || "مديرك المباشر";
  return (
    <Card>
      <CardTitle icon="users">تفويض المدير المباشر</CardTitle>
      <T size={11.5} color={t.mu} style={{ lineHeight: 20 }}>
        {`عند التفعيل يستطيع ${who} تقديم الإجازات وطلباتك نيابةً عنك. تصل الموارد البشرية معلومة أنه قُدِّم بالنيابة وتعتمد أو ترفض، ويصلك إشعار وبريد إلكتروني.`}
      </T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
        <Switch value={d.active} disabled={busy} onValueChange={flip} trackColor={{ true: t.gr, false: t.bd }} />
        <T size={13} weight={700}>{d.active ? "مفعّل" : "غير مفعّل"}</T>
      </View>
    </Card>
  );
}
