"use client";

// Attendance page notice: pending «نسيان بصمة» requests (approving one writes the attendance record),
// linked to «الطلبات والإجازات» filtered on that type.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ddmmyyyy } from "@/lib/format";
import { listRequests, type HrRequest } from "@/lib/leave";

const KIND: Record<string, string> = { in: "دخول", out: "خروج", both: "دخول وخروج" };

export function ForgotPunchNotice() {
  const [list, setList] = useState<HrRequest[]>([]);
  useEffect(() => {
    let alive = true;
    listRequests({ status: "pending", type: "forgot_punch" }).then((r) => alive && setList(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!list.length) return null;
  return (
    <div className="card" style={{ marginBottom: 10, borderInlineStart: "4px solid var(--am)" }}>
      <div className="ch" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="ct">
          <i className="ti ti-fingerprint" aria-hidden /> <span>طلبات نسيان بصمة بانتظار الموافقة</span> <span className="b ba">{list.length}</span>
        </div>
        <Link href="/leaves?tab=lv1&type=forgot_punch" className="btn bpl bsm">
          <i className="ti ti-arrow-left" aria-hidden /> مراجعة الطلبات
        </Link>
      </div>
      <div style={{ padding: "0 14px 10px", fontSize: 12, color: "var(--mu)", display: "grid", gap: 4 }}>
        {list.slice(0, 5).map((r) => (
          <div key={r.id}>
            <b style={{ color: "var(--tx)" }}>{r.employee_name.split(" ").slice(0, 3).join(" ")}</b> — {r.on_date ? ddmmyyyy(r.on_date) : ""} — {KIND[r.punch_kind ?? ""] ?? ""}{" "}
            {r.time_from?.slice(0, 5)}{r.time_to ? ` / ${r.time_to.slice(0, 5)}` : ""}
          </div>
        ))}
        {list.length > 5 && <div>و {list.length - 5} طلبات أخرى…</div>}
      </div>
    </div>
  );
}
