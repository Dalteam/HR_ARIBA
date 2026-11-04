// V117 attendance reports — the calculation of js/attendance/102-ariba-v117-att-reports.js (groupRows + compute):
// group the day's sessions, classify every day (present/late/absent/leave/remote/off/pending) and sum per employee.
// Checked against the legacy functions by tools/legacy-parity.

export type Cls = "present" | "late" | "absent" | "leave" | "remote" | "off" | "pending";

export interface AttRow {
  employee_id: string;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  status: string;
  late_minutes: number | null;
  early_minutes: number | null;
  notes: string | null;
  location_name?: string | null;
}
/** One check-in → check-out pair of the day (the updated design's `periods`); `out` is "" while open or auto-closed. */
export interface Period { in: string; out: string; auto: boolean }
export interface Grp {
  in: string | null; out: string | null; status: string; late: number; early: number; hours: number; noOut: boolean; auto: boolean; sessions: number;
  /** added with the updated design (not part of the legacy parity check): every punch pair, the first punch's location, all notes */
  periods: Period[]; loc: string; notes: string;
}
export interface Day { date: string; dow: string; cls: Cls; rec: Grp | null; /** a weekend or official holiday */ off: boolean }
export interface Sum<E> {
  e: E; expected: number; present: number; late: number; absent: number; leave: number; remote: number; offWorked: number;
  lateMin: number; early: number; earlyDays: number; noOut: number; hours: number; rate: number | null; avgIn: string; days: Day[];
}
export interface HolidayLike { start_date: string; days: number; is_recurring: boolean }
export interface LeaveLike { employee_id: string; from_date: string | null; to_date: string | null; type: string }

const pad = (n: number) => (n < 10 ? "0" : "") + n;
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = (s: string) => {
  const p = s.slice(0, 10).split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
};
export const secs = (t: string | null) => {
  if (!t) return null;
  const p = String(t).split(":");
  return +p[0] * 3600 + (+p[1] || 0) * 60 + (parseFloat(p[2]) || 0);
};
const r2 = (n: number) => Math.round(n * 100) / 100;
export const hm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : "");

export const ST_AR: Record<Cls, string> = { present: "حاضر", late: "متأخر", absent: "غائب", leave: "إجازة", remote: "عن بعد", off: "عطلة", pending: "لم يُسجَّل بعد" };
export const ST_EN: Record<Cls, string> = { present: "Present", late: "Late", absent: "Absent", leave: "Leave", remote: "Remote", off: "Day off", pending: "Not yet" };

/** Minutes as words (the design's fmtHM): «ساعتان و5 دقيقة» / "2h 5m". */
export function fmtHM(m: number, en: boolean) {
  m = Math.round(Number(m) || 0);
  if (m <= 0) return en ? "0" : "0 دقيقة";
  const h = Math.floor(m / 60), r = m % 60;
  if (en) return ((h ? h + "h " : "") + (r ? r + "m" : "")).trim() || "0m";
  if (!h) return r + " دقيقة";
  let hs = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : h + " ساعات";
  if (h > 10) hs = h + " ساعة";
  return hs + (r ? " و" + r + " دقيقة" : "");
}

/** The design's report filters (who appears), with the minimum number of days. */
export const FILTERS: Record<string, { ar: string; en: string; f: (s: Sum<unknown>, n: number) => boolean }> = {
  all: { ar: "كل الموظفين", en: "All employees", f: () => true },
  late: { ar: "المتأخرون فقط", en: "Late only", f: (s, n) => s.late >= n },
  absent: { ar: "الغائبون فقط", en: "Absent only", f: (s, n) => s.absent >= n },
  early: { ar: "عندهم خروج مبكر", en: "Early exit", f: (s, n) => s.earlyDays >= n },
  noout: { ar: "بدون بصمة انصراف", en: "Missing check-out", f: (s, n) => s.noOut >= n },
  remote: { ar: "عن بعد", en: "Remote", f: (s, n) => s.remote >= n },
  leave: { ar: "في إجازة", en: "On leave", f: (s, n) => s.leave >= n },
  clean: { ar: "ملتزمون (بدون تأخير أو غياب)", en: "Fully compliant", f: (s) => s.late === 0 && s.absent === 0 && s.present + s.remote > 0 },
};

export function groupRows(rows: AttRow[]): Map<string, Grp> {
  const g = new Map<string, AttRow[]>();
  rows.forEach((r) => {
    const k = r.employee_id + "|" + r.work_date.slice(0, 10);
    g.set(k, [...(g.get(k) ?? []), r]);
  });
  const out = new Map<string, Grp>();
  g.forEach((list, k) => {
    let rs = [...list].sort((a, b) => (secs(a.time_in) ?? 1e9) - (secs(b.time_in) ?? 1e9));
    // identical check-in = a duplicated punch: counted once (the one with the later check-out)
    const seen = new Map<string, number>();
    const uniq: AttRow[] = [];
    rs.forEach((r) => {
      if (r.time_in && seen.has(r.time_in)) {
        const i = seen.get(r.time_in)!;
        if ((secs(r.time_out) || 0) > (secs(uniq[i].time_out) || 0)) uniq[i] = r;
      } else {
        if (r.time_in) seen.set(r.time_in, uniq.length);
        uniq.push(r);
      }
    });
    rs = uniq;
    const first = rs[0];
    const withIn = rs.filter((r) => r.time_in);
    const isAuto = (r: AttRow) => /إغلاق تلقائي|auto/i.test(r.notes ?? "");
    let hours = 0;
    let anyAuto = false;
    withIn.forEach((r) => {
      const au = isAuto(r);
      if (au) anyAuto = true;
      if (r.time_out && !au) {
        const dd = ((secs(r.time_out) ?? 0) - (secs(r.time_in) ?? 0)) / 3600;
        if (dd > 0) hours += dd;
      }
    });
    // the last session's check-out is the day's check-out (left by mistake and came back)
    const lastS = withIn.length ? withIn[withIn.length - 1] : first;
    const finalReal = !!(lastS && lastS.time_out && !isAuto(lastS));
    const anyLate = rs.some((r) => r.status === "late");
    const st = first.status || "present";
    out.set(k, {
      in: first.time_in || null,
      out: finalReal ? lastS.time_out : null,
      status: st === "absent" || st === "leave" || st === "remote" ? st : first.status === "late" || (anyLate && withIn.length <= 1) ? "late" : "present",
      late: first.status === "late" || st === "late" ? Number(first.late_minutes) || 0 : 0,
      early: finalReal ? Number(lastS.early_minutes) || 0 : 0,
      hours: r2(hours),
      noOut: !!first.time_in && !finalReal,
      auto: anyAuto,
      sessions: withIn.length,
      periods: withIn.map((r) => ({ in: hm(r.time_in), out: r.time_out && !isAuto(r) ? hm(r.time_out) : "", auto: isAuto(r) })),
      loc: first.location_name || "",
      notes: rs.map((r) => r.notes).filter(Boolean).join(" | "),
    });
  });
  return out;
}

export function holidaySet(hols: HolidayLike[], y1: number, y2: number) {
  const set = new Set<string>();
  for (let y = y1; y <= y2; y++)
    hols.forEach((h) => {
      const b = parseD(h.start_date);
      let s: Date;
      if (h.is_recurring) s = new Date(y, b.getMonth(), b.getDate());
      else if (b.getFullYear() !== y) return;
      else s = b;
      for (let i = 0; i < Math.max(1, h.days || 1); i++) set.add(ymd(new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)));
    });
  return set;
}

/** The legacy `compute`: one summary per employee over [from, to], days after `today` skipped, before joining skipped. */
export function computeReport<E extends { id: string; join_date: string | null }>(a: {
  rows: AttRow[]; from: string; to: string; emps: E[]; hols: HolidayLike[]; leaves: LeaveLike[]; today: string; dayName: (d: Date) => string;
}): Sum<E>[] {
  const grp = groupRows(a.rows);
  const off = holidaySet(a.hols, +a.from.slice(0, 4), +a.to.slice(0, 4));
  const lv = new Map<string, Cls>();
  a.leaves.forEach((l) => {
    if (!l.from_date) return;
    for (let d = parseD(l.from_date); d <= parseD(l.to_date || l.from_date); d.setDate(d.getDate() + 1))
      lv.set(l.employee_id + "|" + ymd(d), l.type === "remote" ? "remote" : "leave");
  });
  return a.emps.map((e) => {
    const s: Sum<E> = { e, expected: 0, present: 0, late: 0, absent: 0, leave: 0, remote: 0, offWorked: 0, lateMin: 0, early: 0, earlyDays: 0, noOut: 0, hours: 0, rate: null, avgIn: "", days: [] };
    let inSum = 0;
    let inCnt = 0;
    for (let d = parseD(a.from); d <= parseD(a.to); d.setDate(d.getDate() + 1)) {
      const ds = ymd(d);
      if (ds > a.today) break;
      if (e.join_date && ds < e.join_date.slice(0, 10)) continue;
      const g = grp.get(e.id + "|" + ds) ?? null;
      const isOff = d.getDay() === 5 || d.getDay() === 6 || off.has(ds);
      let cls: Cls;
      if (g) cls = g.status as Cls;
      else if (isOff) cls = "off";
      else if (lv.has(e.id + "|" + ds)) cls = lv.get(e.id + "|" + ds)!;
      else if (ds === a.today) cls = "pending";
      else cls = "absent";
      if (g && (cls === "present" || cls === "late" || cls === "remote") && isOff) s.offWorked++;
      if (cls !== "off" && cls !== "pending" && !(isOff && g)) s.expected++;
      if (cls === "present") s.present++;
      else if (cls === "late") s.late++;
      else if (cls === "absent") s.absent++;
      else if (cls === "leave") s.leave++;
      else if (cls === "remote") s.remote++;
      if (g) {
        if (cls === "late") s.lateMin += g.late;
        if (g.early > 0) {
          s.early += g.early;
          s.earlyDays++;
        }
        if (g.noOut && ds < a.today) s.noOut++;
        s.hours += g.hours;
        if (g.in) {
          inSum += secs(g.in) ?? 0;
          inCnt++;
        }
      }
      s.days.push({ date: ds, dow: a.dayName(d), cls, rec: g, off: isOff });
    }
    s.hours = r2(s.hours);
    const base = s.expected - s.leave;
    s.rate = base > 0 ? Math.round(((s.present + s.late + s.remote) / base) * 1000) / 10 : null;
    if (inCnt) {
      const m = Math.round(inSum / inCnt / 60);
      s.avgIn = pad(Math.floor(m / 60)) + ":" + pad(m % 60);
    }
    return s;
  });
}
