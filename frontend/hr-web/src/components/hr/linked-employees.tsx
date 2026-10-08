"use client";

// V121 «الموظفين المربوطين بمواقع البصمة»: employees limited to specific punch locations.
// An employee with no linked location punches at the locations of their workplace (legacy default).
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { request } from "@/lib/api";
import { listAllEmployees } from "@/lib/employees";
import type { EmployeeListItem } from "@/lib/api";
import type { Location } from "@/lib/locations";

interface Linked { employee_id: string; name_ar: string; location_ids: string[] }

export function LinkedEmployees({ locs }: { locs: Location[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<Linked[]>([]);
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [emp, setEmp] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const sites = locs.filter((l) => l.type !== "remote");
  const load = useCallback(() => {
    request<Linked[]>("/locations/assignments").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    load();
    listAllEmployees({ tab: "active", sort: "name_ar" }).then((p) => setEmps(p.items)).catch(() => undefined);
  }, [load]);

  function choose(id: string) {
    setEmp(id);
    setPick(rows.find((r) => r.employee_id === id)?.location_ids ?? []);
  }
  async function save() {
    if (!emp) return toast("اختر الموظف أولاً", "err");
    try {
      await request(`/employees/${emp}/work-locations`, { method: "PUT", body: { location_ids: pick } });
      toast("✓ تم حفظ مواقع العمل", "ok");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }
  const name = (id: string) => locs.find((l) => l.id === id)?.name ?? "—";

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="ct" style={{ padding: "0 0 8px" }}><i className="ti ti-users" /> الموظفين المربوطين بمواقع البصمة</div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8 }}>الموظف هيبصم في المواقع دي بس. لو سيبتها فاضية، هيبصم في مواقع جهة عمله زي الأول.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 10 }}>
        <select value={emp} onChange={(e) => choose(e.target.value)} style={{ minWidth: 220 }}>
          <option value="">اختر...</option>
          {emps.map((e) => <option key={e.id} value={e.id}>{e.name_ar}</option>)}
        </select>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", flex: 1 }}>
          {sites.length === 0 ? (
            <span style={{ fontSize: 11, color: "var(--mu)" }}>مفيش مواقع بصمة — أضف من مواقع البصمة</span>
          ) : (
            sites.map((l) => (
              <label key={l.id} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" checked={pick.includes(l.id)} onChange={(e) => setPick(e.target.checked ? [...pick, l.id] : pick.filter((x) => x !== l.id))} /> {l.name}
              </label>
            ))
          )}
        </div>
        <button type="button" className="btn bpl bsm" onClick={save}>حفظ</button>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>الموظف</th><th>الموقع</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--mu)" }}>لا يوجد موظفين مربوطين بمواقع محددة</td></tr>
            ) : (
              rows.map((r) => <tr key={r.employee_id}><td>{r.name_ar}</td><td>{r.location_ids.map(name).join("، ")}</td></tr>)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
