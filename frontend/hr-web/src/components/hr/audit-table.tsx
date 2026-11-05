"use client";

// The audit rows as «سجل التعديلات» shows them (time / user / module / action / summary with the field-level
// «old ← new» list), and their print and Excel — shared by the audit log page and the section button
// (components/hr/section-audit.tsx), the design's AuditTable / auditPrint / auditXlsx.
import { fieldValue, moduleName, riyadhTime, type AuditRow } from "@/lib/audit";
import { esc } from "@/lib/calc/month";
import { printHtml } from "@/lib/print";
import { buildXlsx } from "@/lib/xlsx";

const TD: React.CSSProperties = {
  padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.25)", textAlign: "right", fontSize: 11.5,
  verticalAlign: "top",
};
const TH: React.CSSProperties = {
  background: "var(--c2)", padding: "7px 8px", textAlign: "right", fontSize: 10.5, fontWeight: 700,
  borderBottom: "2px solid var(--bl)", whiteSpace: "nowrap",
};

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["الوقت", "المستخدم", "القسم", "الإجراء", "التفاصيل"].map((h) => (
            <th key={h} style={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td style={{ ...TD, whiteSpace: "nowrap", direction: "ltr" }}>{riyadhTime(r.at)}</td>
            <td style={{ ...TD, whiteSpace: "nowrap" }}>
              <b>{r.actor_name || r.actor_username || "—"}</b>
              <div style={{ fontSize: 10, color: "var(--mu)" }}>
                {r.actor_username} · {r.actor_role}
              </div>
            </td>
            <td style={{ ...TD, whiteSpace: "nowrap" }}>
              <span className="b bb" style={{ fontSize: 10 }}>
                {moduleName(r.module)}
              </span>
            </td>
            <td style={{ ...TD, fontWeight: 700 }}>{r.action}</td>
            <td style={TD}>
              {r.summary}
              {r.details?.changes?.length ? (
                <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--mu)" }}>
                  {r.details.changes.map((c, i) => (
                    <div key={i}>
                      {c.label || c.field}: <span style={{ color: "var(--rd)" }}>{fieldValue(c.old)}</span> ←{" "}
                      <span style={{ color: "var(--gr)" }}>{fieldValue(c.new)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={5} style={{ ...TD, textAlign: "center", color: "var(--mu)", padding: 28 }}>
              لا توجد تعديلات
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function auditExcel(rows: AuditRow[], title = "سجل التعديلات", file = "audit_log.xlsx") {
  const header = ["الوقت", "المستخدم", "الحساب", "الصلاحية", "القسم", "الإجراء", "الموظف/العنصر", "التفاصيل", "التغييرات"];
  const body = rows.map((r) => [
    riyadhTime(r.at), r.actor_name || "", r.actor_username || "", r.actor_role || "", moduleName(r.module),
    r.action, r.entity_name || "", r.summary || "",
    (r.details?.changes || []).map((c) => `${c.label || c.field}: ${fieldValue(c.old)} ← ${fieldValue(c.new)}`).join(" | "),
  ]);
  const blob = buildXlsx([
    { name: "سجل التعديلات", widths: [20, 22, 14, 10, 18, 28, 22, 70, 60], rows: [[title], [], header, ...body] },
  ]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function auditPrint(rows: AuditRow[], title: string) {
  const head = ["الوقت", "المستخدم", "القسم", "الإجراء", "التفاصيل"].map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        // names and summaries are user text: escaped, so nothing in them runs in the print window
        `<tr><td dir="ltr">${esc(riyadhTime(r.at))}</td><td>${esc(r.actor_name || r.actor_username || "—")}</td>` +
        `<td>${esc(moduleName(r.module))}</td><td>${esc(r.action)}</td><td>${esc(r.summary)}</td></tr>`,
    )
    .join("");
  printHtml(esc(title), `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
}
