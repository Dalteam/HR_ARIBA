"use client";

// صفحة التقديم — the public application form (`/apply?k=<form_key>` or `/apply?i=<invite>`).
//
// The design's `apply/ApplyApp.jsx` is a second Vite entry; here it is a second Next root layout. It opens with
// no cookie and can read nothing else: the five `/public/apply` routes are the only ones it calls, and a wrong or
// rotated key, an invite that was used, expired or revoked, and the invite-only switch each have their own
// sentence instead of a blank page. The hidden `website` field is the honeypot the API expects.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import { readFileBase64, type CandidateData } from "@/lib/candidates";
import {
  MAX_FILES, MAX_FILE_BYTES, UPLOAD_TYPES, inviteState, openForm, publicMedicalForm, submitInvite, submitOpen,
  type ApplyFile, type InviteState, type OpenFormState,
} from "@/lib/apply";

const CARD: React.CSSProperties = {
  maxWidth: 760, margin: "0 auto", padding: 20, background: "var(--c2)", border: "1px solid var(--bd)",
  borderRadius: 14,
};
const INP: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--c1, var(--c2))", border: "1px solid var(--bd)",
  borderRadius: 8, color: "var(--tx)", padding: "8px 10px", fontSize: 13,
};
const LBL: React.CSSProperties = { fontSize: 11, color: "var(--mu)", display: "block", marginBottom: 4, fontWeight: 600 };

const TEXT_FIELDS: [keyof CandidateData, string, string?][] = [
  ["nameAr", "الاسم (عربي) *"],
  ["nameEn", "الاسم (إنجليزي)", "ltr"],
  ["nationality", "الجنسية"],
  ["dob", "تاريخ الميلاد", "date"],
  ["mobile", "رقم الجوال *", "tel"],
  ["email", "البريد الإلكتروني *", "email"],
  ["idNo", "رقم الهوية / الإقامة"],
  ["idExpiry", "انتهاء الهوية", "date"],
  ["passportNo", "رقم الجواز"],
  ["passportExpiry", "انتهاء الجواز", "date"],
  ["position", "الوظيفة المطلوبة"],
  ["education", "المؤهل العلمي"],
  ["experienceYears", "سنوات الخبرة"],
  ["currentEmployer", "جهة العمل الحالية"],
  ["expectedSalary", "الراتب المتوقع"],
  ["availability", "جاهزية المباشرة"],
  ["city", "المدينة"],
  ["address", "العنوان"],
  ["bank", "البنك"],
  ["iban", "الآيبان", "ltr"],
];

export default function Page() {
  const toast = useToast();
  const [key, setKey] = useState("");
  const [invite, setInvite] = useState("");
  const [open, setOpen] = useState<OpenFormState | null>(null);
  const [inv, setInv] = useState<InviteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CandidateData>({});
  const [files, setFiles] = useState<{ file: File; type: string }[]>([]);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; files: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the URL on mount */
    setKey(params.get("k") || "");
    setInvite(params.get("i") || "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const load = useCallback(async (formKey: string, token: string) => {
    setLoading(true);
    try {
      if (token) {
        setInv(await inviteState(token));
      } else if (formKey) {
        setOpen(await openForm(formKey));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!key && !invite) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to ask the API
      setLoading(false);
      return;
    }
    void load(key, invite);
  }, [key, invite, load]);

  const open_ = useMemo(() => {
    if (invite) return inv?.status === "ok";
    return !!open?.ok;
  }, [invite, inv, open]);

  const heading = inv?.label ? `التقديم على وظيفة — ${inv.label}` : "التقديم على وظيفة";

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast(`الحد ${MAX_FILES} ملفات`, "err");
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast(`${file.name}: أكبر من 6MB`, "err");
        continue;
      }
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast(`${file.name}: النوع غير مدعوم (PDF أو صورة)`, "err");
        continue;
      }
      next.push({ file, type: next.length === 0 ? "cv" : "other" });
    }
    setFiles(next);
  }

  async function submit() {
    setBusy(true);
    try {
      const payload: ApplyFile[] = [];
      for (const item of files) {
        payload.push({
          type: item.type,
          name: item.file.name,
          mime: item.file.type,
          base64: await readFileBase64(item.file),
        });
      }
      const result = invite
        ? await submitInvite(invite, data, payload, website)
        : await submitOpen(key, data, payload, website);
      setDone(result);
      toast("✓ تم استلام طلبك", "ok");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function downloadMedical() {
    try {
      const result = await publicMedicalForm(invite ? { invite } : { formKey: key });
      if (!result.ok || !result.file) {
        toast("لا يوجد نموذج طبي متاح", "err");
        return;
      }
      const binary = atob(result.file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: result.file.mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = result.file.name || "medical-form";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    }
  }

  const set = (field: keyof CandidateData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setData((current) => ({ ...current, [field]: e.target.value }));

  const hasMedical = invite ? !!inv?.medical_form : !!open?.medical_form;


  return (
    <div style={{ padding: "28px 14px 60px" }}>
      <div style={CARD}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ariba-logo.png" alt="" style={{ height: 56, objectFit: "contain" }} />
          <h2 style={{ margin: "10px 0 4px", fontSize: 18 }}>{heading}</h2>
          <div style={{ fontSize: 12, color: "var(--mu)" }}>{open?.company?.name_ar || "شركة اريبا لخدمات الأعمال"}</div>
        </div>

        {loading && <div style={{ padding: 20, textAlign: "center", color: "var(--mu)" }}>جاري التحميل…</div>}

        {!loading && error && <div className="al alr">{error}</div>}

        {!loading && !error && !key && !invite && (
          <div className="al alb">
            <i className="ti ti-link-off" />
            <span>هذا الرابط غير مكتمل — افتح الرابط الذي أرسلته لك الموارد البشرية كما هو.</span>
          </div>
        )}

        {!loading && !error && open?.reason === "closed" && (
          <div className="al alr">
            <i className="ti ti-lock" />
            <span>نموذج التقديم مغلق حاليًا أو تم تغيير رابطه. تواصل مع الموارد البشرية للحصول على رابط جديد.</span>
          </div>
        )}

        {!loading && !error && open?.reason === "invite_only" && (
          <div className="al alb">
            <i className="ti ti-mail" />
            <span>التقديم متاح بروابط الدعوة فقط حاليًا — استخدم الرابط الذي وصلك من الموارد البشرية.</span>
          </div>
        )}

        {!loading && !error && inv && inv.status !== "ok" && (
          <div className="al alr">
            <i className="ti ti-link-off" />
            <span>
              {inv.status === "used"
                ? "تم استخدام رابط الدعوة بالفعل."
                : inv.status === "expired"
                  ? "انتهت صلاحية رابط الدعوة — اطلب رابطًا جديدًا."
                  : inv.status === "revoked"
                    ? "تم إلغاء رابط الدعوة."
                    : "رابط الدعوة غير صالح."}
            </span>
          </div>
        )}

        {!loading && !error && done && (
          <div className="al alg" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>✓ تم استلام طلبك بنجاح</div>
            <div style={{ fontSize: 12 }}>
              رمز المرجع: <span dir="ltr" style={{ userSelect: "all" }}>{done.ref}</span> — احتفظ به للمتابعة.
              {done.files ? ` (${done.files} ملف مرفق)` : ""}
            </div>
            <div style={{ fontSize: 12, color: "var(--mu)" }}>
              ستراجع الموارد البشرية طلبك وتتواصل معك عبر الجوال أو البريد الذي أدخلته.
            </div>
          </div>
        )}

        {!loading && !error && open_ && !done && (
          <>
            {hasMedical && (
              <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn bsm" onClick={downloadMedical}>
                  <i className="ti ti-file-download" /> تحميل النموذج الطبي
                </button>
                <span style={{ fontSize: 11, color: "var(--mu)" }}>ارفع النموذج بعد تعبئته ضمن الملفات.</span>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {TEXT_FIELDS.map(([field, label, kind]) => (
                <div key={field}>
                  <label style={LBL}>{label}</label>
                  <input
                    style={INP}
                    type={kind === "date" || kind === "tel" || kind === "email" ? kind : "text"}
                    dir={kind === "ltr" ? "ltr" : undefined}
                    value={String(data[field] ?? "")}
                    onChange={set(field)}
                  />
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LBL}>ملاحظات</label>
                <textarea rows={3} style={INP} value={data.notes || ""} onChange={set("notes")} />
              </div>
              <div style={{ display: "none" }} aria-hidden>
                <label style={LBL}>موقع الويب</label>
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>


            <div style={{ marginTop: 14, borderTop: "1px solid var(--bd)", paddingTop: 12 }}>
              <label style={LBL}>الملفات (PDF أو صورة، حتى {MAX_FILES} ملفات، 6MB للملف)</label>
              <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => pickFiles(e.target.files)} />
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {files.map((item, index) => (
                  <div key={`${item.file.name}-${index}`} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span style={{ flex: 1 }}>
                      {item.file.name}{" "}
                      <span style={{ color: "var(--mu)" }}>({Math.round(item.file.size / 1024)} KB)</span>
                    </span>
                    <select
                      value={item.type}
                      onChange={(e) =>
                        setFiles((current) => current.map((f, i) => (i === index ? { ...f, type: e.target.value } : f)))
                      }
                      style={{ ...INP, width: "auto" }}
                    >
                      {UPLOAD_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn bsm"
                      style={{ color: "var(--rd)" }}
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    >
                      حذف
                    </button>
                  </div>
                ))}
                {!files.length && <div style={{ fontSize: 11.5, color: "var(--mu)" }}>لا ملفات مرفوعة بعد</div>}
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn bgr" disabled={busy} onClick={submit}>
                {busy ? "جاري الإرسال…" : "إرسال الطلب"}
              </button>
              <span style={{ fontSize: 11, color: "var(--mu)" }}>
                بالضغط على «إرسال الطلب» تُقرّ بصحة البيانات المدخلة.
              </span>
            </div>
          </>
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: "var(--mu)" }}>
        شركة اريبا لخدمات الأعمال — جميع البيانات تُستخدم لأغراض التوظيف فقط.
      </div>
    </div>
  );
}

