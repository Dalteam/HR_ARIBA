// ملفي — legacy payroll/019 renderProf (profile-hero, البيانات الشخصية، الوظيفة والعقد، الراتب، بيانات البنك)
// + 026 (🔒 الأمان) + 033 (جهة العمل ومواقع العمل).
import { useState } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { PasswordSheet } from "@/components/password-sheet";
import { dmy, LocationsCard, sar } from "@/components/shared";
import { Btn, Card, CardTitle, InfoBox, Page, PayRow, T, useToast } from "@/components/ui";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

export default function Profile() {
  const t = useTheme();
  const toast = useToast();
  const { employee: e, refresh } = useData();
  const [pw, setPw] = useState(false);
  const s = e?.salary;
  return (
    <Page onRefresh={refresh}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: "#29B35E",
        shadowColor: t.dark ? "#000" : "#014D3D", shadowOpacity: t.dark ? 0.2 : 0.16, shadowRadius: 15, shadowOffset: { width: 0, height: 12 }, elevation: 3 }}>
        <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
          <Defs>
            <LinearGradient id="ph" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={t.dark ? "#013D31" : "#014D3D"} />
              <Stop offset="1" stopColor="#075444" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#ph)" />
        </Svg>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.gr, alignItems: "center", justifyContent: "center" }}>
          <T size={30} weight={800} color="#fff">{e?.name_ar?.charAt(0) ?? ""}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T size={17} weight={800} color="#fff">{e?.name_ar ?? ""}</T>
          {e?.name_en ? <T size={11} color="#D0D9D5">{e.name_en}</T> : null}
          {e?.job_title ? <T size={12} weight={700} color="#fff" style={{ marginTop: 6 }}>{e.job_title}</T> : null}
        </View>
      </View>

      <Card>
        <CardTitle>البيانات الشخصية</CardTitle>
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
      </Card>
      <Card>
        <CardTitle icon="lock">الأمان</CardTitle>
        <Btn kind="teal" title="تغيير كلمة المرور" icon="key" onPress={() => setPw(true)} style={{ borderRadius: 10, marginTop: 0 }} />
      </Card>
      <LocationsCard />
      <PasswordSheet visible={pw} onClose={() => setPw(false)} onDone={() => toast("تم تغيير كلمة المرور", "ok")} />
    </Page>
  );
}
