import { Card, ErrorText, Loading, Row, Screen, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useMyEmployee } from "@/lib/use-employee";

export default function Home() {
  const { user } = useAuth();
  const { data, error, loading } = useMyEmployee();
  if (loading) return <Loading />;
  return (
    <Screen>
      <Card>
        <Txt muted>مرحباً</Txt>
        <Txt bold style={{ fontSize: 18 }}>{data?.name_ar ?? user?.employee?.name_ar ?? user?.username}</Txt>
        <Txt muted>{data?.job_title ?? ""}</Txt>
      </Card>
      <ErrorText message={error} />
      {data ? (
        <Card title="ملخص">
          <Row label="الرقم الوظيفي" value={data.emp_no} />
          <Row label="جهة العمل" value={data.workplace?.name_ar} />
          <Row label="القسم" value={data.department?.name_ar} />
          <Row label="المدير المباشر" value={data.manager?.name_ar} />
          <Row label="سنوات الخدمة" value={data.years_of_service} />
          <Row label="الإجازة السنوية (أيام)" value={data.annual_leave_days} />
        </Card>
      ) : null}
    </Screen>
  );
}
