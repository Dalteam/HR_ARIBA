import { Button, Card, ErrorText, Loading, Row, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useMyEmployee } from "@/lib/use-employee";

export default function Profile() {
  const { signOut } = useAuth();
  const { data, error, loading } = useMyEmployee();
  if (loading) return <Loading />;
  return (
    <Screen>
      <ErrorText message={error} />
      {data ? (
        <>
          <Card title="البيانات الشخصية">
            <Row label="الاسم" value={data.name_ar} />
            <Row label="الاسم بالإنجليزية" value={data.name_en} />
            <Row label="الجنسية" value={data.nationality?.name_ar} />
            <Row label="الجوال" value={data.mobile} />
            <Row label="البريد" value={data.email} />
          </Card>
          <Card title="الهوية والعقد">
            <Row label="رقم الهوية / الإقامة" value={data.national_id} />
            <Row label="انتهاء الهوية" value={data.national_id_expiry} />
            <Row label="رقم الجواز" value={data.passport_no} />
            <Row label="انتهاء الجواز" value={data.passport_expiry} />
            <Row label="تاريخ المباشرة" value={data.join_date} />
            <Row label="نهاية العقد" value={data.contract_end_date} />
          </Card>
        </>
      ) : null}
      <Button title="تسجيل الخروج" kind="danger" onPress={signOut} />
    </Screen>
  );
}
