import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Card, ErrorText, Loading, Row, Screen, Txt } from "@/components/ui";
import { payslips, type Payslip } from "@/lib/api";
import { money, useMyEmployee } from "@/lib/use-employee";
import { useTheme } from "@/theme";

const MONTHS = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sar = (v: unknown) => `${money(String(n0(v)))} ر.س`;

// V119 payslip: same rows as the approved HR payroll line.
function Slip({ p }: { p: Payslip }) {
  const t = useTheme();
  const d = p.data;
  const ins = d.noInsDeduct ? 0 : n0(d.insEmp);
  const cur = d.currency && d.currency !== "ريال سعودي" ? d.currency : "";
  const opt = (label: string, v: unknown, neg = false) => (n0(v) ? <Row label={label} value={`${neg ? "- " : ""}${sar(v)}`} /> : null);
  return (
    <>
      <Row label="الراتب الأساسي (حسب أيام العمل)" value={sar(d.salByDays)} />
      <Row label="بدل السكن" value={sar(d.houPay)} />
      <Row label="بدل النقل" value={sar(d.traPay)} />
      {opt("بدل المشروع", d.prjPay)}
      {opt("بدلات أخرى", n0(d.othPay) + n0(d.otherAllow))}
      {opt("الإضافي", d.overtime)}
      {opt("بدل الإجازة", d.leaveComp)}
      {opt("مكافأة نهاية الخدمة", d.eosAmt)}
      <Row label="إجمالي المستحق" value={<Txt bold style={{ color: t.bl }}>{sar(d.totalDue)}</Txt>} />
      <Row label="استقطاع التأمينات" value={<Txt bold style={{ color: t.rd }}>- {sar(ins)}</Txt>} />
      {opt("سلف / غياب", d.loanDeduct, true)}
      {opt("استقطاعات أخرى", d.otherDeduct, true)}
      <Row label="صافي الراتب" value={<Txt bold style={{ color: t.gr, fontSize: 15 }}>{sar(d.netSAR ?? d.net)}</Txt>} />
      {cur ? <Row label="الصافي بالعملة الأصلية" value={`${money(String(n0(d.net)))} ${cur}`} /> : null}
    </>
  );
}

function Payslips() {
  const [list, setList] = useState<Payslip[] | null>(null);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    payslips.mine().then(setList).catch(() => setList([]));
  }, []);
  if (list === null) return null;
  if (!list.length)
    return (
      <Card title="قسيمة الراتب">
        <Txt muted>لا توجد مسيرات معتمدة بعد.</Txt>
      </Card>
    );
  return (
    <>
      {list.map((p, i) => (
        <Card key={`${p.year}-${p.month}`}>
          <Pressable onPress={() => setOpen(open === i ? -1 : i)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt bold style={{ fontSize: 15 }}>قسيمة الراتب — {MONTHS[p.month]} {p.year}</Txt>
              <Txt muted>{open === i ? "▲" : "▼"}</Txt>
            </View>
          </Pressable>
          {open === i ? <View style={{ marginTop: 8 }}><Slip p={p} /></View> : null}
        </Card>
      ))}
    </>
  );
}

// Same rows as the prototype's salary tab: basic, housing, transport, project, other, gross, insurance, net.
export default function Salary() {
  const { data, error, loading } = useMyEmployee();
  if (loading) return <Loading />;
  const s = data?.salary;
  return (
    <Screen>
      <ErrorText message={error} />
      {s ? (
        <Card title="تفاصيل الراتب">
          <Row label="الراتب الأساسي" value={money(s.basic_salary)} />
          <Row label="بدل السكن" value={money(s.housing_allowance)} />
          <Row label="بدل المواصلات" value={money(s.transport_allowance)} />
          <Row label="بدل المشروع" value={money(s.project_allowance)} />
          <Row label="بدلات أخرى" value={money(s.other_allowances)} />
          <Row label="الإجمالي" value={money(s.total_salary)} />
          <Row label="خصم التأمينات" value={money(s.gosi_employee)} />
          <Row label="استقطاعات أخرى" value={money(s.other_deductions)} />
          <Row label="الصافي" value={`${money(s.net_salary)} ${s.currency}`} />
        </Card>
      ) : (
        <Card>
          <Txt muted>لا توجد بيانات راتب.</Txt>
        </Card>
      )}
      <Payslips />
    </Screen>
  );
}
