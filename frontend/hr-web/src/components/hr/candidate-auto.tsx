"use client";

// Stage 22, the design's automatic registration of candidates (reference/hr-v1 pages/candidates/index.jsx
// «التسجيل التلقائي للمرشحين» card + components/CandAuto.jsx): off by default; while HR has it on, every new
// candidate becomes an employee with the chosen employer / department / contract nature, the job they applied for,
// today's start date and their expected salary. As in the design, it runs while an HR person has the portal open
// (a minute after a candidate arrives); the work itself is done by the server (POST /candidates/auto/run).
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError, type Lookups } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getAutoCfg, runAuto, setAutoCfg, type AutoCfg } from "@/lib/candidates";
import { useRefresh } from "@/lib/refresh";

const LBL: React.CSSProperties = { fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3, fontWeight: 600 };

export function CandidateAutoCard({ lookups, can }: { lookups: Lookups | null; can: boolean }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<AutoCfg | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getAutoCfg().then(setCfg).catch(() => setCfg(null));
  }, []);
  if (!cfg) return null;
  const employers = lookups?.workplaces || [];
  const departments = lookups?.departments || [];

  async function save(next: AutoCfg) {
    const before = cfg;
    setCfg(next);
    setBusy(true);
    try {
      setCfg(await setAutoCfg(next));
      if (next.on !== before?.on) toast(next.on ? "تم تشغيل التسجيل التلقائي" : "تم إيقاف التسجيل التلقائي", "ok");
    } catch (e) {
      setCfg(before);
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }} id="CAND_AUTO">
      <div className="ch">
        <div className="ct">
          <i className="ti ti-bolt" /> <span>التسجيل التلقائي للمرشحين</span>
          {cfg.on ? <span className="b bg" style={{ marginInlineStart: 6 }}>مُفعّل</span> : <span className="b" style={{ marginInlineStart: 6 }}>متوقف</span>}
        </div>
      </div>
      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
          <input type="checkbox" id="CAND_AUTO_ON" checked={cfg.on} disabled={!can || busy}
            onChange={(e) => void save({ ...cfg, on: e.target.checked, employer: cfg.employer || employers[0]?.name_ar || "" })} />
          أي مرشح يملأ النموذج يُسجَّل تلقائيًا كموظف جديد ببياناته وملفاته
        </label>
        {cfg.on && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
            <div>
              <label style={LBL}>جهة العمل</label>
              <select value={cfg.employer} disabled={!can || busy} onChange={(e) => void save({ ...cfg, employer: e.target.value })}>
                {employers.map((x) => <option key={x.id} value={x.name_ar}>{x.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>القسم</label>
              <select value={cfg.department} disabled={!can || busy} onChange={(e) => void save({ ...cfg, department: e.target.value })}>
                <option value="">—</option>
                {departments.map((x) => <option key={x.id} value={x.name_ar}>{x.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>طبيعة العقد</label>
              <select value={cfg.nature} disabled={!can || busy} onChange={(e) => void save({ ...cfg, nature: e.target.value as AutoCfg["nature"] })}>
                <option value="indefinite">غير محدد المدة</option>
                <option value="fixed">محدد المدة (12 شهرًا)</option>
              </select>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--mu)", lineHeight: 1.7 }}>
          يتم التسجيل أثناء فتح البرنامج لدى أي مسؤول موارد بشرية (خلال دقيقة من وصول الطلب). تاريخ المباشرة هو يوم
          التسجيل، والراتب من «الراتب المتوقع»، ويمكن تعديلهما من ملف الموظف. انتبه: المسجَّل يصبح موظفًا نشطًا ويدخل
          مسير الرواتب، والمرشح الذي لا يكتمل ملفه (اسم ناقص أو هوية مكررة) يبقى «بانتظار المراجعة».
        </div>
      </div>
    </div>
  );
}

/** The design's CandAuto: a few seconds after an HR page opens and then every minute, while the tab is visible. */
export function CandidateAutoRunner() {
  const { can } = useAuth();
  const toast = useToast();
  const { refresh } = useRefresh();
  const allowed = can(["employees", "employees_admin"], "edit");
  const busy = useRef(false);
  useEffect(() => {
    if (!allowed) return undefined;
    const tick = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const r = await runAuto();
        if (r.registered > 0) {
          toast(`تم تسجيل ${r.registered} ${r.registered === 1 ? "موظف جديد" : "موظفين جدد"} تلقائيًا من طلبات التوظيف`, "ok");
          refresh();
        }
      } catch {
        /* the server refused or is unreachable: try again next minute */
      } finally {
        busy.current = false;
      }
    };
    const first = setTimeout(tick, 8000);
    const every = setInterval(tick, 60000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [allowed, toast, refresh]);
  return null;
}
