"use client";

// المرشحون — port of the design's pages/candidates/index.jsx + Invites.jsx + MedCard.jsx.
//
// Three tabs in one page: the review list (counters, status filter, search, a drawer per candidate with the
// submitted data and every uploaded file, «قبول وإضافة كموظف» and «رفض» with a required note), the invites (the
// «الاستمارة مفتوحة للجميع» switch, the lifetime in hours, the public link with copy and rotate, and a
// one-time invite per candidate with copy and revoke), and the medical form (the file candidates download, plus
// who is told about every new candidate).
//
// The public page itself is `/apply` (outside this layout, no session): `?k=<form_key>` for the open form and
// `?i=<invite>` for a one-time link.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/hr/modal";
import { PageState } from "@/components/hr/not-built";
import { PromptModal } from "@/components/hr/prompt-modal";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import {
  FIELDS, FILE_LABEL, STATUS_CLASS, STATUS_LABEL, acceptCandidate, applyUrl, candidateFile, createInvite,
  inviteUrl, listCandidates, listInvites, readFileBase64, rejectCandidate, revokeInvite, rotateApplyKey,
  setApplyMode, setMedicalForm, setNotifyList, getMedicalForm,
  type Candidate, type CandidateList, type CandidateStatus, type InviteList, type MedicalForm,
} from "@/lib/candidates";
import { getLookups, listAllEmployees } from "@/lib/employees";
import type { Lookups } from "@/lib/api";

const INP: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8,
  color: "var(--tx)", padding: "6px 9px", fontSize: 12.5,
};
const LBL: React.CSSProperties = { fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3, fontWeight: 600 };
const ROW: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--bd)", fontSize: 12 };

const TABS: { key: "cands" | "invites" | "med"; ar: string; icon: string }[] = [
  { key: "cands", ar: "المرشحون", icon: "ti-user-search" },
  { key: "invites", ar: "الدعوات", icon: "ti-link" },
  { key: "med", ar: "النموذج الطبي", icon: "ti-file-medical" },
];

const today = () => new Date().toISOString().slice(0, 10);

/** Open one uploaded file in a new tab from its base64 (a blob URL, never a stored link). */
async function openCandidateFile(id: string) {
  const file = await candidateFile(id);
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function Page() {
  const toast = useToast();
  const [tab, setTab] = useState<"cands" | "invites" | "med">("cands");
  const [list, setList] = useState<CandidateList | null>(null);
  const [invites, setInvites] = useState<InviteList | null>(null);
  const [med, setMed] = useState<MedicalForm | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [people, setPeople] = useState<{ id: string; name_ar: string; emp_no: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CandidateStatus | "">("new");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Candidate | null>(null);
  const [accept, setAccept] = useState<Candidate | null>(null);
  const [reject, setReject] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState(72);
  const [label, setLabel] = useState("");
  const [notifyIds, setNotifyIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cands, inv, medical] = await Promise.all([listCandidates(), listInvites(), getMedicalForm()]);
      setList(cands);
      setInvites(inv);
      setMed(medical);
      setHours(inv.hours);
      setNotifyIds(medical.notify_ids);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the screen's first read
    void load();
    getLookups().then(setLookups).catch(() => setLookups(null));
    listAllEmployees({ tab: "active" })
      .then((page) =>
        setPeople(page.items.map((e) => ({ id: e.id, name_ar: e.name_ar, emp_no: e.emp_no }))),
      )
      .catch(() => setPeople([]));
  }, [load]);

  const rows = useMemo(() => {
    const items = list?.candidates || [];
    const needle = q.trim().toLowerCase();
    return items.filter(
      (c) =>
        (!status || c.status === status) &&
        (!needle || `${c.data.nameAr || ""} ${c.data.position || ""} ${c.data.mobile || ""} ${c.ref}`.toLowerCase().includes(needle)),
    );
  }, [list, status, q]);

  const link = list?.form_key ? applyUrl(list.form_key) : "";

  function copy(text: string, message: string) {
    try {
      void navigator.clipboard.writeText(text);
      toast(message, "ok");
    } catch {
      window.prompt("انسخ الرابط", text);
    }
  }

  async function rotate() {
    if (!window.confirm("تغيير مفتاح النموذج سيُبطل الرابط الحالي. هل أنت متأكد؟")) return;
    setBusy(true);
    try {
      const result = await rotateApplyKey();
      setList((current) => (current ? { ...current, form_key: result.form_key } : current));
      toast("✓ رابط جديد للنموذج", "ok");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function toggleInviteOnly(on: boolean) {
    setBusy(true);
    try {
      const result = await setApplyMode(on, hours);
      setList((current) => (current ? { ...current, invite_only: result.invite_only, hours: result.hours } : current));
      setInvites((current) => (current ? { ...current, invite_only: result.invite_only, hours: result.hours } : current));
      toast(on ? "التقديم بروابط الدعوة فقط" : "الاستمارة مفتوحة للجميع", "ok");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function saveHours(next: number) {
    setHours(next);
    try {
      await setApplyMode(!!invites?.invite_only, next);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    }
  }

  async function addInvite() {
    setBusy(true);
    try {
      const created = await createInvite(label.trim(), hours);
      toast("✓ تم إنشاء رابط دعوة", "ok");
      setLabel("");
      copy(inviteUrl(created.token), "✓ نُسخ رابط الدعوة");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    setBusy(true);
    try {
      await revokeInvite(token);
      toast("تم إلغاء الدعوة", "ok");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function decide(candidate: Candidate, note: string) {
    setBusy(true);
    try {
      await rejectCandidate(candidate.id, note);
      toast("تم رفض المرشح", "ok");
      setReject(null);
      setOpen(null);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function doAccept(candidate: Candidate, employee: Record<string, unknown>, note: string) {
    setBusy(true);
    try {
      const result = await acceptCandidate(candidate.id, { employee, note: note || null });
      toast(`✓ أُضيف الموظف ${result.employee_id} ونُقل ${result.moved} ملف لوثائقه`, "ok");
      setAccept(null);
      setOpen(null);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedical(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const base64 = await readFileBase64(file);
      await setMedicalForm({ name: file.name, mime: file.type || "application/pdf", base64 });
      toast("✓ تم حفظ النموذج الطبي", "ok");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeMedical() {
    setBusy(true);
    try {
      await setMedicalForm(null);
      toast("تم حذف النموذج الطبي", "ok");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotify(ids: string[]) {
    setNotifyIds(ids);
    try {
      await setNotifyList(ids);
      toast("✓ تم حفظ قائمة التبليغ", "ok");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    }
  }


  return (
    <div>
      <PageState loading={loading} error={error} onRetry={() => void load()} />
      {!loading && !error && (
        <>
          <div className="card" style={{ marginBottom: 10, padding: 12 }}>
            <div className="ct" style={{ marginBottom: 8, fontSize: 12.5 }}>
              <i className="ti ti-link" /> رابط نموذج التقديم
            </div>
            {link ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input readOnly dir="ltr" value={link} style={{ ...INP, flex: 1 }} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn bsm" onClick={() => copy(link, "✓ نُسخ الرابط")}>
                  نسخ
                </button>
                <button type="button" className="btn bsm" disabled={busy} onClick={rotate}>
                  تغيير الرابط
                </button>
                <a className="btn bsm" href={link} target="_blank" rel="noopener noreferrer">
                  فتح
                </a>
              </div>
            ) : (
              <div className="al alb" style={{ fontSize: 12 }}>
                <i className="ti ti-alert-triangle" />
                <span>لا يوجد مفتاح للنموذج بعد — «تغيير الرابط» يُنشئ واحدًا.</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t.key} type="button" className={"btn bsm" + (tab === t.key ? " bpl" : "")} onClick={() => setTab(t.key)}>
                <i className={"ti " + t.icon} /> {t.ar}
                {t.key === "cands" && list ? ` (${list.counts.new})` : ""}
                {t.key === "invites" && invites ? ` (${invites.invites.filter((i) => i.state === "open").length})` : ""}
              </button>
            ))}
          </div>

          {tab === "cands" && (
            <div className="card">
              <div className="ch">
                <div className="ct">
                  <i className="ti ti-user-search" /> المرشحون
                  {list && (
                    <>
                      <span className="b ba" style={{ marginInlineStart: 6 }}>{list.counts.new} جديد</span>
                      <span className="b bg" style={{ marginInlineStart: 4 }}>{list.counts.accepted} مقبول</span>
                      <span className="b br" style={{ marginInlineStart: 4 }}>{list.counts.rejected} مرفوض</span>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={status} onChange={(e) => setStatus(e.target.value as CandidateStatus | "")} style={{ ...INP, width: "auto" }}>
                    <option value="new">بانتظار المراجعة</option>
                    <option value="accepted">المقبولون</option>
                    <option value="rejected">المرفوضون</option>
                    <option value="">الكل</option>
                  </select>
                  <input placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...INP, width: "auto" }} />
                </div>
              </div>
              <div style={{ maxHeight: "62vh", overflow: "auto" }}>
                {rows.map((c) => (
                  <div key={c.id} style={{ ...ROW, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.data.nameAr}</div>
                      <div style={{ fontSize: 11, color: "var(--mu)" }}>
                        {c.data.position || "—"} · {c.data.mobile || "—"} ·{" "}
                        {new Date(c.submitted_at).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")} · 📎 {c.files.length}
                        {c.source ? ` · ${c.source === "invite" ? "دعوة" : "رابط عام"}` : ""}
                      </div>
                    </div>
                    <span className={"b " + STATUS_CLASS[c.status]}>{STATUS_LABEL[c.status]}</span>
                    <button type="button" className="btn bsm" onClick={() => setOpen(c)}>
                      مراجعة
                    </button>
                  </div>
                ))}
                {!rows.length && (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--mu)" }}>لا يوجد مرشحون</div>
                )}
              </div>
            </div>
          )}

          {tab === "invites" && invites && (
            <div className="card" style={{ padding: 12 }}>
              <div className="ct" style={{ marginBottom: 8, fontSize: 12.5 }}>
                <i className="ti ti-link" /> الدعوات
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={invites.invite_only}
                  disabled={busy}
                  onChange={(e) => toggleInviteOnly(e.target.checked)}
                />
                الاستمارة مفتوحة بروابط الدعوة فقط
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <label style={LBL}>مدة صلاحية الرابط (ساعة)</label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value) || 72)}
                    onBlur={() => saveHours(hours)}
                    style={{ ...INP, width: 110 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={LBL}>اسم الدعوة (اختياري)</label>
                  <input value={label} onChange={(e) => setLabel(e.target.value)} style={INP} placeholder="مثال: مهندس مدني" />
                </div>
                <button type="button" className="btn bgr bsm" disabled={busy} onClick={addInvite}>
                  <i className="ti ti-plus" /> إنشاء دعوة
                </button>
              </div>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead>
                    <tr>
                      {["الدعوة", "أُنشئت", "تنتهي", "الحالة", "المرشح", ""].map((h) => (
                        <th key={h} style={{ ...ROW, fontWeight: 700, background: "var(--c2)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invites.invites.map((invite) => (
                      <tr key={invite.token}>
                        <td style={ROW}>
                          <span dir="ltr">{invite.label || invite.token.slice(0, 8)}</span>
                        </td>
                        <td style={ROW}>{new Date(invite.created_at).toLocaleDateString("en-GB")}</td>
                        <td style={ROW}>{new Date(invite.expires_at).toLocaleDateString("en-GB")}</td>
                        <td style={ROW}>
                          {invite.state === "open" ? "مفتوح" : invite.state === "used" ? "مستخدم" : invite.state === "expired" ? "منتهي" : "ملغى"}
                        </td>
                        <td style={ROW}>{invite.candidate || "—"}</td>
                        <td style={ROW}>
                          {invite.state === "open" && (
                            <>
                              <button type="button" className="btn bsm" onClick={() => copy(inviteUrl(invite.token), "✓ نُسخ رابط الدعوة")}>
                                نسخ
                              </button>{" "}
                              <button type="button" className="btn bsm" disabled={busy} onClick={() => revoke(invite.token)}>
                                إلغاء
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!invites.invites.length && (
                      <tr>
                        <td colSpan={6} style={{ ...ROW, textAlign: "center", color: "var(--mu)", padding: 20 }}>
                          لا توجد دعوات
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}



          {tab === "med" && med && (
            <div className="card" style={{ padding: 12 }}>
              <div className="ct" style={{ marginBottom: 8, fontSize: 12.5 }}>
                <i className="ti ti-file-medical" /> النموذج الطبي
              </div>
              <div style={{ fontSize: 11.5, color: "var(--mu)", marginBottom: 8 }}>
                الملف الذي ينزّله المرشح من صفحة التقديم (PDF أو Word أو صورة، حتى 5MB).
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <input
                  type="file"
                  accept="application/pdf,image/*,.doc,.docx"
                  disabled={busy}
                  onChange={(e) => uploadMedical(e.target.files?.[0] || null)}
                />
                {med.has_file ? (
                  <>
                    <span className="b bb">{med.name}</span>
                    <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} disabled={busy} onClick={removeMedical}>
                      حذف
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 11.5, color: "var(--mu)" }}>لا يوجد ملف مرفوع</span>
                )}
              </div>
              <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
                <label style={LBL}>مَن يُبلَّغ بكل مرشح جديد؟</label>
                <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 6 }}>
                  بدون تحديد: يُبلَّغ كل حساب موارد بشرية أو مدير نظام نشط.
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxHeight: 200, overflow: "auto" }}>
                  {people.map((person) => (
                    <label key={person.id} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={notifyIds.includes(person.id)}
                        onChange={(e) =>
                          saveNotify(e.target.checked ? [...notifyIds, person.id] : notifyIds.filter((id) => id !== person.id))
                        }
                      />
                      {person.name_ar} <span style={{ color: "var(--mu)", fontSize: 10.5 }}>{person.emp_no}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {open && (
            <Modal title={`مراجعة المرشح: ${open.data.nameAr || ""}`} width={720} onClose={() => setOpen(null)}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px", fontSize: 12 }}>
                {FIELDS.filter(([key]) => open.data[key]).map(([key, label]) => (
                  <div key={key}>
                    <span style={{ color: "var(--mu)" }}>{label}: </span>
                    <b>{String(open.data[key])}</b>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--mu)" }}>
                رمز المرجع: <span dir="ltr" style={{ userSelect: "all" }}>{open.ref}</span>
              </div>
              <div style={{ margin: "10px 0 4px", fontWeight: 700, fontSize: 12 }}>الملفات المرفقة</div>
              {open.files.map((file) => (
                <div key={file.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "3px 0" }}>
                  <span className="b bb">{FILE_LABEL[file.type] || file.type}</span>
                  <span style={{ flex: 1 }}>{file.name}</span>
                  <button
                    type="button"
                    className="btn bsm"
                    onClick={() =>
                      void openCandidateFile(file.id).catch((e) => toast(e instanceof ApiError ? e.message : String(e), "err"))
                    }
                  >
                    فتح
                  </button>
                </div>
              ))}
              {!open.files.length && <div style={{ fontSize: 12, color: "var(--mu)" }}>لا ملفات</div>}
              {open.status !== "new" && (
                <div className={"al " + (open.status === "accepted" ? "alg" : "alr")} style={{ marginTop: 10 }}>
                  {STATUS_LABEL[open.status]}
                  {open.employee_id ? ` — الموظف رقم ${open.employee_id}` : ""}
                  {open.review_note ? ` — ${open.review_note}` : ""}
                </div>
              )}
              {open.status === "new" && (
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" className="btn bgl" onClick={() => setAccept(open)}>
                    ✓ قبول وإضافة كموظف
                  </button>
                  <button type="button" className="btn" style={{ color: "var(--rd)" }} onClick={() => setReject(open)}>
                    ✗ رفض
                  </button>
                </div>
              )}
            </Modal>
          )}

          {accept && (
            <AcceptModal
              candidate={accept}
              busy={busy}
              lookups={lookups}
              onClose={() => setAccept(null)}
              onConfirm={(employee, note) => doAccept(accept, employee, note)}
            />
          )}

          {reject && (
            <PromptModal
              title="سبب الرفض"
              label="السبب (يُسجَّل)"
              required
              danger
              confirmText="رفض"
              onClose={() => setReject(null)}
              onConfirm={(note) => void decide(reject, note)}
            />
          )}
        </>
      )}
    </div>
  );
}


/** «قبول وإضافة كموظف»: the employee body (POST /employees) built from the candidate, plus the decision note. */
function AcceptModal({
  candidate, busy, lookups, onClose, onConfirm,
}: {
  candidate: Candidate;
  busy: boolean;
  lookups: Lookups | null;
  onClose: () => void;
  onConfirm: (employee: Record<string, unknown>, note: string) => void;
}) {
  const employers = lookups?.workplaces || [];
  const departments = lookups?.departments || [];
  const [v, setV] = useState({
    employer: employers[0]?.name_ar || "",
    department: departments[0]?.name_ar || "",
    job: candidate.data.position || "",
    join: today(),
    nature: "indefinite" as "indefinite" | "fixed",
    duration: "12",
    salary: candidate.data.expectedSalary || "",
    note: "",
  });
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((current) => ({ ...current, [key]: e.target.value }));

  function submit() {
    const d = candidate.data;
    const employee: Record<string, unknown> = {
      name_ar: d.nameAr || "",
      name_en: d.nameEn || null,
      nationality_id: d.nationality || null,
      workplace_id: v.employer,
      department_id: v.department || null,
      job_title: v.job || null,
      join_date: v.join,
      contract_nature: v.nature,
      contract_duration_months: v.nature === "fixed" ? Number(v.duration) || 12 : null,
      basic_salary: Number(v.salary) || 0,
      birth_date: d.dob || null,
      mobile: d.mobile || null,
      email: d.email || null,
      bank_name: d.bank || null,
      iban: d.iban || null,
      national_id: d.idNo || null,
      national_id_expiry: d.idExpiry || null,
      passport_no: d.passportNo || null,
      passport_expiry: d.passportExpiry || null,
      notes: d.notes || null,
    };
    onConfirm(employee, v.note.trim());
  }

  return (
    <Modal title={`قبول ${candidate.data.nameAr || ""} وإضافته كموظف`} width={560} onClose={onClose}>
      <div className="al alb" style={{ marginBottom: 8, padding: "7px 10px", fontSize: 12 }}>
        سيُعطى رقماً وظيفياً تلقائياً (التالي في التسلسل)، وتُنقل كل ملفاته إلى وثائقه، ثم يُفتح ملفه لاستكمال أي بيانات.
      </div>
      <div className="fg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={LBL}>جهة العمل *</label>
          <select value={v.employer} onChange={set("employer")} style={INP}>
            {employers.map((x) => (
              <option key={x.id} value={x.name_ar}>
                {x.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={LBL}>القسم</label>
          <select value={v.department} onChange={set("department")} style={INP}>
            <option value="">—</option>
            {departments.map((x) => (
              <option key={x.id} value={x.name_ar}>
                {x.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={LBL}>الوظيفة</label>
          <input value={v.job} onChange={set("job")} style={INP} />
        </div>
        <div>
          <label style={LBL}>تاريخ المباشرة</label>
          <input type="date" value={v.join} onChange={set("join")} style={INP} />
        </div>
        <div>
          <label style={LBL}>طبيعة العقد</label>
          <select value={v.nature} onChange={set("nature")} style={INP}>
            <option value="indefinite">غير محدد المدة</option>
            <option value="fixed">محدد المدة</option>
          </select>
        </div>
        {v.nature === "fixed" && (
          <div>
            <label style={LBL}>المدة (شهر)</label>
            <input type="number" min={1} value={v.duration} onChange={set("duration")} style={INP} />
          </div>
        )}
        <div>
          <label style={LBL}>الراتب الأساسي</label>
          <input type="number" min={0} value={v.salary} onChange={set("salary")} style={INP} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LBL}>ملاحظة القرار</label>
          <input value={v.note} onChange={set("note")} style={INP} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="btn bgl" disabled={busy || !v.employer} onClick={submit}>
          {busy ? "…" : "تأكيد القبول وإضافة الموظف"}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

