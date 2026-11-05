// The design's seal studio (ARIBA_HR_React lib/sealStudio.js), typed and React-free: where the company
// stamp, the signature and the signer's name/title sit on an A4 page. The positions are remembered in this
// browser per document type (`ariba_seal_pos`, as the design did) and the last choices too
// (`ariba_seal_flags`, `ariba_seal_auto2`), so an export the owner sealed once can repeat it silently.
//
// The studio itself is components/hr/seal-studio.tsx; lib/exporter.ts draws `overlayHtml()` over page 1 of
// the PDF (the design's exporter did the same). Only the one signer saved in Settings is available: the
// design could also pick any employee, but we store a single signature (`hr_signer` sheet, V120).

export interface SealPos {
  /** left as a fraction of the A4 width, 0 … 1 */
  x: number;
  /** top as a fraction of the A4 height, 0 … 0.99 */
  y: number;
  /** width in millimetres */
  w: number;
  /** rotation in degrees */
  r: number;
}
export interface SealTextPos {
  x: number;
  y: number;
}
export interface SealPositions {
  stamp: SealPos;
  sig: SealPos;
  txt: SealTextPos;
}

export interface SealState {
  lang: "ar" | "en";
  signerId: string;
  /** the title line under the signature («مدير الموارد البشرية») */
  title: string;
  /** the signer's name */
  name: string;
  sig: string | null;
  stamp: string | null;
  showStamp: boolean;
  showSig: boolean;
  showTxt: boolean;
  pos: SealPositions;
}

/** 1 mm in CSS pixels at 96 dpi — the overlay is written in millimetres, as the design's was. */
export const MM = 96 / 25.4;
/** The A4 page the studio draws and the overlay is positioned on. */
export const SEAL_W = 794;
export const SEAL_H = 1123;

const LS_POS = "ariba_seal_pos";
const LS_FLAGS = "ariba_seal_flags";
const LS_AUTO = "ariba_seal_auto2";

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* a full or blocked store just forgets the positions */
  }
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The design's starting places: stamp right of the signature, the name/title line above both. */
export const defaultPositions = (): SealPositions => ({
  stamp: { x: 0.56, y: 0.78, w: 38, r: -7 },
  sig: { x: 0.3, y: 0.79, w: 30, r: -3 },
  txt: { x: 0.3, y: 0.74 },
});

/** One key per document type, so each form keeps its own places (the design's docKey). */
export const docKey = (title: string) =>
  String(title || "")
    .split(" — ")[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40) || "doc";

export function loadPositions(key: string): SealPositions | null {
  try {
    const all = JSON.parse(lsGet(LS_POS) || "null") as Record<string, SealPositions> | null;
    const p = all && all[key];
    if (p && p.stamp && p.sig && p.txt) return p;
  } catch {
    /* ignored: an older or broken store starts from the defaults */
  }
  return null;
}

export function savePositions(key: string, pos: SealPositions) {
  let all: Record<string, SealPositions> = {};
  try {
    all = (JSON.parse(lsGet(LS_POS) || "{}") || {}) as Record<string, SealPositions>;
    if (!all || typeof all !== "object" || "stamp" in all) all = {};
  } catch {
    all = {};
  }
  all[key] = pos;
  lsSet(LS_POS, JSON.stringify(all));
}


export interface SealFlags {
  signerId: string;
  title: string;
  name: string;
  showStamp: boolean;
  showSig: boolean;
  showTxt: boolean;
}

export function loadFlags(): Partial<SealFlags> | null {
  try {
    const f = JSON.parse(lsGet(LS_FLAGS) || "null");
    return f && typeof f === "object" ? (f as Partial<SealFlags>) : null;
  } catch {
    return null;
  }
}

export const saveFlags = (f: SealFlags) => lsSet(LS_FLAGS, JSON.stringify(f));

/** «لا تسألني في المرة القادمة»: the design's sealAuto switch, kept per browser. */
export const sealAuto = () => lsGet(LS_AUTO) === "1";
export const setSealAuto = (on: boolean) => lsSet(LS_AUTO, on ? "1" : "0");

/** The signer as Settings saves it (`hr_signer` sheet, lib/calc/forms.ts Signer). */
export interface SheetSigner {
  name_ar?: string;
  title_ar?: string;
  title_en?: string;
  signature?: string | null;
  stamp?: string | null;
  show_signature?: boolean;
  show_stamp?: boolean;
}

/** The studio's opening state: the Settings signer, his saved places and the last choices. */
export function sealState(lang: "ar" | "en", key: string, signer: SheetSigner | null, pageTitle?: string): SealState {
  const s = signer ?? {};
  const saved = loadPositions(key);
  const flags = loadFlags();
  const title = lang === "en" ? s.title_en || s.title_ar || "" : s.title_ar || s.title_en || "";
  return {
    lang,
    signerId: "default",
    title: flags?.title ?? title,
    name: flags?.name ?? s.name_ar ?? "",
    sig: s.signature ?? null,
    stamp: s.stamp ?? null,
    showStamp: flags?.showStamp ?? (!!s.stamp && s.show_stamp !== false),
    showSig: flags?.showSig ?? (!!s.signature && s.show_signature !== false),
    showTxt: flags?.showTxt ?? !!pageTitle,
    pos: saved ?? defaultPositions(),
  };
}

/** The design's overlayHtml: an A4 layer in millimetres, positioned absolutely over the page. */
export function overlayHtml(st: SealState): string {
  const mm = (px: number) => (px / MM).toFixed(2) + "mm";
  const blend = "mix-blend-mode:multiply;";
  let h = "";
  if (st.showStamp && st.stamp) {
    h +=
      '<img src="' + st.stamp + '" alt="" style="position:absolute;left:' + mm(st.pos.stamp.x * SEAL_W) + ";top:" + mm(st.pos.stamp.y * SEAL_H) +
      ";width:" + st.pos.stamp.w + "mm;height:auto;transform:rotate(" + st.pos.stamp.r + "deg);" + blend + 'opacity:.9;filter:contrast(1.06)">';
  }
  if (st.showSig && st.sig) {
    h +=
      '<img src="' + st.sig + '" alt="" style="position:absolute;left:' + mm(st.pos.sig.x * SEAL_W) + ";top:" + mm(st.pos.sig.y * SEAL_H) +
      ";width:" + st.pos.sig.w + "mm;height:auto;max-height:" + (st.pos.sig.w * 0.6).toFixed(1) + "mm;object-fit:contain;transform:rotate(" +
      st.pos.sig.r + "deg);" + blend + 'filter:contrast(1.1)">';
  }
  if (st.showTxt && (st.title || st.name)) {
    h +=
      '<div style="position:absolute;left:' + mm(st.pos.txt.x * SEAL_W) + ";top:" + mm(st.pos.txt.y * SEAL_H) +
      ";transform:translateX(-50%);min-width:55mm;text-align:center;line-height:1.5;font-size:13px;color:#111;white-space:nowrap\" dir=\"" +
      (st.lang === "en" ? "ltr" : "rtl") + '"><div style="font-weight:800">' + esc(st.title) + "</div>" +
      (st.name ? '<div style="font-weight:700">' + esc(st.name) + "</div>" : "") + "</div>";
  }
  return '<div class="seal-ov" style="position:absolute;left:0;top:0;width:210mm;height:297mm;overflow:hidden;pointer-events:none;z-index:50">' + h + "</div>";
}

/** A whole A4 page around a piece of a report, so the studio previews what will be printed. */
export function previewDoc(inner: string, dir: "rtl" | "ltr"): string {
  return (
    '<!doctype html><html dir="' + dir + '" lang="' + (dir === "rtl" ? "ar" : "en") + '"><head><meta charset="utf-8">' +
    "<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}" +
    'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#14231d}' +
    ".pg{width:210mm;min-height:297mm;padding:10mm;box-sizing:border-box}</style></head><body><div class=\"pg\">" +
    inner +
    "</div></body></html>"
  );
}
