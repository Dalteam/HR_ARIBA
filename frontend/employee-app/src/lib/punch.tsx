// GPS state + punch action shared by the home hero and the attendance tab (legacy V118 home dial, V122b location badge,
// V126 short toasts). The server re-checks the geofence on every punch.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { ApiError, attendance } from "./api";
import { useData } from "./data";
import { currentFix, evaluate, type Fix, type LocState } from "./geo";
import { useToast } from "@/components/ui";

type Punch = { loc: LocState; fix: Fix | null; busy: boolean; locate: () => Promise<Fix | null>; punch: (action: "in" | "out") => Promise<void> };
const Ctx = createContext<Punch | null>(null);

export function PunchProvider({ children }: { children: ReactNode }) {
  const { att, refreshAtt } = useData();
  const toast = useToast();
  const [fix, setFix] = useState<Fix | null>(null);
  const [loc, setLoc] = useState<LocState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const locate = useCallback(async () => {
    try {
      const f = await currentFix();
      if (f === "denied") {
        setLoc({ kind: "denied" });
        return null;
      }
      setFix(f);
      return f;
    } catch {
      setLoc({ kind: "error" });
      return null;
    }
  }, []);

  useEffect(() => {
    locate();
    const id = setInterval(locate, 15000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && locate());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [locate]);

  useEffect(() => {
    if (fix && att) setLoc(evaluate(fix, att.locations));
  }, [fix, att]);

  const punch = useCallback(async (action: "in" | "out") => {
    if (busy) return;
    setBusy(true);
    try {
      const f = await locate();
      if (!f) {
        toast("فعّل صلاحية الموقع", "err");
        return;
      }
      const s = await attendance.punch(action, f.lat, f.lng);
      if (action === "in") toast(`تم تسجيل الحضور${s.late_minutes > 0 ? ` — تأخير ${s.late_minutes} دقيقة` : ""}`, "ok");
      else toast(`تم تسجيل الانصراف${s.early_minutes > 0 ? ` — قبل الموعد المتوقع بـ ${s.early_minutes} دقيقة` : ""}`, "ok");
      await refreshAtt();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      toast(code === "outside_geofence" ? "خارج نطاق العمل" : e instanceof ApiError ? e.message : "تعذر الاتصال بالإنترنت", "err");
    } finally {
      setTimeout(() => setBusy(false), 1500); // legacy V117: block double taps
    }
  }, [busy, locate, refreshAtt, toast]);

  return <Ctx.Provider value={{ loc, fix, busy, locate, punch }}>{children}</Ctx.Provider>;
}

export function usePunch(): Punch {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePunch outside PunchProvider");
  return v;
}

// Riyadh wall clock helpers.
export function riyadhParts(d = new Date()) {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(d).forEach((x) => (p[x.type] = x.value));
  const h = Number(p.hour) % 24;
  return { h, m: Number(p.minute), s: Number(p.second), minutes: h * 60 + Number(p.minute) };
}

export const toMin = (hm: string | null | undefined) => (hm ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) : 0);

export function todaySessions(att: { today: { time_in: string | null; time_out: string | null }[] } | null) {
  const rows = (att?.today ?? []).filter((r) => r.time_in).sort((a, b) => String(a.time_in).localeCompare(String(b.time_in)));
  const open = [...rows].reverse().find((r) => !r.time_out) ?? null;
  const outs = rows.map((r) => r.time_out).filter(Boolean).sort() as string[];
  return { rows, open, lastOut: outs[outs.length - 1] ?? null };
}

// Worked minutes today: closed sessions + the open one up to now (V118 ring / "ساعات اليوم").
export function workedMinutes(rows: { time_in: string | null; time_out: string | null }[], nowMin: number) {
  return rows.reduce((sum, r) => sum + Math.max(0, (r.time_out ? toMin(r.time_out) : nowMin) - toMin(r.time_in)), 0);
}
