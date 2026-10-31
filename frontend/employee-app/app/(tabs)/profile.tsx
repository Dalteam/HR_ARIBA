// ملفي — their Prof.jsx: profile hero, personal data (+ «طلب تعديل»), job and contract, leave balances, salary,
// bank (+ «طلب تغيير الآيبان»), «وثائقي» (+ «رفع مستند للمراجعة»), security, employer and work locations.
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { openDocument } from "@/lib/open-doc";
import { PasswordSheet } from "@/components/password-sheet";
import { dmy, LocationsCard, sar } from "@/components/shared";
import { Btn, Card, CardTitle, InfoBox, Page, PayRow, T, useToast } from "@/components/ui";
import { useData } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { useTheme, useThemeMode, type Choice } from "@/theme";
import { useLang, type Lang } from "@/i18n";
import { select } from "@/lib/haptics";
import { docLabel } from "@/lib/labels";
import { shadow } from "@/lib/shadow";

export default function Profile() {
  const t = useTheme();
  const toast = useToast();
  const { employee: e, refresh } = useData();
  const [pw, setPw] = useState(false);
  const { signOut } = useAuth();
  const { choice, setChoice } = useThemeMode();
  const { lang, setLang } = useLang();
  const { leave, requests } = useData();
  const [docs, setDocs] = useState<{ id: string; type: string; file_name: string }[]>([]);
  const [opening, setOpening] = useState("");
  useEffect(() => {
    if (e?.id) api<{ id: string; type: string; file_name: string }[]>(`/employees/${encodeURIComponent(e.id)}/documents`).then(setDocs).catch(() => setDocs([]));
  }, [e?.id]);
  const ibanPending = requests.some((r) => r.type === "iban_change" && r.status === "pending");
  const s = e?.salary;
  return (
    <Page onRefresh={refresh}>
      {/* the hero fills its card (a solid brand colour, not an SVG that may not stretch); long names wrap */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, marginBottom: 12, overflow: "hidden",
        backgroundColor: t.dark ? "#013D31" : "#014D3D",
        ...shadow(t.dark ? "#000" : "#014D3D", t.dark ? 0.2 : 0.16, 15, 0, 12, 3) }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" }}>
          <T size={28} weight={800} color="#fff">{e?.name_ar?.charAt(0) ?? ""}</T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={16} weight={800} color="#fff" numberOfLines={2} style={{ flexShrink: 1, lineHeight: 24 }}>{e?.name_ar ?? ""}</T>
          {e?.name_en ? <T size={11} color="#D0D9D5" numberOfLines={1} style={{ flexShrink: 1, marginTop: 2 }}>{e.name_en}</T> : null}
          {e?.job_title ? <T size={12} weight={700} color="#E4E4BC" numberOfLines={1} style={{ marginTop: 6 }}>{e.job_title}</T> : null}
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <CardTitle>البيانات الشخصية</CardTitle>
          <Btn kind="ghost" title="✏️ طلب تعديل" onPress={() => router.push("/profile-edit")} style={{ marginTop: 0, paddingVertical: 6 }} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <InfoBox label="الرقم الوظيفي" value={e?.emp_no} />
          <InfoBox label="الجنسية" value={e?.nationality?.name_ar} />
          <InfoBox label="الجوال" value={e?.mobile} />
          <InfoBox label="البريد الإلكتروني" value={e?.email} />
          <InfoBox label="رقم الإقامة / الهوية" value={e?.national_id} />
          <InfoBox label="تاريخ الميلاد" value={dmy(e?.birth_date)} />
        </View>
      </Card>
      <Card>
        <CardTitle>الوظيفة والعقد</CardTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <InfoBox label="جهة العمل" value={e?.workplace?.name_ar} />
          <InfoBox label="القسم" value={e?.department?.name_ar} />
          <InfoBox label="الوظيفة" value={e?.job_title} />
          <InfoBox label="المدير المباشر" value={e?.manager?.name_ar} />
          <InfoBox label="تاريخ المباشرة" value={dmy(e?.join_date)} />
          <InfoBox label="انتهاء العقد" value={dmy(e?.contract_end_date)} />
        </View>
      </Card>
      {leave ? (
        <Card>
          <CardTitle icon="calendar">أرصدة الإجازات</CardTitle>
          <PayRow label="الرصيد حتى اليوم" value={`${leave.current.toFixed(2)} يوم`} />
          <PayRow label="رصيد نهاية العام" value={`${leave.year_end.toFixed(2)} يوم`} />
          <PayRow label="المرحل" value={`${leave.carry.toFixed(2)} يوم`} />
        </Card>
      ) : null}
      {s ? (
        <Card>
          <CardTitle icon="wallet">الراتب</CardTitle>
          <PayRow label="الراتب الأساسي" value={sar(s.basic_salary)} />
          <PayRow label="بدل السكن" value={sar(s.housing_allowance)} />
          <PayRow label="بدل النقل" value={sar(s.transport_allowance)} />
          <PayRow label="إجمالي الراتب" value={sar(s.total_salary)} kind="total" />
          <PayRow label="صافي الراتب" value={sar(s.net_salary_sar)} kind="net" />
        </Card>
      ) : null}
      <Card>
        <CardTitle icon="bank">بيانات البنك</CardTitle>
        <View style={{ flexDirection: "row" }}><InfoBox label="الإيبان" value={s?.iban} /></View>
        <Btn kind="ghost" title={ibanPending ? "⏳ طلب تغيير الآيبان قيد المراجعة" : "✏️ طلب تغيير الآيبان"} onPress={() => router.push("/iban-change")} style={{ marginTop: 8 }} />
      </Card>
      <Card>
        <CardTitle icon="file">وثائقي</CardTitle>
        <Btn kind="ghost" title="📤 رفع مستند للمراجعة" onPress={() => router.push("/upload-document")} style={{ marginTop: 0, marginBottom: 8 }} />
        {!docs.length ? <T size={11} color={t.mu} center>لا توجد وثائق مرفوعة</T> : null}
        {docs.map((d) => (
          <View key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.bd }}>
            <View style={{ flex: 1 }}>
              <T size={12} weight={700}>{docLabel(d.type)}</T>
              <T size={10} color={t.mu}>{d.file_name}</T>
            </View>
            <Pressable disabled={opening === d.id} onPress={async () => { setOpening(d.id); try { await openDocument(d.id, d.file_name); } catch { toast("تعذر تحميل الوثيقة", "err"); } setOpening(""); }}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: t.bd, backgroundColor: t.c2 }}>
              <T size={11} weight={700}>⬇ فتح</T>
            </Pressable>
          </View>
        ))}
      </Card>
      <Card>
        <CardTitle>المظهر</CardTitle>
        <View style={{ flexDirection: "row", backgroundColor: t.c2, borderRadius: 14, padding: 4 }}>
          {([["auto", "تلقائي"], ["light", "فاتح"], ["dark", "ليلي"]] as [Choice, string][]).map(([k, l]) => (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: choice === k }} onPress={() => { select(); setChoice(k); }}
              style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: choice === k ? "#014D3D" : "transparent" }}>
              <T size={13} weight={700} color={choice === k ? "#fff" : t.mu}>{l}</T>
            </Pressable>
          ))}
        </View>
        <T size={11.5} color={t.mu} style={{ marginTop: 6 }}>«تلقائي» يتبع إعداد جهازك.</T>
      </Card>
      <Card>
        <CardTitle>اللغة</CardTitle>
        <View style={{ flexDirection: "row", backgroundColor: t.c2, borderRadius: 14, padding: 4 }}>
          {([["ar", "العربية"], ["en", "English"]] as [Lang, string][]).map(([k, l]) => (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: lang === k }} onPress={() => { select(); setLang(k).then((restart) => { if (restart) toast(k === "en" ? "Close and reopen the app to apply the layout" : "أغلق التطبيق وافتحه مجددًا لتطبيق الاتجاه", "info"); }); }}
              style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: lang === k ? "#014D3D" : "transparent" }}>
              <T size={13} weight={700} color={lang === k ? "#fff" : t.mu}>{l}</T>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card>
        <CardTitle icon="lock">الأمان</CardTitle>
        <Btn kind="teal" title="تغيير كلمة المرور" icon="key" onPress={() => setPw(true)} style={{ marginTop: 0 }} />
      </Card>
      <LocationsCard />
      {/* the risky action sits alone at the bottom, away from the everyday ones */}
      <Btn kind="danger" title="تسجيل الخروج" icon="logout" onPress={signOut} style={{ marginTop: 8, marginBottom: 6 }} />
      <PasswordSheet visible={pw} onClose={() => setPw(false)} onDone={() => toast("تم تغيير كلمة المرور", "ok")} />
    </Page>
  );
}

