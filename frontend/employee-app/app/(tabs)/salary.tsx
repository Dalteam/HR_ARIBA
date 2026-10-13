// الراتب — legacy payroll/019 renderPay (الراتب الحالي، بيانات البنك) + 031 V119 payslip (قسيمة الراتب، الرواتب الشهرية المعتمدة).
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icons";
import { sar } from "@/components/shared";
import { Card, CardTitle, Empty, Page, PayRow, T } from "@/components/ui";
import type { Payslip } from "@/lib/api";
import { useData } from "@/lib/data";
import { useTheme } from "@/theme";

const MONTHS = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function SlipRows({ p }: { p: Payslip }) {
  const d = p.data;
  const cur = d.currency && d.currency !== "ريال سعودي" ? d.currency : "";
  const opt = (label: string, v: unknown, kind?: "ded") => (n0(v) ? <PayRow label={label} value={sar(v)} kind={kind} /> : null);
  return (
    <>
      <PayRow label="الراتب الأساسي (حسب أيام العمل)" value={sar(d.salByDays)} />
      <PayRow label="بدل السكن" value={sar(d.houPay)} />
      <PayRow label="بدل النقل" value={sar(d.traPay)} />
      {opt("بدل المشروع", d.prjPay)}
      {opt("بدلات أخرى", n0(d.othPay) + n0(d.otherAllow))}
      {opt("الإضافي", d.overtime)}
      {opt("بدل الإجازة", d.leaveComp)}
      {opt("مكافأة نهاية الخدمة", d.eosAmt)}
      <PayRow label="إجمالي المستحق" value={sar(d.totalDue)} kind="total" />
      <PayRow label="استقطاع التأمينات" value={sar(d.noInsDeduct ? 0 : d.insEmp)} kind="ded" />
      {opt("سلف / غياب", d.loanDeduct, "ded")}
      {opt("استقطاعات أخرى", d.otherDeduct, "ded")}
      <PayRow label="صافي الراتب" value={sar(d.netSAR ?? d.net)} kind="net" />
      {cur ? <PayRow label="الصافي بالعملة الأصلية" value={`${n0(d.net).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`} /> : null}
    </>
  );
}

export default function Salary() {
  const t = useTheme();
  const { employee, payslips, refresh } = useData();
  const [open, setOpen] = useState<number | null>(null);
  const s = employee?.salary;
  const ic = (name: "cash" | "invoice" | "history" | "bank") => <Icon name={name} size={18} color={t.tx} />;
  return (
    <Page onRefresh={refresh}>
      <Card>
        <CardTitle icon={ic("cash")}>الراتب الحالي</CardTitle>
        {s ? (
          <>
            <PayRow label="الراتب الأساسي" value={sar(s.basic_salary)} />
            <PayRow label="بدل السكن" value={sar(s.housing_allowance)} />
            <PayRow label="بدل النقل" value={sar(s.transport_allowance)} />
            <PayRow label="بدل المشروع" value={sar(s.project_allowance)} />
            <PayRow label="بدلات أخرى" value={sar(n0(s.other_allowances) + n0(s.extra_allowance))} />
            <PayRow label="إجمالي الراتب" value={sar(s.total_salary)} kind="total" />
            <PayRow label="استقطاع التأمينات" value={sar(s.gosi_employee)} kind="ded" />
            <PayRow label="صافي الراتب" value={sar(s.net_salary_sar)} kind="net" />
          </>
        ) : <Empty text="لا توجد بيانات راتب" />}
      </Card>
      {payslips[0] ? (
        <Card>
          <CardTitle icon={ic("invoice")}>{`قسيمة الراتب — ${MONTHS[payslips[0].month]} ${payslips[0].year}`}</CardTitle>
          <SlipRows p={payslips[0]} />
        </Card>
      ) : null}
      {payslips.length > 1 ? (
        <Card>
          <CardTitle icon={ic("history")}>الرواتب الشهرية المعتمدة</CardTitle>
          {payslips.slice(1).map((p, i) => (
            <View key={`${p.year}-${p.month}`} style={{ borderWidth: 1, borderColor: t.bd, borderRadius: 14, padding: 12, marginBottom: 8, backgroundColor: t.c2 }}>
              <Pressable onPress={() => setOpen(open === i ? null : i)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T weight={800}>{`قسيمة الراتب — ${MONTHS[p.month]} ${p.year}`}</T>
                <T color={t.gr} weight={700}>{sar(p.data.netSAR ?? p.data.net)}</T>
              </Pressable>
              {open === i ? <View style={{ marginTop: 6 }}><SlipRows p={p} /></View> : null}
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <CardTitle icon={ic("bank")}>بيانات البنك</CardTitle>
        <PayRow label="الإيبان" value={s?.iban ?? "—"} />
      </Card>
    </Page>
  );
}
