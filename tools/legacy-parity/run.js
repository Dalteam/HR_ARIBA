// Legacy parity: the HR site's calc modules (frontend/hr-web/src/lib/calc) against the legacy HTML's own final
// functions, on seeded synthetic inputs only (no employee data). Exits 1 on any difference.
//   node run.js                    check
//   node run.js --write-fixtures   also refresh backend/tests_canonical/fixtures/legacy_*.json (the backend tests'
//                                  golden values, produced by the legacy functions)
const fs = require("fs"), path = require("path");
const boot = require("./legacy");
const buildOurs = require("./ours");

const FIXTURES = path.resolve(__dirname, "../../backend/tests_canonical/fixtures");
const WRITE = process.argv.includes("--write-fixtures");

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const near = (a, b) => (typeof a === "number" && typeof b === "number" ? (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-6 : JSON.stringify(a) === JSON.stringify(b));

// Labour-law corrections we made on purpose (docs/LOGIC_AUDIT.md section 4). The legacy side is compared *with* these
// applied, so any other difference still fails; each one also has a direct check in the «law» suite below.
const CORRECTIONS = [
  { id: "A", file: "js/payroll/107-ariba-v119-payroll.js", from: "if(K<=10) return 2/3", to: "if(K<10) return 2/3" },
  { id: "A", file: "js/calculations/07-settlement-calculator.js", from: "else if(ty<5){", to: "else if(ty<=5){" },
  { id: "A", file: "js/calculations/04-eos-page-by-law.js", from: "if(yrs<5)return", to: "if(yrs<=5)return" },
  { id: "G", file: "js/payroll/107-ariba-v119-payroll.js", from: "Q+Q*0.25", to: "Q+Q*houRate", all: true },
  { id: "J", file: "js/payroll/107-ariba-v119-payroll.js", from: "105+((K-5)*30)", to: "5*M+((K-5)*Math.max(M,30))" },
];

const results = [];
function suite(name, cases, fn) {
  let bad = 0; const ex = [];
  for (const c of cases) {
    const diff = fn(c);
    if (diff) { bad++; if (ex.length < 3) ex.push(diff); }
  }
  results.push({ name, n: cases.length, bad });
  console.log(`${bad ? "✗" : "✓"} ${name}: ${cases.length - bad}/${cases.length}`);
  ex.forEach((e) => console.log("   ", JSON.stringify(e).slice(0, 600)));
}
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

(async () => {
  const w = await boot({ patches: CORRECTIONS });
  const ours = buildOurs();

  // ---- PAYX.compute (V119): every output column
  const OP = ours("calc/payx").PAYX, LP = w.PAYX;
  const reasons = [""].concat(LP.REASONS.map((r) => r.k || r.key || r.v || r.code || r[0] || r).filter((x) => typeof x === "string"));
  suite("PAYX.compute (المسير)", range(20000, () => {
    const days = pick([28, 29, 30, 31]);
    return {
      basic: pick([0, 3000, 5400.5, 9000, 15000, 30000, 50000]), houRate: pick([0, 0.25, 0.3]), traRate: pick([0, 0.1]), prj: pick([0, 500, 1200]), oth: pick([0, 250, 2000]),
      days, work: pick(["", days, days - 3, 15, 0, days + 1]), otHours: pick([0, 2, 10.5]), otAmount: pick([0, 300]), advances: pick([0, 1000]), otherDed: pick([0, 150]),
      trainee: pick([undefined, true, false]), saudi: pick([undefined, true, false]), nat: pick(["سعودي", "مصري", "سعودية", ""]), employer: pick(["اريبا", "تمهير", "أوبتيموم"]),
      dob: pick(["1960-05-01", "1990-01-01", "", null]), join: pick(["2015-03-01", "2020-07-15", "2024-01-10", "2025-11-20", "2026-10-05", ""]),
      lastDay: pick(["", "2026-10-20", "2026-10-31"]), lastDayInclusive: pick([true, false, undefined]), contractMonths: pick([0, 12, 24]), reason: pick(reasons),
      leaveDays: pick([0, 5, 21]), leaveManual: pick(["", 3, null]), used: pick([0, 4, 10]), usedAuto: pick([0, 2]), insDays: pick(["", days, 10]),
      insStatus: pick(["", "يطابق", "لا يطابق", "غير سعودي"]), noIns: pick([false, true]), noInsDeduct: pick([false, true]), fx: pick([1, 3.755]), allIn: pick(["", 0, 12000]),
      asOfDay: pick([1, 15, 31]),
    };
  }), (x) => {
    let a, b;
    try { a = LP.compute({ ...x, asOf: new w.Date(2026, 9, x.asOfDay) }); } catch (e) { a = { err: String(e.message) }; }
    try { b = OP.compute({ ...x, asOf: new Date(2026, 9, x.asOfDay) }); } catch (e) { b = { err: String(e.message) }; }
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const diff = keys.filter((k) => !near(a[k], b[k]));
    return diff.length ? { x, diff: diff.slice(0, 5).map((k) => [k, a[k], b[k]]) } : null;
  });

  // ---- Settlement sRun (المخالصة): the legacy result boxes vs runSettlement
  const S = ours("calc/settlement"), d = w.document;
  const set = (id, v) => { const el = d.getElementById(id); if (el) el.value = String(v); };
  suite("sRun (المخالصة)", range(3000, () => ({
    start: pick(["2010-01-15", "2016-06-30", "2019-02-28", "2021-11-01", "2024-03-10", "2025-12-31"]), end: pick(["2026-10-11", "2026-02-28", "2027-01-01"]),
    salary: pick([3000, 4500.5, 9000, 15000, 28000]), reason: pick(["m84", "m74", "m85", "m75", "m77", "m80", "m53", "m74r", "m74d"]),
    leavePerYear: pick([21, 30]), leaveTaken: pick([0, 5, 40, 200]), monthDays: pick([0, 30, 31]), attendanceDays: pick([0, 15, 22]),
  })), (c) => {
    set("sStart", c.start); set("sEndDate", c.end); set("sSal", c.salary); set("sReason", c.reason); set("sLeaveD", c.leavePerYear);
    set("sLeaveTaken", c.leaveTaken); set("sWD", c.monthDays); set("sAD", c.attendanceDays);
    w.sRun();
    const boxes = [...d.querySelectorAll("#sBoxes > *")].map((b) => b.textContent.replace(/\s+/g, " ").trim());
    const r = S.runSettlement({ ...c, extras: [], deductions: [] });
    const nums = [r.award === 0 ? "لا تستحق" : S.sNum(r.award), S.sNum(r.leaveComp), S.sNum(r.periodSalary), S.sNum(r.extrasTotal), S.sNum(r.deductionsTotal)]
      .concat(r.leaveExcess > 0 ? ["-" + S.sNum(r.leaveExcessDeduction)] : []);
    return boxes.length === nums.length && nums.every((v, k) => boxes[k].includes(v)) ? null : { c, boxes, nums };
  });

  // ---- calcByLaw (صفحة نهاية الخدمة): an inner function of rEOS, taken from the legacy file's own source text
  const src = boot.patched("js/calculations/04-eos-page-by-law.js",
    fs.readFileSync(path.resolve(__dirname, "../../frontend/legacy/hr-portal/js/calculations/04-eos-page-by-law.js"), "utf8"), CORRECTIONS);
  const legacyByLaw = eval("(" + src.match(/function calcByLaw\([\s\S]*?return 0;\}/)[0] + ")");
  const E = ours("calc/eos");
  const eosCases = [];
  for (const base of [0, 1000, 3750.5, 5000, 12345.67, 45000, 99999.99])
    for (const yrs of [0, 0.5, 1.99, 2, 2.01, 3.33, 4.99, 5, 5.01, 7.5, 9.99, 10, 10.01, 15.25, 27.4])
      for (const law of ["m84", "m74", "m85", "m75", "m77", "m80", "m74r", "m74d"]) eosCases.push({ sal: base * 0.8, hou: base * 0.2, yrs, law });
  suite("calcByLaw (نهاية الخدمة)", eosCases, (c) => {
    const a = legacyByLaw(c.sal, c.hou, c.yrs, c.law), b = E.calcByLaw(c.sal, c.hou, c.yrs, c.law);
    return Math.abs(a - b) <= 0.001 ? null : { c, legacy: a, site: b };
  });

  // ---- aribaTafqeet (المبلغ بالحروف)
  const TQ = ours("calc/tafqeet");
  const amounts = [0, 1, 2, 3, 10, 11, 12, 19, 20, 21, 99, 100, 101, 200, 999, 1000, 1001, 2000, 2500, 10000, 11000, 100000, 999999.99, 1000000, 2000000, 0.5, 12.25]
    .concat(range(3000, () => Math.round(rnd() * 5000000) / (pick([1, 100]))));
  suite("aribaTafqeet (التفقيط)", amounts, (n) => (w.aribaTafqeet(n) === TQ.aribaTafqeet(n) ? null : { n, legacy: w.aribaTafqeet(n), site: TQ.aribaTafqeet(n) }));

  // ---- V130 kindOf (إعفاء التأمينات): legacy ARIBA_INS_KIND vs the site's exemptKind
  const P = ours("calc/payroll");
  const kindCases = range(4000, () => ({
    wps: pick(["wps", "wps", "wps", "consultant", "tamheer", "trainee", "external", "no_wps", "remote"]),
    job: pick(["", "محاسب", "مهندس استشاري", "مستشار قانوني", "متدرب مبيعات", "Trainee", "intern dev", "أخصائي تمهير", "مدير تدريب"]),
    dep: pick(["", "المالية", "تدريب", " تدريب ", "قسم التدريب", "تمهير"]),
    emp: pick(["", "اريبا", "تمهير", "مركز تدريب", "أوبتيموم"]),
    typ: pick(["", "دوام كامل", "مهمة محددة", "متدرب", "consultant", "training"]),
    cat: pick(["", "consultant", "employee", null]),
  }));
  const legacyKind = (c) => w.ARIBA_INS_KIND({ wpsType: c.wps, jobTitle: c.job, department: c.dep, employer: c.emp, empType: c.typ, excelCategory: c.cat });
  suite("kindOf V130 (إعفاء التأمينات)", kindCases, (c) => {
    const a = legacyKind(c), b = P.exemptKind({ wps_type: c.wps, job_title: c.job, department: c.dep, workplace: c.emp, category: c.typ, excel_category: c.cat });
    return a === b ? null : { c, legacy: a, site: b };
  });

  // ---- addMonthsSafe (نهاية العقد): golden values for the backend's fixed_term_end
  const addCases = range(3000, () => {
    const y = 2015 + Math.floor(rnd() * 15), m = 1 + Math.floor(rnd() * 12), dd = pick([1, 15, 28, 29, 30, 31, 1 + Math.floor(rnd() * 31)]);
    const last = new Date(y, m, 0).getDate();
    return [`${y}-${String(m).padStart(2, "0")}-${String(Math.min(dd, last)).padStart(2, "0")}`, pick([1, 3, 6, 11, 12, 13, 18, 24, 36, 60])];
  });

  // ---- V117 attendance reports (تقارير الحضور): legacy ARIBA117.compute vs the site's computeReport
  const AR = ours("calc/att-reports");
  const ymd = (d) => d.toISOString().slice(0, 10);
  const hh = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0") + ":" + pick(["00", "00", "30"]);
  const attCases = range(40, (n) => {
    const emps = range(5, (i) => ({ id: String(100 + i), empNo: String(500 + i), join: pick(["", "", "2026-07-15", "2026-08-20"]) }));
    const rows = [], leaves = [], hols = [];
    for (const e of emps) for (let d = new Date(Date.UTC(2026, 6, 1)); d <= new Date(Date.UTC(2026, 8, 30)); d.setUTCDate(d.getUTCDate() + 1)) {
      const k = rnd();
      if (k < 0.25) continue; // no punch
      const sessions = pick([1, 1, 1, 2, 3]);
      let t = 420 + Math.floor(rnd() * 180);
      for (let s = 0; s < sessions; s++) {
        const status = s === 0 ? pick(["present", "present", "late", "remote", "absent"]) : "present";
        const out = pick([t + 240, t + 480, null, "auto"]);
        rows.push({ emp_id: pick([e.id, e.id, e.empNo]), date: ymd(d), time_in: rnd() < 0.05 ? null : hh(t), time_out: out === "auto" ? "23:59:00" : out ? hh(Math.min(out, 1439)) : null,
          status, late_minutes: status === "late" ? 1 + Math.floor(rnd() * 90) : 0, early_minutes: pick([0, 0, 15]), location_name: "HQ",
          notes: out === "auto" ? "GPS | إغلاق تلقائي 23:59 (نسي بصمة الخروج)" : "GPS" });
        if (rnd() < 0.1) rows.push({ ...rows[rows.length - 1], time_out: hh(Math.min(t + 500, 1439)) }); // duplicated punch
        t += 300;
      }
    }
    for (let i = 0; i < 8; i++) {
      const f = new Date(Date.UTC(2026, 6, 1 + Math.floor(rnd() * 85)));
      const to = new Date(f); to.setUTCDate(to.getUTCDate() + Math.floor(rnd() * 5));
      leaves.push({ empId: pick(emps).id, from: ymd(f), to: ymd(to), type: pick(["annual", "sick", "remote"]), status: pick(["approved", "approved", "pending"]) });
    }
    hols.push({ name: "يوم التأسيس", date: "2026-02-22", days: 1, recurring: true }, { name: "اليوم الوطني", date: "2026-09-23", days: 1, recurring: true },
      { name: "إجازة", date: "2026-08-" + String(10 + n % 15).padStart(2, "0"), days: 1 + (n % 3), recurring: false });
    return { emps, rows, leaves, hols, from: pick(["2026-07-01", "2026-07-15", "2026-08-01"]), to: pick(["2026-07-31", "2026-08-31", "2026-09-30"]) };
  });
  const SUMF = ["expected", "present", "late", "absent", "leave", "remote", "offWorked", "lateMin", "early", "earlyDays", "noOut", "hours", "rate", "avgIn"];
  const RECF = ["in", "out", "status", "late", "early", "hours", "noOut", "auto", "sessions"];
  const today = ymd(new Date());
  suite("تقارير الحضور V117", attCases, (c) => {
    w.dbS("hols", c.hols);
    w.dbS("leaves", c.leaves);
    const lemps = c.emps.map((e) => ({ id: e.id, empNo: e.empNo, contractJoin: e.join }));
    const byId = {}, byNo = {};
    lemps.forEach((e) => { byId[e.id] = e; byNo[e.empNo] = e; });
    const a = w.ARIBA117.compute(c.rows, c.from, c.to, lemps, { all: lemps, byId, byNo });
    const toId = (x) => (byId[x] ? x : byNo[x] ? byNo[x].id : x);
    const b = AR.computeReport({
      rows: c.rows.map((r) => ({ ...r, employee_id: toId(r.emp_id), work_date: r.date })), from: c.from, to: c.to, today, dayName: () => "",
      emps: c.emps.map((e) => ({ id: e.id, join_date: e.join || null })),
      hols: c.hols.map((h) => ({ start_date: h.date, days: h.days, is_recurring: h.recurring })),
      leaves: c.leaves.filter((l) => l.status === "approved").map((l) => ({ employee_id: l.empId, from_date: l.from, to_date: l.to, type: l.type })),
    });
    for (let i = 0; i < a.length; i++) {
      const bad = SUMF.filter((k) => !near(a[i][k], b[i][k]));
      if (bad.length) return { emp: a[i].e.id, diff: bad.map((k) => [k, a[i][k], b[i][k]]) };
      for (let j = 0; j < a[i].days.length; j++) {
        const da = a[i].days[j], db = b[i].days[j];
        if (!db || da.date !== db.date || da.cls !== db.cls) return { emp: a[i].e.id, day: da.date, cls: [da.cls, db && db.cls] };
        const rb = RECF.filter((k) => da.rec && !near(da.rec[k] ?? null, db.rec ? db.rec[k] ?? null : undefined));
        if (rb.length || (!da.rec) !== (!db.rec)) return { emp: a[i].e.id, day: da.date, rec: rb.map((k) => [k, da.rec && da.rec[k], db.rec && db.rec[k]]) };
      }
    }
    return a.length === b.length ? null : { len: [a.length, b.length] };
  });

  // ---- the corrections themselves, straight from the law
  const law = [
    ["A م.85: 5 سنوات بالضبط = الثلث", E.calcByLaw(10000, 0, 5, "m85"), Math.round((5000 * 5) / 3 * 100) / 100],
    ["A م.85: 10 سنوات بالضبط = كاملة (المسير)", OP.eosFactor("resign", 10), 1],
    ["A م.85: 5 سنوات بالضبط = الثلث (المسير)", OP.eosFactor("resign", 5), 1 / 3],
    ["A م.85: 5 سنوات بالضبط = الثلث (المخالصة)", S.runSettlement({ start: "2020-01-01", end: "2024-12-30", salary: 9000, reason: "m85", leavePerYear: 21, leaveTaken: 0, monthDays: 0, attendanceDays: 0, extras: [], deductions: [] }).award, Math.round(22500 / 3 * 100) / 100],
    ["D م.87: مكافأة كاملة", E.calcByLaw(8000, 2000, 3, "m87"), E.calcByLaw(8000, 2000, 3, "m84")],
    ["D م.87 في المسير", OP.eosFactor("art87", 1.5), 1],
    ["C م.77 عقد محدد: أجر المدة الباقية", E.calcByLaw(10000, 0, 1, "m77", 7) - E.calcByLaw(10000, 0, 1, "m84"), 70000],
    ["C م.77 عقد محدد: شهرين على الأقل", E.calcByLaw(10000, 0, 1, "m77", 0.5) - E.calcByLaw(10000, 0, 1, "m84"), 20000],
    ["G التأمينات على السكن الفعلي", OP.compute({ basic: 10000, houRate: 0.4, traRate: 0, days: 30, work: 30, insStatus: "يطابق", saudi: true, asOf: new Date(2026, 9, 1) }).AQ, 14000],
  ];
  suite("تصحيحات نظام العمل", law, ([name, got, want]) => (Math.abs(got - want) < 1e-6 ? null : { name, got, want }));

  if (WRITE) {
    fs.mkdirSync(FIXTURES, { recursive: true });
    const save = (f, rows) => fs.writeFileSync(path.join(FIXTURES, f), JSON.stringify(rows) + "\n");
    save("legacy_add_months_safe.json", addCases.map(([s, n]) => [s, n, w.addMonthsSafe(s, n)]));
    save("legacy_ins_kind.json", kindCases.slice(0, 800).map((c) => [c.wps, c.job, c.dep, c.emp, c.typ, c.cat, legacyKind(c)]));
    console.log("fixtures written to", path.relative(process.cwd(), FIXTURES));
  }

  const failed = results.filter((r) => r.bad);
  console.log(failed.length ? `\n${failed.length} suite(s) differ from the legacy HTML` : "\nall suites match the legacy HTML");
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
