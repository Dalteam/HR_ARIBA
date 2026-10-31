// طلب تغيير الآيبان — their IbanChange: the formal letter on the company letterhead, the new bank data, my signature
// and the IBAN certificate; the manager and HR are notified and, once approved, my bank data updates by itself.
import { dateLocale } from "@/i18n";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { WebView } from "react-native-webview";
import { Screen } from "@/components/screen";
import { SigPad } from "@/components/sig-pad";
import { Btn, Card, Input, Label, Sheet, T, useToast } from "@/components/ui";
import { ApiError, type Employee } from "@/lib/api";
import { useData } from "@/lib/data";
import { pickFile, type Picked } from "@/lib/files";
import { brandInfo, submitRequest } from "@/lib/port";
import { useTheme } from "@/theme";
import { goBack } from "@/lib/nav";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Their letterHtml (ProfileRequests.jsx), on a plain company letterhead (name + line). */
export function letterHtml(e: Employee | null, company: string, bank: string, account: string, iban: string, sig: string): string {
  const d = new Date().toLocaleDateString(dateLocale());
  const rows = [["اسم البنك", bank], ["رقم الحساب", account], ["رقم الآيبان (IBAN)", iban]]
    .map(([a, b]) => `<tr><td style="border:1px solid #888;padding:7px;background:#f3f6f5;width:35%">${a}</td><td style="border:1px solid #888;padding:7px" dir="ltr">${esc(b)}</td></tr>`).join("");
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:2;padding:6mm 4mm;color:#111">`
    + `<div style="text-align:center;font-weight:800;font-size:16px;color:#014D3D;border-bottom:2px solid #014D3D;padding-bottom:6px;margin-bottom:12px">${esc(company)}</div>`
    + `<div style="text-align:left;margin-bottom:14px">التاريخ: ${esc(d)}</div>`
    + `<div style="font-weight:700">السادة / إدارة الموارد البشرية — المحترمين</div><div>السلام عليكم ورحمة الله وبركاته،</div>`
    + `<div style="font-weight:700;margin:14px 0;text-align:center;text-decoration:underline">الموضوع: طلب تغيير بيانات الحساب البنكي (الآيبان)</div>`
    + `<p>أنا الموقِّع أدناه <b>${esc(e?.name_ar)}</b>، الرقم الوظيفي <b>${esc(e?.emp_no)}</b>، رقم الهوية/الإقامة <b>${esc(e?.national_id || "—")}</b>، أرجو التكرّم باعتماد بيانات حسابي البنكي الجديد لتحويل مستحقاتي المالية عليه، وذلك على النحو التالي:</p>`
    + `<table style="width:80%;margin:10px auto;border-collapse:collapse"><tbody>${rows}</tbody></table>`
    + `<p>مرفق شهادة الآيبان الصادرة من البنك. وأتحمّل كامل المسؤولية عن صحة البيانات أعلاه.</p><p>وتفضلوا بقبول فائق الاحترام والتقدير،</p>`
    + `<div style="margin-top:22px">مقدم الطلب: <b>${esc(e?.name_ar)}</b></div><div>التوقيع:</div>`
    + (sig ? `<img alt="signature" src="${sig}" style="height:60px;display:block;margin-top:4px">` : "") + `</div>`;
}

export default function IbanChange() {
  const t = useTheme();
  const toast = useToast();
  const { employee: e, requests, refresh } = useData();
  const [company, setCompany] = useState("");
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [iban, setIban] = useState("");
  const [cert, setCert] = useState<Picked | null>(null);
  const [sig, setSig] = useState("");
  const [drawing, setDrawing] = useState(false); // the page stays still while signing
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { brandInfo().then((b) => setCompany(b.names.coAr ?? "")).catch(() => {}); }, []);
  const ib = iban.replace(/\s+/g, "").toUpperCase();
  const pending = requests.some((r) => r.type === "iban_change" && r.status === "pending");

  function check(): string {
    if (!bank.trim()) return "اكتب اسم البنك";
    if (!account.trim()) return "اكتب رقم الحساب";
    if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(ib)) return "رقم الآيبان غير صحيح";
    if (!cert) return "أرفق شهادة الآيبان";
    if (!sig) return "وقّع في المربع أولاً";
    return "";
  }
  async function go() {
    const er = check();
    if (er) return toast(er, "err");
    setBusy(true);
    try {
      await submitRequest("iban_change", { iban: ib, bank: bank.trim(), account_no: account.trim(), letter_html: letterHtml(e, company, bank.trim(), account.trim(), ib, sig) }, cert);
      toast("✅ أُرسل الطلب للمدير المباشر والموارد البشرية", "ok");
      await refresh();
      goBack();
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "تعذر الإرسال", "err");
    } finally {
      setBusy(false);
    }
  }
  if (pending) return <Screen title="🏦 طلب تغيير الآيبان"><Card><T>لديك طلب تغيير آيبان قيد المراجعة بالفعل.</T></Card></Screen>;
  return (
    <Screen title="🏦 طلب تغيير الآيبان" scrollEnabled={!drawing}>
      <Card>
        <T size={11} color={t.mu} style={{ lineHeight: 19 }}>الخطاب الرسمي جاهز على ورق الشركة — اكتب بياناتك البنكية الجديدة ووقّع وأرفق الشهادة. يصل المدير المباشر والموارد البشرية، وعند الاعتماد تُحدَّث بياناتك تلقائياً.</T>
        <Input label="اسم البنك الجديد" value={bank} onChangeText={setBank} />
        <Input label="رقم الحساب" value={account} onChangeText={setAccount} keyboardType="number-pad" style={{ textAlign: "left" }} />
        <Input label="IBAN" value={iban} onChangeText={setIban} autoCapitalize="characters" placeholder="SA…" style={{ textAlign: "left" }} />
        <Btn kind="ghost" title={cert ? `📎 ${cert.name}` : "شهادة الآيبان (PDF / صورة)"} style={{ marginTop: 10 }}
          onPress={async () => { try { setCert(await pickFile(["application/pdf", "image/*"])); } catch (x) { toast(x instanceof Error ? x.message : "تعذر قراءة الملف", "err"); } }} />
        <Label>التوقيع</Label>
        <SigPad onChange={setSig} onDrawing={setDrawing} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Btn title="إرسال الطلب" onPress={go} busy={busy} style={{ flex: 1 }} />
          <Btn kind="ghost" title="معاينة الخطاب" onPress={() => setPreview(true)} style={{ flex: 1 }} />
        </View>
      </Card>
      <Sheet visible={preview} onClose={() => setPreview(false)}>
        <View style={{ height: 520 }}>
          <WebView originWhitelist={["*"]} source={{ html: `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${letterHtml(e, company, bank || "…", account || "…", ib || "…", sig)}</body></html>` }} />
        </View>
      </Sheet>
    </Screen>
  );
}
