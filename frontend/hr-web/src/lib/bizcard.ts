// The business card template — a port of the updated design's `lib/bizcardHtml.js` + `lib/vcard.js`.
//
// A card is a face (`bg` + elements placed in millimetres) and two kinds exist: `card` (90×50 mm business
// card) and `badge` (54×86 mm employee badge). Every element is one of five kinds — text with `{field}`
// placeholders, a photo, a QR code, the company logo, or a shape — and the whole thing is drawn as HTML/SVG
// in the browser, exactly as the design does it: the screen shows it, `toPng` rasterises it for download,
// `sheetHtml` puts ten (or nine) on an A4 page for printing, and `vcardOf` makes the `.vcf` the QR carries.
//
// Nothing here talks to the API: the caller passes the employee, the settings and the company names in.

import qrcode from "./vendor/qrcode.js";

export type CardKind = "card" | "badge";

export const KINDS: Record<CardKind, { w: number; h: number; ar: string; en: string }> = {
  card: { w: 90, h: 50, ar: "بطاقة أعمال (90×50)", en: "Business card" },
  badge: { w: 54, h: 86, ar: "بطاقة موظف (54×86)", en: "Employee badge" },
};

/** The card settings (`bizcard_cfg`); every field has the design's default. */
export interface CardCfg {
  lang: "ar" | "en" | "bi";
  accent: string;
  accent2: string;
  paper: string;
  showMobile: boolean;
  showEmail: boolean;
  showWeb: boolean;
  showPhone: boolean;
  showAddress: boolean;
  showDept: boolean;
  website: string;
  phone: string;
  address: string;
  country: string;
}

export const BC_DEF: CardCfg = {
  lang: "bi", accent: "#014D3D", accent2: "#b8924a", paper: "#f6f0e4", showMobile: true, showEmail: true,
  showWeb: true, showPhone: true, showAddress: false, showDept: true, website: "", phone: "", address: "",
  country: "SA",
};

export type ElementKind = "text" | "photo" | "qr" | "logo" | "shape";

export interface CardEl {
  id: string;
  t: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  txt?: string;
  fs?: number;
  fw?: number;
  c?: string;
  al?: "l" | "c" | "r";
  bg?: string;
  bd?: string;
  bw?: number;
  r?: number;
  op?: number;
  ls?: number;
  pad?: number;
}

export interface CardSide {
  bg?: string;
  img?: string;
  imgOp?: number;
  els: CardEl[];
}

export interface CardDesign {
  card: { front: CardSide; back: CardSide };
  badge: { front: CardSide; back: CardSide };
}

/** The employee fields the card prints; `photoUrl` is a data: URL the screen resolves first. */
export interface CardEmployee {
  id: string;
  emp_no: string;
  name_ar: string;
  name_en?: string | null;
  job_title?: string | null;
  department?: string | null;
  employer?: string | null;
  mobile?: string | null;
  email?: string | null;
  photoUrl?: string | null;
}

export interface CardCompany {
  ar: string;
  en: string;
}

export interface CardContext {
  cfg: CardCfg;
  co: CardCompany;
  logo: string | null;
}

export const FIELDS: [keyof CardEmployee | "job" | "dept" | "empNo" | "company", string][] = [
  ["name_ar", "الاسم عربي"], ["name_en", "الاسم إنجليزي"], ["job_title", "الوظيفة"],
  ["department", "القسم"], ["emp_no", "الرقم الوظيفي"], ["mobile", "الجوال"], ["email", "البريد"],
];

const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

/** Resolve a colour token (`@A` accent, `@B` second accent, `@W` white, `@K` ink, `@BG` paper). */
export const colr = (c: string | undefined, cfg: CardCfg): string =>
  c === "@A" ? cfg.accent : c === "@B" ? cfg.accent2 : c === "@W" ? "#ffffff" : c === "@K" ? "#141a1f"
    : c === "@BG" ? (cfg.paper || "#f6f0e4") : /^#[0-9a-f]{6}$/i.test(c || "") ? (c as string) : c || "transparent";

const vals = (e: CardEmployee, cfg: CardCfg, co: CardCompany) => ({
  nameAr: e.name_ar || e.name_en || "",
  nameEn: e.name_en && e.name_en !== e.name_ar ? e.name_en : "",
  job: e.job_title || "",
  dept: cfg.showDept === false ? "" : e.department || "",
  empNo: e.emp_no || "",
  mobile: cfg.showMobile === false ? "" : e.mobile || "",
  email: cfg.showEmail === false ? "" : e.email || "",
  phone: cfg.showPhone === false ? "" : cfg.phone || "",
  website: cfg.showWeb === false ? "" : String(cfg.website || "").replace(/^https?:\/\//, ""),
  address: cfg.showAddress ? cfg.address || "" : "",
  company: co.ar || co.en || "",
});


/** One element as HTML. Text placeholders (`{nameAr}` …) are filled from the employee. */
export function elHtml(el: CardEl, e: CardEmployee, ctx: CardContext): string {
  const { cfg, co, logo } = ctx;
  const p = `position:absolute;left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;`;
  const op = el.op != null && el.op < 1 ? `opacity:${el.op};` : "";
  if (el.t === "text") {
    const v = vals(e, cfg, co) as Record<string, string>;
    const txt = String(el.txt || "").replace(/\{(\w+)\}/g, (_m, k: string) => esc(v[k] ?? ""));
    if (!txt.replace(/<[^>]*>/g, "").trim()) return "";
    const align = { l: "left", c: "center", r: "right" }[el.al || "r"];
    return `<div dir="auto" style="${p}${op}font-size:${el.fs}mm;font-weight:${el.fw || 400};color:${colr(el.c, cfg)};text-align:${align};line-height:1.25;letter-spacing:${el.ls || 0}mm;white-space:pre-wrap;overflow:hidden;unicode-bidi:plaintext">${txt}</div>`;
  }
  if (el.t === "photo") {
    const rad = (el.r ?? 0) >= 50 ? "50%" : `${el.r || 0}mm`;
    const bd = el.bw ? `border:${el.bw}mm solid ${colr(el.bd, cfg)};` : "";
    const img = e.photoUrl && /^(https?:|data:image\/|blob:)/i.test(e.photoUrl)
      ? `<img src="${esc(e.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${Math.min(el.w, el.h) * 0.45}mm">${esc(String(e.name_ar || e.name_en || "؟").trim().charAt(0))}</div>`;
    return `<div style="${p}${op}border-radius:${rad};overflow:hidden;background:${colr(el.bg || "@A", cfg)};${bd}box-sizing:border-box">${img}</div>`;
  }
  if (el.t === "qr") {
    const svg = qrSvg(vcardForEmp(e, cfg, co), { fg: colr(el.c || "#111111", cfg), bg: colr(el.bg || "@W", cfg), quiet: 0 });
    return `<div style="${p}${op}background:${colr(el.bg || "@W", cfg)};padding:${el.pad == null ? 1.6 : el.pad}mm;border-radius:${el.r == null ? 2 : el.r}mm;box-sizing:border-box" class="qrb">${svg}</div>`;
  }
  if (el.t === "logo") {
    const box = `<img src="${esc(logo)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain">`;
    const fallback = `<b style="font-size:${Math.min(el.h * 0.5, 5)}mm;color:${colr(el.c || "@A", cfg)}">${esc((co.en || co.ar || "").slice(0, 16))}</b>`;
    return `<div style="${p}${op}display:flex;align-items:center;justify-content:${({ l: "flex-start", c: "center", r: "flex-end" } as const)[el.al || "c"]}">${logo ? box : fallback}</div>`;
  }
  if (el.t === "shape") {
    const rad = (el.r ?? 0) >= 50 ? "50%" : `${el.r || 0}mm`;
    const bd = el.bw ? `border:${el.bw}mm solid ${colr(el.bd, cfg)};` : "";
    return `<div style="${p}${op}background:${colr(el.bg, cfg)};border-radius:${rad};${bd}box-sizing:border-box"></div>`;
  }
  return "";
}

const BASE =
  '.bcx{box-sizing:border-box;position:relative;overflow:hidden;font-family:Cairo,Tajawal,"Segoe UI",Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  ".bcx *{box-sizing:border-box}.bcx .qrb svg{width:100%;height:100%;display:block}";

/** One face of a card as HTML (no `<style>`); `cardSide` adds the stylesheet for a standalone document. */
export function sideHtml(kind: CardKind, side: CardSide, e: CardEmployee, ctx: CardContext): string {
  const K = KINDS[kind];
  const img = side.img
    ? `<div style="position:absolute;inset:0;background:url(${esc(side.img)}) center/cover no-repeat;opacity:${side.imgOp == null ? 1 : side.imgOp}"></div>`
    : "";
  return `<div class="bcx" style="width:${K.w}mm;height:${K.h}mm;background:${colr(side.bg || "@W", ctx.cfg)}">${img}${(side.els || [])
    .map((el) => elHtml(el, e, ctx))
    .join("")}</div>`;
}

export const cardSide = (kind: CardKind, side: CardSide, e: CardEmployee, ctx: CardContext) =>
  `<style>${BASE}</style>${sideHtml(kind, side, e, ctx)}`;



/** The vCard a card's QR carries, from the employee and the settings (the design's `vcardForEmp`). */
export function vcardForEmp(e: CardEmployee, cfg: CardCfg, co: CardCompany): string {
  return vcardOf({
    nameAr: e.name_ar, nameEn: e.name_en || "", title: e.job_title || "", dept: cfg.showDept === false ? "" : e.department || "",
    mobile: cfg.showMobile === false ? "" : e.mobile || "", email: cfg.showEmail === false ? "" : e.email || "",
    company: co.ar, companyEn: co.en, website: cfg.showWeb === false ? "" : cfg.website,
    phone: cfg.showPhone === false ? "" : cfg.phone, address: cfg.showAddress ? cfg.address : "",
    lang: cfg.lang === "en" ? "en" : "ar", country: cfg.country,
  });
}

/** `05xxxxxxxx` → `+9665xxxxxxxx`, `01xxxxxxxxx` (Egypt) → `+201xxxxxxxxx`, anything else kept. */
export function normPhone(p: string | null | undefined, country?: string): string {
  const d = String(p || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (country === "EG" && /^01\d{9}$/.test(d)) return "+20" + d.slice(1);
  if (/^05\d{8}$/.test(d)) return "+966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "+966" + d;
  if (/^966\d{9}$/.test(d)) return "+" + d;
  if (/^20\d{10}$/.test(d)) return "+" + d;
  return d;
}

const vesc = (s: unknown) =>
  String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n").trim();

const splitName = (n: string) => {
  const parts = String(n || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [parts[0] || "", ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
};

export interface VCardInput {
  nameAr?: string;
  nameEn?: string;
  title?: string;
  dept?: string;
  mobile?: string;
  email?: string;
  company?: string;
  companyEn?: string;
  website?: string;
  phone?: string;
  address?: string;
  lang?: "ar" | "en";
  country?: string;
}

/** vCard 3.0 in UTF-8 — a phone camera reads the QR and offers «add contact». */
export function vcardOf(c: VCardInput): string {
  const en = c.lang === "en";
  const name = (en ? c.nameEn || c.nameAr : c.nameAr || c.nameEn) || "";
  const [given, family] = splitName(name);
  const org = (en ? c.companyEn || c.company : c.company || c.companyEn) || "";
  const title = c.title || "";
  const dept = c.dept || "";
  const L = ["BEGIN:VCARD", "VERSION:3.0", `N;CHARSET=UTF-8:${vesc(family)};${vesc(given)};;;`, `FN;CHARSET=UTF-8:${vesc(name)}`];
  if (org) L.push(`ORG;CHARSET=UTF-8:${vesc(org)}${dept ? ";" + vesc(dept) : ""}`);
  if (title) L.push(`TITLE;CHARSET=UTF-8:${vesc(title)}`);
  const mob = normPhone(c.mobile, c.country);
  if (mob) L.push(`TEL;TYPE=CELL,VOICE:${mob}`);
  const ph = normPhone(c.phone, c.country);
  if (ph) L.push(`TEL;TYPE=WORK,VOICE:${ph}`);
  if (c.email) L.push(`EMAIL;TYPE=INTERNET,WORK:${vesc(c.email)}`);
  if (c.website) L.push(`URL:${String(c.website).trim()}`);
  if (c.address) L.push(`ADR;TYPE=WORK;CHARSET=UTF-8:;;${vesc(c.address)};;;;`);
  L.push("END:VCARD");
  return L.join("\r\n");
}

/** A QR code as one SVG path — drawn locally by the vendored encoder, no service call. */
export function qrSvg(text: string, { fg = "#000000", bg = "#ffffff", quiet = 2, level = "M" as const } = {}): string {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const q = qrcode(0, level);
  q.addData(String(text), "Byte");
  q.make();
  const n = q.getModuleCount();
  const t = n + quiet * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    let run = 0;
    for (let c = 0; c <= n; c++) {
      if (c < n && q.isDark(r, c)) run++;
      else if (run) {
        d += `M${c - run + quiet} ${r + quiet}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" style="display:block;width:100%;height:100%"><rect width="${t}" height="${t}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}



/* ------------------------------------------------------------------ the ready-made templates */

let _id = 0;
const nid = () => `e${Date.now().toString(36)}${++_id}`;
const T = (x: number, y: number, w: number, h: number, txt: string, fs: number, o: Partial<CardEl> = {}): CardEl =>
  ({ id: nid(), t: "text", x, y, w, h, txt, fs, fw: 600, c: "@K", al: "r", ...o });
const S = (x: number, y: number, w: number, h: number, bg: string, o: Partial<CardEl> = {}): CardEl =>
  ({ id: nid(), t: "shape", x, y, w, h, bg, ...o });
const L = (x: number, y: number, w: number, h: number, o: Partial<CardEl> = {}): CardEl =>
  ({ id: nid(), t: "logo", x, y, w, h, al: "c", ...o });
const Q = (x: number, y: number, w: number, o: Partial<CardEl> = {}): CardEl =>
  ({ id: nid(), t: "qr", x, y, w, h: w, c: "#111111", bg: "@W", pad: 1.4, r: 2, ...o });
const P = (x: number, y: number, w: number, h: number, o: Partial<CardEl> = {}): CardEl =>
  ({ id: nid(), t: "photo", x, y, w, h, r: 50, bg: "@A", ...o });

export const TPLS: Record<CardKind, [string, string][]> = {
  card: [["classic", "كلاسيك راقٍ"], ["dark", "داكن فاخر"], ["modern", "عصري بلوحة جانبية"]],
  badge: [["exec", "تنفيذي (بيج وأخضر)"], ["dark", "داكن ذهبي"], ["split", "صورة علوية كاملة"]],
};

type Face = { front: CardSide; back: CardSide };

export function preset(kind: CardKind, key: string): Face {
  if (kind === "card") {
    if (key === "dark") {
      return {
        front: {
          bg: "@A",
          els: [
            L(40, 8, 55, 40, { op: 0.07, al: "r" }), S(2.5, 2.5, 85, 45, "transparent", { bd: "@B", bw: 0.25, r: 1.5 }),
            L(6, 5, 26, 9, { al: "l" }), T(6, 17, 78, 9, "{nameAr}", 6, { fw: 800, c: "@W" }),
            T(6, 25.5, 78, 5, "{nameEn}", 3.4, { c: "@B", al: "r" }), T(6, 30, 78, 5, "{job}", 3.3, { c: "@B", fw: 700 }),
            S(6, 36, 78, 0.25, "@B"), T(6, 38, 78, 4, "{mobile}", 3, { c: "@W" }), T(6, 42, 78, 4, "{email}", 3, { c: "@W" }),
          ],
        },
        back: {
          bg: "@K",
          els: [
            S(0, 47.5, 90, 2.5, "@B"), Q(9, 8, 34, { c: "@A", pad: 2 }), L(50, 8, 32, 12, { al: "c" }),
            T(48, 24, 36, 5, "امسح لحفظ جهة الاتصال", 3.2, { c: "@W", al: "c", fw: 700 }),
            T(48, 29.5, 36, 4, "Scan to save contact", 2.7, { c: "@B", al: "c" }),
            T(48, 36, 36, 4, "{company}", 2.6, { c: "@W", al: "c", op: 0.8 }),
          ],
        },
      };
    }
    if (key === "modern") {
      return {
        front: {
          bg: "@W",
          els: [
            S(0, 0, 27, 50, "@A"), L(3, 8, 21, 20, {}), T(2, 32, 23, 8, "{company}", 2.4, { c: "@W", al: "c", fw: 700 }),
            T(31, 9, 55, 9, "{nameAr}", 5.8, { c: "@A", fw: 800 }), T(31, 17.5, 55, 5, "{nameEn}", 3.3, { c: "#555555" }),
            T(31, 22.5, 55, 5, "{job}", 3.3, { c: "@B", fw: 700 }), S(31, 29.5, 55, 0.3, "@B"),
            T(31, 31.5, 55, 4, "{mobile}", 3), T(31, 35.5, 55, 4, "{email}", 3), T(31, 39.5, 55, 4, "{website}", 3),
          ],
        },
        back: {
          bg: "@A",
          els: [
            Q(10, 8, 34, { pad: 2 }), L(51, 9, 30, 12, {}),
            T(48, 25, 36, 5, "امسح لحفظ جهة الاتصال", 3.2, { c: "@W", al: "c", fw: 700 }),
            T(48, 31, 36, 4, "{company}", 2.6, { c: "@B", al: "c" }),
          ],
        },
      };
    }
    return {
      front: {
        bg: "@W",
        els: [
          S(0, 0, 4, 50, "@A"), S(4, 0, 1, 50, "@B"), L(10, 5, 30, 11, { al: "l" }),
          T(28, 17, 56, 9, "{nameAr}", 5.6, { c: "@A", fw: 800 }), T(28, 25.5, 56, 5, "{nameEn}", 3.3, { c: "#555555" }),
          T(28, 30, 56, 5, "{job}", 3.3, { c: "@B", fw: 700 }), S(28, 36, 56, 0.3, "@B"),
          T(28, 38, 56, 4, "{mobile}", 3), T(28, 42, 56, 4, "{email}", 3),
        ],
      },
      back: {
        bg: "@W",
        els: [
          S(0, 0, 90, 4, "@A"), Q(9, 9, 34, { pad: 2, bd: "@B" }), L(51, 10, 30, 12, {}),
          T(48, 26, 36, 5, "امسح لحفظ جهة الاتصال", 3.2, { c: "@A", al: "c", fw: 700 }),
          T(48, 32, 36, 4, "{company}", 2.6, { c: "#555555", al: "c" }), S(0, 46, 90, 4, "@B"),
        ],
      },
    };
  }


  const back = (bg: string, fg: string, acc: string): CardSide => ({
    bg,
    els: [
      L(2, 18, 50, 50, { op: 0.1 }), L(9, 6, 36, 12, {}),
      T(5, 24, 44, 4, "الرقم الوظيفي", 2.6, { c: acc, al: "c", fw: 700 }),
      T(5, 28, 44, 8, "{empNo}", 6.5, { c: fg, al: "c", fw: 800 }), S(18, 39, 18, 0.3, acc),
      T(5, 42, 44, 4, "الهاتف", 2.6, { c: acc, al: "c", fw: 700 }),
      T(5, 46, 44, 5, "{mobile}", 4, { c: fg, al: "c" }),
      T(5, 54, 44, 4, "البريد الإلكتروني", 2.6, { c: acc, al: "c", fw: 700 }),
      T(2, 58, 50, 5, "{email}", 3.2, { c: fg, al: "c" }),
      T(5, 70, 44, 5, "{company}", 3, { c: fg, al: "c", op: 0.85 }), S(0, 82.5, 54, 3.5, acc),
    ],
  });
  if (key === "dark") {
    return {
      front: {
        bg: "@K",
        els: [
          S(2, 2, 50, 82, "transparent", { bd: "@B", bw: 0.25, r: 2 }), L(9, 6, 36, 11, {}),
          P(13, 18, 28, 28, { bd: "@B", bw: 0.7 }), T(3, 48, 48, 7, "{nameAr}", 4.6, { c: "@W", al: "c", fw: 800 }),
          T(3, 54.5, 48, 4, "{nameEn}", 2.7, { c: "@B", al: "c" }), T(3, 58.5, 48, 5, "{job}", 3.1, { c: "@B", al: "c", fw: 700 }),
          Q(17.5, 64.5, 19, { c: "@K", pad: 0.8, r: 1.2 }),
        ],
      },
      back: back("@K", "@W", "@B"),
    };
  }
  if (key === "split") {
    return {
      front: {
        bg: "@W",
        els: [
          P(0, 0, 54, 44, { r: 0, bg: "@A" }), S(0, 36, 54, 10, "@W", { r: 4, op: 1 }), S(0, 40, 54, 46, "@W"),
          L(3, 3, 22, 8, { al: "l" }), T(3, 45, 48, 7, "{nameAr}", 4.6, { c: "@A", al: "c", fw: 800 }),
          T(3, 51.5, 48, 4, "{nameEn}", 2.7, { c: "#555555", al: "c" }),
          T(3, 55.5, 48, 5, "{job}", 3.1, { c: "@B", al: "c", fw: 700 }),
          Q(17.5, 62.5, 19, { c: "@A", pad: 0.8, r: 1.2 }), S(0, 83, 54, 3, "@A"),
        ],
      },
      back: back("@A", "@W", "@B"),
    };
  }
  return {
    front: {
      bg: "@BG",
      els: [
        S(0, 0, 54, 27, "@A"), S(0, 0, 54, 1.4, "@B"), L(9, 3.5, 36, 11, {}),
        P(13, 14, 28, 28, { bd: "@W", bw: 1, bg: "@A" }), T(3, 44, 48, 7, "{nameAr}", 4.6, { c: "@A", al: "c", fw: 800 }),
        T(3, 50.5, 48, 4, "{nameEn}", 2.7, { c: "#555555", al: "c" }),
        T(3, 54.5, 48, 5, "{job}", 3.1, { c: "@B", al: "c", fw: 700 }),
        T(3, 59, 48, 4, "{dept}", 2.5, { c: "#555555", al: "c" }),
        Q(17.5, 64, 19, { c: "@A", bg: "@W", pad: 0.8, r: 1.2 }), S(0, 84.6, 54, 1.4, "@B"),
      ],
    },
    back: back("@A", "@W", "@B"),
  };
}


export const defaultDesign = (): CardDesign => ({ card: preset("card", "classic"), badge: preset("badge", "exec") });

/** The design an employee gets: their own if they have one, otherwise the company design. */
export const designOf = (company: CardDesign, mine?: Partial<CardDesign> | null): CardDesign => ({
  card: (mine && mine.card) || company.card,
  badge: (mine && mine.badge) || company.badge,
});

/** `true` when the object really is a design (both kinds, both faces) — a guard for what the API returns. */
export function isDesign(value: unknown): value is CardDesign {
  const d = value as CardDesign | null;
  return !!d && !!d.card && !!d.badge && Array.isArray(d.card.front?.els) && Array.isArray(d.badge.front?.els);
}


/** An A4 sheet: 2×5 business cards or 3×3 badges, with cut guides; `which` picks front, back or both. */
export function sheetHtml(list: CardEmployee[], kind: CardKind, design: CardDesign, cfg: CardCfg,
                          co: CardCompany, logo: string | null, which: "both" | "front" | "back" = "both"): string {
  const K = KINDS[kind];
  const cols = kind === "card" ? 2 : 3;
  const rows = kind === "card" ? 5 : 3;
  const per = cols * rows;
  const px = (210 - cols * K.w) / 2;
  const py = (297 - rows * K.h) / 2 - 2;
  const ctx: CardContext = { cfg, co, logo };
  const pages: CardEmployee[][] = [];
  for (let i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
  const grid = (items: CardEmployee[], side: "front" | "back", mirror: boolean) => {
    let cells: (CardEmployee | null)[] = items.slice();
    if (mirror) {
      const out: (CardEmployee | null)[] = [];
      for (let i = 0; i < cells.length; i += cols) {
        const row = cells.slice(i, i + cols);
        out.push(...row.reverse(), ...(Array(Math.max(0, cols - row.length)).fill(null) as null[]));
      }
      cells = out;
    }
    return `<div class="pg"><div class="gd">${cells
      .map((x) => `<div class="cl">${x ? sideHtml(kind, design[kind][side], x, ctx) : ""}</div>`)
      .join("")}</div></div>`;
  };
  let h =
    `<style>${BASE}@page{size:A4;margin:0}html,body{margin:0!important;background:#fff}` +
    `.pg{width:210mm;height:297mm;padding:${py}mm ${px}mm 0;page-break-after:always;position:relative}` +
    `.pg:last-child{page-break-after:auto}.gd{display:grid;grid-template-columns:repeat(${cols},${K.w}mm);grid-auto-rows:${K.h}mm}` +
    `.cl{width:${K.w}mm;height:${K.h}mm;outline:.12mm solid #c9c9c9;outline-offset:-.06mm}</style>`;
  pages.forEach((pg) => {
    if (which !== "back") h += grid(pg, "front", false);
    if (which !== "front") h += grid(pg, "back", which === "both");
  });
  return h;
}

const MM = 3.7795;

/** One face as a PNG blob: the HTML goes through an SVG `foreignObject`, so images must be data: URLs. */
export async function toPng(html: string, kind: CardKind, scale = 4): Promise<Blob | null> {
  const K = KINDS[kind];
  const W = Math.round(K.w * MM);
  const H = Math.round(K.h * MM);
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const xml = new XMLSerializer().serializeToString(holder);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}">` +
    `<foreignObject width="${W}" height="${H}">${xml}</foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("تعذر تجهيز صورة البطاقة"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  canvas.getContext("2d")?.drawImage(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** The `.vcf` file a phone opens as a contact. */
export function downloadVcf(text: string, name: string): void {
  downloadBlob(new Blob([text], { type: "text/vcard;charset=utf-8" }), (name || "contact").replace(/[\\/:*?"<>|]+/g, " ").trim() + ".vcf");
}

/** Download any blob under a file name. */
export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

