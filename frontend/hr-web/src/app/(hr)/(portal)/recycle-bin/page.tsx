"use client";

// سلة المهملات — port of the design's pages/bin/index.jsx against GET /recycle-bin.
//
// Four categories with their counts, a search across the current one, restore (a rule, not a copy: the API
// re-inserts the snapshot and refuses to overwrite), and permanent delete by selection or by period. A document
// or a duplicate account is «للأرشيف فقط»: the screen shows that instead of a restore button, as the design does.
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { PromptModal } from "@/components/hr/prompt-modal";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import { CATEGORIES, listBin, purgeBin, restoreError, restoreItem, type BinCategory, type BinItem } from "@/lib/bin";

const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--bd)", fontSize: 12, textAlign: "right" };
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const when = (value: string) => {
  try {
    return new Date(value).toLocaleString("en-GB", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(value || "");
  }
};

export default function Page() {
  const toast = useToast();
  const [items, setItems] = useState<BinItem[]>([]);
  const [counts, setCounts] = useState<Record<BinCategory, number>>({
    employee: 0, workflow_request: 0, hr_leave: 0, other: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<BinCategory>("employee");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [ask, setAsk] = useState<{ ids: string[]; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBin();
      setItems(data.items);
      setCounts(data.counts);
      setError(null);
    } catch (e) {
      setItems([]);
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the bin's first read
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      items.filter(
        (i) =>
          i.category === cat &&
          (!q || `${i.title || ""} ${i.emp_name || ""} ${i.employee_id || ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, cat, q],
  );
  const years = useMemo(
    () => [...new Set(items.map((i) => String(i.deleted_at || "").slice(0, 4)).filter(Boolean))].sort().reverse(),
    [items],
  );
  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  const inPeriod = (item: BinItem) => {
    const d = new Date(item.deleted_at);
    const riyadh = new Date(d.getTime() + 3 * 3600000);
    return String(riyadh.getUTCFullYear()) === year && (month === "" || riyadh.getUTCMonth() === Number(month));
  };
  const periodIds = year ? rows.filter(inPeriod).map((i) => i.id) : [];

  async function restore(item: BinItem) {
    setBusy(true);
    try {
      await restoreItem(item.id);
      toast(`✓ استُترجع: ${item.title || ""}`, "ok");
      await load();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      toast(e instanceof ApiError ? restoreError(code) : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function purge(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const result = await purgeBin({ ids });
      toast(`✓ تم الحذف النهائي: ${result.purged}`, "ok");
      setSel({});
      setAsk(null);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={"btn bsm" + (cat === c.key ? " bpl" : "")}
            onClick={() => {
              setCat(c.key);
              setSel({});
            }}
          >
            <i className={"ti " + c.icon} /> {c.ar} ({counts[c.key] || 0})
          </button>
        ))}
        <input
          placeholder="بحث…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginInlineStart: "auto", minWidth: 160 }}
        />
      </div>

      <div className="card" style={{ padding: 10 }}>
        <PageState loading={loading} error={error} onRetry={() => void load()} />
        {!loading && !error && (
          <div className="tw" style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TD}>
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((r) => sel[r.id])}
                      onChange={(e) =>
                        setSel(e.target.checked ? Object.fromEntries(rows.map((r) => [r.id, true])) : {})
                      }
                    />
                  </th>
                  {["العنصر", "الموظف", "التفاصيل", "تاريخ الحذف", "بواسطة", ""].map((h, i) => (
                    <th key={i} style={TD}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td style={TD}>
                      <input
                        type="checkbox"
                        checked={!!sel[item.id]}
                        onChange={(e) => setSel((current) => ({ ...current, [item.id]: e.target.checked }))}
                      />
                    </td>
                    <td style={TD}>
                      <b>{item.title}</b>
                    </td>
                    <td style={TD}>{item.emp_name}</td>
                    <td style={TD}>{item.detail}</td>
                    <td style={{ ...TD, direction: "ltr" }}>{when(item.deleted_at)}</td>
                    <td style={TD}>{item.deleted_by || "—"}</td>
                    <td style={TD}>
                      {item.restorable ? (
                        <button type="button" className="btn bsm" disabled={busy} onClick={() => restore(item)}>
                          <i className="ti ti-restore" /> استرجاع
                        </button>
                      ) : (
                        <span style={{ color: "var(--mu)", fontSize: 11 }}>للأرشيف فقط</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} style={{ ...TD, textAlign: "center", color: "var(--mu)", padding: 24 }}>
                      السلة فارغة في هذا التصنيف
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
        <b>حذف نهائي:</b>
        <button
          type="button"
          className="btn bsm"
          disabled={busy || !selectedIds.length}
          style={{ color: "var(--rd)" }}
          onClick={() =>
            setAsk({
              ids: selectedIds,
              message: `سيُحذف ${selectedIds.length} عنصر نهائيًا ولا يمكن استرجاعه.`,
            })
          }
        >
          <i className="ti ti-trash" /> المحدد ({selectedIds.length})
        </button>
        <span style={{ color: "var(--mu)" }}>|</span>
        <span>حسب الفترة (في هذا التصنيف):</span>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">السنة</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">كل السنة</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn bsm"
          disabled={busy || !periodIds.length}
          style={{ color: "var(--rd)" }}
          onClick={() =>
            setAsk({
              ids: periodIds,
              message: `سيُحذف ${periodIds.length} عنصر نهائيًا (${month === "" ? "" : MONTHS[Number(month)] + " "}${year}).`,
            })
          }
        >
          <i className="ti ti-calendar-x" /> حذف الفترة ({periodIds.length})
        </button>
      </div>

      {ask && (
        <PromptModal
          noInput
          danger
          title="تأكيد الحذف النهائي"
          message={ask.message}
          confirmText="حذف نهائي"
          onConfirm={() => purge(ask.ids)}
          onClose={() => setAsk(null)}
        />
      )}
    </div>
  );
}

