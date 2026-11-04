"use client";

// بطاقات العمل — port of the design's pages/bizcards/index.jsx against GET /bizcards.
//
// The design panel (kind, template, colours, paper, which fields the card prints, its website/phone/address),
// an employee picker, the live card preview front and back, and the four exports the design has: PNG, PDF (jsPDF
// over that PNG), `.vcf` (the contact the QR carries) and an A4 sheet of many cards for printing. The company
// design is saved to `bizcard_design` + `bizcard_cfg`; one employee's own tweak is saved to `ariba_bizcards` and
// «رجوع لتصميم الشركة» deletes it.
//
// Deliberately **not** ported: the design's drag-and-resize element editor. The template, the preset and the
// settings cover what the screen is for; the API stores the whole design object, so that editor can be added
// later without a schema change (docs/DESIGN_PORT_FOUR_SCREENS.md §5).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { useToast } from "@/components/common/toast";
import { ApiError, fetchBlob } from "@/lib/api";
import {
  BC_DEF, KINDS, TPLS, cardSide, defaultDesign, downloadBlob, downloadVcf, isDesign, preset, sheetHtml, toPng,
  vcardForEmp, type CardCfg, type CardDesign, type CardEmployee, type CardKind,
} from "@/lib/bizcard";
import {
  companyNames, getBizcards, logoUrl, saveCompanyDesign, saveEmployeeDesign, type BizcardData, type BizcardEmployee,
} from "@/lib/bizcards";

const INP: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8,
  color: "var(--tx)", padding: "6px 9px", fontSize: 12.5,
};
const LBL: React.CSSProperties = { fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3, fontWeight: 600 };
const PX_PER_MM = 5;

const COLOURS: [keyof CardCfg, string][] = [["accent", "اللون الأساسي"], ["accent2", "اللون الثاني"], ["paper", "ورق البطاقة"]];
const TOGGLES: [keyof CardCfg, string][] = [
  ["showMobile", "الجوال"], ["showEmail", "البريد"], ["showWeb", "الموقع"], ["showPhone", "هاتف الشركة"],
  ["showDept", "القسم"], ["showAddress", "العنوان"],
];

const asCardEmployee = (e: BizcardEmployee, photoUrl: string | null): CardEmployee => ({
  id: e.id, emp_no: e.emp_no, name_ar: e.name_ar, name_en: e.name_en, job_title: e.job_title,
  department: e.department, employer: e.employer, mobile: e.mobile, email: e.email, photoUrl,
});

/** Print any HTML document (the A4 sheet), unlike lib/print.ts which wraps a table in its own page. */
function printDocument(html: string, title: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("من فضلك اسمح بالنوافذ المنبثقة للطباعة");
    return;
  }
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

export default function Page() {
  const toast = useToast();
  const [data, setData] = useState<BizcardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<CardCfg>(BC_DEF);
  const [design, setDesign] = useState<CardDesign>(defaultDesign);
  const [kind, setKind] = useState<CardKind>("badge");
  const [side, setSide] = useState<"front" | "back">("front");
  const [scope, setScope] = useState<"co" | "emp">("co");
  const [empId, setEmpId] = useState("");
  const [q, setQ] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getBizcards();
      setData(payload);
      setCfg({ ...BC_DEF, ...(payload.cfg || {}) });
      setDesign(isDesign(payload.design) ? payload.design : defaultDesign());
      setEmpId((current) => current || payload.employees[0]?.id || "");
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
  }, [load]);

  const employees = useMemo(() => data?.employees ?? [], [data]);
  const current = employees.find((e) => e.id === empId) || employees[0] || null;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((e) => `${e.name_ar} ${e.name_en || ""} ${e.emp_no}`.toLowerCase().includes(needle));
  }, [employees, q]);

  // The card's photo: the API serves it with a bearer token, so it becomes a data: URL for the canvas export.
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the previous employee's photo
    setPhoto(null);
    if (!current?.has_photo) return () => { alive = false; };
    fetchBlob(`/employees/${current.id}/photo`)
      .then(async (blob) => {
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(blob);
        });
        if (alive) setPhoto(text);
      })
      .catch(() => setPhoto(null));
    return () => {
      alive = false;
    };
  }, [current?.id, current?.has_photo]);

  const co = companyNames(data?.names || null);
  const logo = logoUrl(data?.logo ?? null);
  const employee = current ? asCardEmployee(current, photo) : null;
  const ctx = useMemo(() => ({ cfg, co, logo }), [cfg, co, logo]);
  const preview = employee ? cardSide(kind, design[kind][side], employee, ctx) : "";
  const K = KINDS[kind];
  const override = current ? data?.overrides?.[current.id] : undefined;

  const edit = (patch: Partial<CardCfg>) => setCfg((c) => ({ ...c, ...patch }));
  const applyTemplate = (key: string) => setDesign((d) => ({ ...d, [kind]: preset(kind, key) }));


  async function saveCompany() {
    setBusy(true);
    try {
      await saveCompanyDesign({ design, cfg });
      toast("✓ تم حفظ تصميم الشركة", "ok");
      dirty.current = false;
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function saveEmployee() {
    if (!current) return;
    setBusy(true);
    try {
      await saveEmployeeDesign(current.id, design);
      toast(`✓ تم حفظ بطاقة ${current.name_ar}`, "ok");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function resetEmployee() {
    if (!current) return;
    setBusy(true);
    try {
      await saveEmployeeDesign(current.id, null);
      toast("رجعت البطاقة لتصميم الشركة", "ok");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function exportPng() {
    if (!employee) return;
    try {
      const blob = await toPng(cardSide(kind, design[kind][side], employee, ctx), kind);
      if (blob) downloadBlob(blob, `${kind}-${employee.emp_no || employee.id}-${side}.png`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  async function exportPdf() {
    if (!employee) return;
    try {
      const blob = await toPng(cardSide(kind, design[kind][side], employee, ctx), kind, 6);
      if (!blob) return;
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(blob);
      });
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: K.w > K.h ? "landscape" : "portrait", unit: "mm", format: [K.w, K.h] });
      pdf.addImage(dataUrl, "PNG", 0, 0, K.w, K.h);
      downloadBlob(pdf.output("blob"), `${kind}-${employee.emp_no || employee.id}-${side}.pdf`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  function exportVcf() {
    if (!employee) return;
    downloadVcf(vcardForEmp(employee, cfg, co), employee.name_ar || employee.emp_no);
  }

  function printSheet(which: "both" | "front" | "back") {
    const list = (shown.length ? shown : employees).map((e) => asCardEmployee(e, e.id === current?.id ? photo : null));
    if (!list.length) {
      toast("لا يوجد موظفون لطباعة بطاقاتهم", "err");
      return;
    }
    printDocument(sheetHtml(list, kind, design, cfg, co, logo, which), "بطاقات العمل");
  }


  return (
    <div>
      <PageState loading={loading} error={error} onRetry={() => void load()} />
      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", gap: 12, alignItems: "start" }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="ct" style={{ marginBottom: 8, fontSize: 12.5 }}>
              <i className="ti ti-id-badge-2" /> تصميم البطاقة
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {(["card", "badge"] as CardKind[]).map((k) => (
                  <button key={k} type="button" className={"btn bsm" + (kind === k ? " bpl" : "")} onClick={() => setKind(k)}>
                    {KINDS[k].ar}
                  </button>
                ))}
              </div>

              <div>
                <label style={LBL}>القالب</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TPLS[kind].map(([key, label]) => (
                    <button key={key} type="button" className="btn bsm" onClick={() => applyTemplate(key)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {COLOURS.map(([key, label]) => (
                  <div key={key}>
                    <label style={LBL}>{label}</label>
                    <input
                      type="color"
                      value={String(cfg[key] || "#000000")}
                      onChange={(e) => edit({ [key]: e.target.value } as Partial<CardCfg>)}
                      style={{ ...INP, padding: 2, height: 32 }}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label style={LBL}>لغة البطاقة</label>
                <select value={cfg.lang} onChange={(e) => edit({ lang: e.target.value as CardCfg["lang"] })} style={INP}>
                  <option value="bi">عربي وإنجليزي</option>
                  <option value="ar">عربي</option>
                  <option value="en">إنجليزي</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {TOGGLES.map(([key, label]) => (
                  <label key={key} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(cfg[key])}
                      onChange={(e) => edit({ [key]: e.target.checked } as Partial<CardCfg>)}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={LBL}>موقع الشركة</label>
                  <input value={cfg.website} onChange={(e) => edit({ website: e.target.value })} style={INP} dir="ltr" />
                </div>
                <div>
                  <label style={LBL}>هاتف الشركة</label>
                  <input value={cfg.phone} onChange={(e) => edit({ phone: e.target.value })} style={INP} dir="ltr" />
                </div>
              </div>
              <div>
                <label style={LBL}>عنوان الشركة</label>
                <input value={cfg.address} onChange={(e) => edit({ address: e.target.value })} style={INP} />
              </div>

              <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
                <label style={LBL}>حفظ التصميم</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select value={scope} onChange={(e) => setScope(e.target.value as "co" | "emp")} style={{ ...INP, width: "auto" }}>
                    <option value="co">تصميم الشركة (لكل الموظفين)</option>
                    <option value="emp">تصميم خاص بالموظف المحدد</option>
                  </select>
                  {scope === "co" ? (
                    <button type="button" className="btn bgr bsm" disabled={busy || !data?.can_edit} onClick={saveCompany}>
                      <i className="ti ti-device-floppy" /> حفظ تصميم الشركة
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn bgr bsm" disabled={busy || !data?.can_edit || !current} onClick={saveEmployee}>
                        <i className="ti ti-device-floppy" /> حفظ بطاقة الموظف
                      </button>
                      {override && (
                        <button type="button" className="btn bsm" disabled={busy} onClick={resetEmployee}>
                          رجوع لتصميم الشركة
                        </button>
                      )}
                    </>
                  )}
                </div>
                {!data?.can_edit && (
                  <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 6 }}>
                    صلاحيتك للقراءة والطباعة فقط — الحفظ متاح للموارد البشرية.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div className="ct" style={{ marginBottom: 8, fontSize: 12.5 }}>
              <i className="ti ti-eye" /> المعاينة
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <button type="button" className="btn bpl bsm" onClick={() => setSide((s) => (s === "front" ? "back" : "front"))}>
                <i className="ti ti-rotate-2" /> قلب البطاقة ({side === "front" ? "الوجه" : "الظهر"})
              </button>
              <button type="button" className="btn bgr bsm" onClick={exportPng}>
                <i className="ti ti-download" /> PNG
              </button>
              <button type="button" className="btn bgr bsm" onClick={exportPdf}>
                PDF
              </button>
              <button type="button" className="btn bgr bsm" onClick={exportVcf}>
                <i className="ti ti-address-book" /> جهة اتصال (.vcf)
              </button>
              <button type="button" className="btn bgr bsm" onClick={() => printSheet("both")}>
                <i className="ti ti-printer" /> ورقة A4
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 12px" }}>
              <div
                style={{
                  position: "relative", width: K.w * PX_PER_MM, height: K.h * PX_PER_MM, overflow: "hidden", borderRadius: 4,
                  boxShadow: "0 6px 24px rgba(0,0,0,.3)", background: "#fff",
                }}
              >
                {/* pinned to the top-left corner: in RTL the unscaled card would otherwise start at the right edge and
                    the scale (from 0 0) would push it out of the frame */}
                <div
                  style={{
                    position: "absolute", top: 0, left: 0,
                    transform: `scale(${PX_PER_MM / 3.7795})`, transformOrigin: "0 0",
                    width: K.w * 3.7795, height: K.h * 3.7795,
                  }}
                  // The card is our own generated markup (lib/bizcard.ts), never user HTML.
                  dangerouslySetInnerHTML={{ __html: preview }}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input placeholder="بحث عن موظف…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...INP, flex: 1 }} />
                <span style={{ fontSize: 11, color: "var(--mu)" }}>{shown.length} موظف</span>
              </div>
              <div style={{ maxHeight: 220, overflow: "auto", display: "grid", gap: 2 }}>
                {shown.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="btn bsm"
                    style={{
                      justifyContent: "flex-start", textAlign: "start",
                      background: e.id === current?.id ? "var(--c2)" : "transparent",
                    }}
                    onClick={() => setEmpId(e.id)}
                  >
                    <span style={{ flex: 1 }}>
                      {e.name_ar}{" "}
                      <span style={{ color: "var(--mu)", fontSize: 10.5 }}>
                        {e.emp_no} · {e.job_title || "—"}
                      </span>
                    </span>
                    {data?.overrides?.[e.id] && (
                      <span className="b bb" style={{ fontSize: 9.5 }}>
                        مخصصة
                      </span>
                    )}
                  </button>
                ))}
                {!shown.length && <div style={{ padding: 12, color: "var(--mu)", fontSize: 12 }}>لا يوجد موظفون</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


