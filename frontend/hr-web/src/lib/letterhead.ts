// The saved letterhead (Settings ▸ الورق الرسمي, Stage 16) for every print: forms, letters, salary certificate, offer,
// settlement and payslip. Loaded once by the HR shell (`loadLetterhead`), then read synchronously by the builders.
// With nothing saved the prints keep today's Ariba header and footer (the design's «ورق أريبا الجاهز»); `default`
// chosen in Settings prints without letterhead; `page` draws the saved A4 background with its top / bottom margins.
import { request } from "./api";

export type LetterheadMode = "default" | "page" | "hf";
export interface Letterhead {
  mode: LetterheadMode | null;
  page?: string;
  head?: string;
  foot?: string;
  top?: number;
  bottom?: number;
  preset?: "ariba" | null;
}

export const getLetterhead = () => request<Letterhead>("/settings/letterhead");
export const putLetterhead = (body: Omit<Letterhead, "mode"> & { mode: LetterheadMode }) =>
  request<Letterhead>("/settings/letterhead", { method: "PUT", body });

let saved: Letterhead | null = null;

export async function loadLetterhead(): Promise<Letterhead | null> {
  try {
    saved = await getLetterhead();
  } catch {
    saved = null; // a role that may not read it prints with the Ariba header and footer
  }
  return saved;
}
export const setLetterheadCache = (value: Letterhead | null) => {
  saved = value;
};

const img = (s?: string) => !!s && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(s);
const ARIBA = (origin: string) => ({ head: `${origin}/brand/letterhead-header.jpg`, foot: `${origin}/brand/letterhead-footer.jpg` });

/** What goes above the document: an image, the A4 background plus its top margin, or a plain top margin. */
export function lhHead(origin: string, lh: Letterhead | null = saved): string {
  if (!lh || !lh.mode) return `<img class="lh-head" src="${ARIBA(origin).head}">`;
  if (lh.mode === "default") return '<div style="height:14mm"></div>';
  if (lh.mode === "page") {
    const bg = img(lh.page)
      ? `<div style="position:fixed;left:0;top:0;width:210mm;height:297mm;z-index:-1;background:url('${lh.page}') no-repeat 0 0/100% 100%"></div>`
      : "";
    return `${bg}<div style="height:${lh.top ?? 42}mm"></div>`;
  }
  if (lh.preset === "ariba") return `<img class="lh-head" src="${ARIBA(origin).head}">`;
  return img(lh.head) ? `<img class="lh-head" src="${lh.head}">` : "";
}

/** What goes below it: the footer image, the bottom margin of a page background, or nothing. */
export function lhFoot(origin: string, lh: Letterhead | null = saved): string {
  if (!lh || !lh.mode) return `<img class="lh-foot" src="${ARIBA(origin).foot}">`;
  if (lh.mode === "default") return "";
  if (lh.mode === "page") return `<div style="height:${lh.bottom ?? 30}mm"></div>`;
  if (lh.preset === "ariba") return `<img class="lh-foot" src="${ARIBA(origin).foot}">`;
  return img(lh.foot) ? `<img class="lh-foot" src="${lh.foot}">` : "";
}
