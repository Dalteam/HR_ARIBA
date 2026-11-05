"use client";

// The employee form's «العهدة» tab — port of the design's pages/employees/EmpCustody.jsx: the active assets held by
// this employee and their last custody moves. Hand-over and return stay on the assets page, as in the design.
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { CAT, listAssets, type AssetList } from "@/lib/assets";
import { money } from "@/lib/calc/month";

const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--bd)", fontSize: 12 };
const dmy = (s: string | null | undefined) => {
  const a = String(s || "").slice(0, 10).split("-");
  return a.length === 3 ? `${a[2]}/${a[1]}/${a[0]}` : "";
};

export function EmpCustody({ employeeId, lang }: { employeeId: string | null; lang: "ar" | "en" }) {
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [st, setSt] = useState<{ data: AssetList | null; err: string; denied: boolean; loaded: boolean }>({ data: null, err: "", denied: false, loaded: false });

  useEffect(() => {
    if (!employeeId) return undefined;
    let off = false;
    listAssets()
      .then((data) => { if (!off) setSt({ data, err: "", denied: false, loaded: true }); })
      .catch((e) => {
        if (off) return;
        const denied = e instanceof ApiError && e.status === 403;
        setSt({ data: null, err: e instanceof ApiError ? e.message : T("تعذر التحميل", "Could not load"), denied, loaded: true });
      });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- T only changes with lang, which does not change the data
  }, [employeeId]);

  if (!employeeId) return <div style={{ color: "var(--mu)", fontSize: 12, padding: 14 }}>{T("احفظ الموظف أولًا لتتمكن من تسجيل عهدة عليه.", "Save the employee first to register custody.")}</div>;
  if (st.denied) return <div className="al alb" style={{ margin: 10 }}><i className="ti ti-lock" /> {T("لا تملك صلاحية عرض الأصول والعهد.", "You may not view assets & custody.")}</div>;

  const assets = st.data?.assets || [];
  const mine = assets.filter((a) => a.custodian_employee_id === employeeId && (!a.status || a.status === "active"));
  const names: Record<string, string> = {};
  assets.forEach((a) => { names[a.id] = `${a.asset_no} — ${a.name}`; });
  const hist = (st.data?.log || []).filter((l) => l.employee_id === employeeId).slice(0, 8);
  return (
    <div id="AS_EMPCARD" style={{ padding: 10 }}>
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-package" /> {T("العهدة المسجّلة على الموظف", "Custody registered to the employee")}</div>
      {mine.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {mine.map((a) => (
              <tr key={a.id}>
                <td style={{ ...TD, fontWeight: 700 }}>{a.asset_no}</td>
                <td style={TD}>{a.name}</td>
                <td style={TD}>{(CAT[a.category] || CAT.other)[lang === "en" ? 1 : 0]}</td>
                <td style={TD}>{T("من ", "since ")}{dmy(a.custody_date)}</td>
                <td style={TD}>{money(a.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: "var(--mu)", fontSize: 12 }}>{st.err ? st.err : st.loaded ? T("لا توجد عهدة مسجّلة على هذا الموظف", "No custody registered to this employee") : T("جاري التحميل…", "Loading…")}</div>
      )}
      {hist.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 8 }}>
          {T("آخر الحركات: ", "Last moves: ")}
          {hist.map((l) => (l.action === "assign" ? T("استلم", "received") : T("سلّم", "returned")) + " " + (names[l.asset_id] || "") + " (" + dmy(l.at_date) + ")").join(" • ")}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 6 }}>{T("التسليم والاستلام من صفحة \"الأصول والعهد\".", "Hand-over and return happen on the assets & custody page.")}</div>
    </div>
  );
}
