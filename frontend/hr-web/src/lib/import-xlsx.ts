// Reading an .xlsx / .csv file without any library, and matching its columns to employee fields: the updated
// design's lib/importXlsx.js (V139), typed. Only the reading half lives here; the value conversions at the
// bottom return OUR codes (lib/api.ts), and turning a row into a request body is lib/employee-import.ts.
// ------------------------------------------------------------------ values

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** Arabic-Indic digits become Latin ones. */
export const digits = (v: unknown) => String(v ?? "").replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
/** Text folded for matching: lowercase, no diacritics, أ إ آ -> ا, ى -> ي, ة -> ه, single spaces. */
export const nn = (v: unknown) =>
  String(v || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "");

const num = (v: unknown) => {
  const n = parseFloat(digits(v).replace(/[,\s٬]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const p2 = (n: number) => (n < 10 ? "0" : "") + n;
const valid = (y: number, m: number, d: number) => {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return "";
  return y + "-" + p2(m) + "-" + p2(d);
};
/** An Excel date serial number as YYYY-MM-DD. */
const serial = (n: number) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate());
};

/** A date cell (text in any common order, or an Excel serial flagged with \u0001) as YYYY-MM-DD, or "". */
export function toIso(raw: unknown): string {
  let v = String(raw ?? "").trim();
  if (!v) return "";
  if (v.charAt(0) === "\u0001") return serial(parseFloat(v.slice(1)));
  v = digits(v);
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(v);
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{5}(\.\d+)?$/.test(v) && Number(v) > 20000 && Number(v) < 80000) return serial(Number(v));
  return "";
}

// ------------------------------------------------------------------ columns

// The design's header dictionary (its FIELDS), unchanged: the keys stay the design's so a reviewer can compare
// the two files side by side. lib/employee-import.ts is the one place that knows our API's names.
const FIELD_DEFS = [
  { k: "nameAr", ar: "الاسم بالعربي", h: ["الاسم", "الاسم بالعربي", "اسم الموظف", "الاسم عربي", "اسم", "name", "name ar", "arabic name", "employee name", "full name"] },
  { k: "nameEn", ar: "الاسم بالإنجليزي", h: ["الاسم بالانجليزي", "الاسم انجليزي", "الاسم بالإنجليزي", "name en", "english name", "name english"] },
  { k: "empNo", ar: "الرقم الوظيفي", h: ["الرقم الوظيفي", "رقم الموظف", "رقم وظيفي", "كود الموظف", "الكود", "emp no", "employee no", "employee number", "employee id", "emp id", "id no"] },
  { k: "iqamaNo", ar: "رقم الهوية / الإقامة", h: ["رقم الهويه", "رقم الهوية", "رقم الاقامه", "رقم الإقامة", "رقم الهوية/الاقامة", "رقم الهويه/الاقامه", "الهويه", "الهوية", "الاقامه", "الإقامة", "iqama", "iqama no", "iqama number", "id number", "national id", "residence no"] },
  { k: "iqamaExpiry", ar: "انتهاء الهوية / الإقامة", h: ["انتهاء الاقامه", "انتهاء الإقامة", "تاريخ انتهاء الاقامه", "تاريخ انتهاء الهويه", "انتهاء الهويه", "iqama expiry", "id expiry"] },
  { k: "nationality", ar: "الجنسية", h: ["الجنسيه", "الجنسية", "nationality"] },
  { k: "dob", ar: "تاريخ الميلاد", h: ["تاريخ الميلاد", "الميلاد", "date of birth", "dob", "birth date"] },
  { k: "employer", ar: "جهة العمل", h: ["جهه العمل", "جهة العمل", "الشركه", "الشركة", "المنشاه", "المنشأة", "employer", "company"] },
  { k: "dept", ar: "القسم", h: ["القسم", "الاداره", "الإدارة", "department", "dept"] },
  { k: "jobTitle", ar: "المسمى الوظيفي", h: ["المسمى الوظيفي", "الوظيفه", "الوظيفة", "المسمى", "job title", "position", "title", "job"] },
  { k: "mobile", ar: "الجوال", h: ["الجوال", "رقم الجوال", "الهاتف", "موبايل", "mobile", "phone", "tel"] },
  { k: "email", ar: "البريد الإلكتروني", h: ["البريد", "البريد الالكتروني", "الايميل", "الإيميل", "email", "e-mail", "mail"] },
  { k: "contractJoin", ar: "تاريخ المباشرة", h: ["تاريخ المباشره", "تاريخ المباشرة", "تاريخ التعيين", "تاريخ الالتحاق", "بداية العقد", "تاريخ بدايه العقد", "join date", "joining date", "start date", "hire date"] },
  { k: "contractDuration", ar: "مدة العقد (شهر)", h: ["مده العقد", "مدة العقد", "مدة العقد بالشهور", "مدة العقد (شهر)", "contract duration", "duration"] },
  { k: "contractNature", ar: "طبيعة العقد (محدد/غير محدد)", h: ["طبيعه العقد", "طبيعة العقد", "نوع العقد", "contract nature", "contract type"] },
  { k: "salary", ar: "الراتب الأساسي", h: ["الراتب الاساسي", "الراتب الأساسي", "الاساسي", "الأساسي", "اساسي", "basic", "basic salary", "salary"] },
  { k: "housingAllowance", ar: "بدل السكن", h: ["بدل السكن", "السكن", "housing", "housing allowance"] },
  { k: "transportAllowance", ar: "بدل النقل", h: ["بدل النقل", "بدل المواصلات", "النقل", "المواصلات", "transport", "transportation", "transport allowance"] },
  { k: "projectAllowance", ar: "بدل المشروع", h: ["بدل المشروع", "بدل مشروع", "المشروع", "project allowance", "project"] },
  { k: "otherAllowance", ar: "بدلات أخرى", h: ["بدلات اخرى", "بدلات أخرى", "بدل اخر", "بدل آخر", "اخرى", "أخرى", "other allowance", "other allowances", "other"] },
  { k: "extraAllowance", ar: "الإضافي", h: ["الاضافي", "الإضافي", "اضافي", "overtime", "extra"] },
  { k: "otherDeductions", ar: "استقطاعات", h: ["استقطاعات", "خصومات", "الاستقطاعات", "deductions", "deduction"] },
  { k: "insSystem", ar: "نظام التأمينات", h: ["نظام التامينات", "نظام التأمينات", "التامينات", "التأمينات", "insurance system", "gosi system"] },
  { k: "wpsType", ar: "نوع الموظف", h: ["نوع الموظف", "تصنيف الموظف", "فئه الموظف", "فئة الموظف", "الفئة", "employee type", "category", "wps type"] },
  { k: "iban", ar: "الآيبان", h: ["الايبان", "الآيبان", "رقم الايبان", "رقم الآيبان", "iban", "iban no"] },
  { k: "bank", ar: "البنك", h: ["البنك", "اسم البنك", "bank", "bank name"] },
  { k: "payMethod", ar: "طريقة الدفع", h: ["طريقه الدفع", "طريقة الدفع", "payment method", "pay method"] },
  { k: "currency", ar: "العملة", h: ["العمله", "العملة", "currency"] },
  { k: "exchRate", ar: "سعر الصرف", h: ["سعر الصرف", "معدل الصرف", "exchange rate", "fx"] },
  { k: "leaveDaysContract", ar: "الإجازة السنوية (يوم)", h: ["الاجازه السنويه", "الإجازة السنوية", "ايام الاجازه", "أيام الإجازة", "annual leave", "leave days"] },
  { k: "passportNo", ar: "رقم الجواز", h: ["رقم الجواز", "الجواز", "passport", "passport no"] },
  { k: "passportExpiry", ar: "انتهاء الجواز", h: ["انتهاء الجواز", "تاريخ انتهاء الجواز", "passport expiry"] },
  { k: "religion", ar: "الديانة", h: ["الديانه", "الديانة", "religion"] },
  { k: "sponsor", ar: "الكفيل", h: ["الكفيل", "sponsor"] },
  { k: "manager", ar: "المدير المباشر", h: ["المدير المباشر", "المدير", "direct manager", "manager"] },
] as const;

export type FieldKey = (typeof FIELD_DEFS)[number]["k"];
export type Field = { k: FieldKey; ar: string; h: readonly string[] };
export const FIELDS: readonly Field[] = FIELD_DEFS;
/** One mapped row: the design's field keys with the converted value (a date is YYYY-MM-DD, money a number). */
export type Values = Partial<Record<FieldKey, string | number>>;

const HMAP: Record<string, FieldKey> = {};
FIELDS.forEach((f) => f.h.concat([f.ar, f.k]).forEach((h) => { HMAP[nn(h)] = f.k; }));

/** The field each column of the header row is taken as ("" = ignore); a partial name match is the fallback. */
export function autoMap(header: string[]): (FieldKey | "")[] {
  return header.map((h) => {
    const key = nn(h);
    if (!key) return "";
    if (HMAP[key]) return HMAP[key];
    let best: FieldKey | "" = "";
    let bestLen = 0;
    Object.keys(HMAP).forEach((x) => {
      if (x.length >= 4 && (key.includes(x) || x.includes(key)) && x.length > bestLen) {
        best = HMAP[x];
        bestLen = x.length;
      }
    });
    return best;
  });
}

/** The template's header row: the Arabic field labels, which autoMap reads straight back. */
export const templateHead = () => FIELDS.map((f) => f.ar);

// ------------------------------------------------------------------ reading

export type Sheet = { name: string; rows: string[][] };

const inflateRaw = async (u8: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([u8 as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

type ZipEntry = { method: number; data: Uint8Array };

function unzip(u8: Uint8Array): Record<string, ZipEntry> {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let end = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip");
  const count = dv.getUint16(end + 10, true);
  let off = dv.getUint32(end + 16, true);
  const files: Record<string, ZipEntry> = {};
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csz = dv.getUint32(off + 20, true);
    const nl = dv.getUint16(off + 28, true);
    const xl = dv.getUint16(off + 30, true);
    const cl = dv.getUint16(off + 32, true);
    const lo = dv.getUint32(off + 42, true);
    const name = new TextDecoder("utf-8").decode(u8.subarray(off + 46, off + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true);
    const lxl = dv.getUint16(lo + 28, true);
    const st = lo + 30 + lnl + lxl;
    files[name] = { method, data: u8.subarray(st, st + csz) };
    off += 46 + nl + xl + cl;
  }
  return files;
}

const ztext = async (files: Record<string, ZipEntry>, name: string) => {
  const f = files[name];
  if (!f) return "";
  const data = f.method === 0 ? f.data : await inflateRaw(f.data);
  return new TextDecoder("utf-8").decode(data);
};

const colIdx = (ref: string | null) => {
  const m = /^([A-Z]+)/.exec(ref || "");
  let n = 0;
  if (!m) return 0;
  for (let i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
  return n - 1;
};

const n0 = (v: string | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const parse = (x: string) => new DOMParser().parseFromString(x, "application/xml");
const tags = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS(NS, name));

/** Every sheet of an .xlsx file as rows of text. A date cell keeps its Excel serial number, flagged with \u0001. */
export async function readXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const files = unzip(new Uint8Array(buf));
  const shared: string[] = [];
  const sxml = await ztext(files, "xl/sharedStrings.xml");
  if (sxml) {
    for (const si of tags(parse(sxml), "si")) {
      let s = "";
      for (const t of tags(si, "t")) s += t.textContent ?? "";
      shared.push(s);
    }
  }
  const styles = parse((await ztext(files, "xl/styles.xml")) || "<x/>");
  const dateXf: Record<number, boolean> = {};
  const fmts: Record<string, string> = {};
  for (const n of tags(styles, "numFmt")) fmts[n.getAttribute("numFmtId") ?? ""] = n.getAttribute("formatCode") || "";
  const cellXfs = tags(styles, "cellXfs")[0];
  if (cellXfs) {
    tags(cellXfs, "xf").forEach((x, i) => {
      const id = n0(x.getAttribute("numFmtId"));
      const code = fmts[id] || "";
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) dateXf[i] = true;
      else if (code && !/^General$/i.test(code) && /[dmyh]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, ""))) dateXf[i] = true;
    });
  }
  const wb = parse(await ztext(files, "xl/workbook.xml"));
  const sheets = tags(wb, "sheet");
  const rels: Record<string, string> = {};
  const rxml = await ztext(files, "xl/_rels/workbook.xml.rels");
  if (rxml) {
    for (const r of Array.from(parse(rxml).getElementsByTagName("Relationship"))) {
      rels[r.getAttribute("Id") ?? ""] = r.getAttribute("Target") ?? "";
    }
  }
  const out: Sheet[] = [];
  for (let si = 0; si < sheets.length; si++) {
    const sh = sheets[si];
    const rid = sh.getAttributeNS(REL, "id") || sh.getAttribute("r:id") || "";
    const target = (rels[rid] || "worksheets/sheet" + (si + 1) + ".xml").replace(/^\//, "").replace(/^xl\//, "");
    const sheetXml = await ztext(files, "xl/" + target);
    if (!sheetXml) continue;
    const grid: string[][] = [];
    for (const row of tags(parse(sheetXml), "row")) {
      const line: string[] = [];
      let any = false;
      for (const c of tags(row, "c")) {
        const t = c.getAttribute("t");
        const v = tags(c, "v")[0];
        let val = "";
        if (t === "s" && v) val = shared[parseInt(v.textContent ?? "", 10)] ?? "";
        else if (t === "inlineStr") for (const it of tags(c, "t")) val += it.textContent ?? "";
        else if (t === "b" && v) val = v.textContent === "1" ? "TRUE" : "FALSE";
        else if (v) {
          val = v.textContent ?? "";
          if (dateXf[n0(c.getAttribute("s"))] && Number.isFinite(Number(val))) val = "\u0001" + val;
        }
        if (val.trim() !== "") any = true;
        line[colIdx(c.getAttribute("r"))] = val;
      }
      if (any) grid.push(line);
    }
    out.push({ name: sh.getAttribute("name") || "Sheet" + (si + 1), rows: grid });
  }
  return out;
}

/** A .csv / .txt file as one sheet; the separator is the one that splits the first line most. */
export function readCsv(text: string): Sheet[] {
  const src = text.replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/)[0] || "";
  const tabs = first.split("\t").length;
  const semis = first.split(";").length;
  const commas = first.split(",").length;
  const sep = tabs > semis && tabs > commas ? "\t" : semis > commas ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const flush = () => {
    row.push(cur);
    cur = "";
    if (row.some((x) => x.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      flush();
    } else cur += ch;
  }
  flush();
  return [{ name: "CSV", rows }];
}

/** An uploaded .xlsx (a zip) or .csv / .txt (plain text) file, as sheets. */
export async function readFile(file: File): Promise<Sheet[]> {
  const buf = await file.arrayBuffer();
  const u = new Uint8Array(buf);
  if (u[0] === 0x50 && u[1] === 0x4b) return readXlsx(buf);
  return readCsv(new TextDecoder("utf-8").decode(buf));
}

// ------------------------------------------------------------------ cell values

const MONEY_KEYS: FieldKey[] = [
  "salary", "housingAllowance", "transportAllowance", "projectAllowance",
  "otherAllowance", "extraAllowance", "otherDeductions", "exchRate", "contractDuration", "leaveDaysContract",
];

/**
 * One cell, converted for the field its column was mapped to. The choices come back as OUR codes
 * (lib/api.ts); "" means the cell could not be understood, which the preview shows as a warning.
 */
export function conv(k: string, raw: string): string | number {
  const v = String(raw ?? "").trim();
  if (k === "dob" || k === "iqamaExpiry" || k === "passportExpiry" || k === "contractJoin") return toIso(raw);
  if (MONEY_KEYS.includes(k as FieldKey)) return v === "" ? "" : num(v);
  if (k === "iqamaNo" || k === "mobile") return digits(v).replace(/[^\d+]/g, "");
  if (k === "iban") return digits(v).replace(/\s+/g, "").toUpperCase();
  switch (k) {
    case "insSystem": {
      const n = nn(v);
      if (!n) return "";
      // our system has no "exempt": the cell stays empty and the preview warns about it
      if (/غير خاضع|معفي|معفى|exempt/.test(n)) return "";
      if (/غير سعودي|expat|non ?saudi/.test(n)) return "non_saudi";
      if (/لا يطابق|قديم|old/.test(n)) return "non_matching";
      if (/يطابق|جديد|new/.test(n)) return "matching";
      return "";
    }
    case "wpsType": {
      const w = nn(v);
      if (!w) return "";
      if (/تمهير|tamheer/.test(w)) return "tamheer";
      if (/متدرب|تدريب|trainee/.test(w)) return "trainee";
      if (/استشار|consult/.test(w)) return "consultant";
      if (/عن بعد|remote/.test(w)) return "remote";
      if (/خارجي|external/.test(w)) return "external";
      if (/بدون|no ?wps/.test(w)) return "no_wps";
      if (/مدد|wps|عادي|موظف|regular|خاضع/.test(w)) return "wps";
      return "";
    }
    case "contractNature": {
      const c = nn(v);
      if (!c) return "";
      if (/غير محدد|مفتوح|indefinite|open|unlimited|permanent|دائم/.test(c)) return "indefinite";
      if (/محدد|fixed|limited/.test(c)) return "fixed";
      return "";
    }
    case "payMethod": {
      const pm = nn(v);
      if (!pm) return "";
      if (/مدد|mudad/.test(pm)) return "mudad";
      if (/دولي|international/.test(pm)) return "international_transfer";
      if (/نقد|cash/.test(pm)) return "cash";
      if (/تحويل|bank|transfer/.test(pm)) return "bank_transfer";
      return "";
    }
    case "currency": {
      const c = nn(v);
      if (!c) return "";
      if (/ريال|sar|riyal/.test(c)) return "SAR";
      if (/دولار|usd|dollar/.test(c)) return "USD";
      if (/يورو|eur/.test(c)) return "EUR";
      if (/جنيه|egp|egypt/.test(c)) return "EGP";
      return "";
    }
    case "religion": {
      const r = nn(v);
      if (!r) return "";
      return /مسلم|muslim/.test(r) ? "muslim" : "other";
    }
    default:
      return v;
  }
}
