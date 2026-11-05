// The company's colours on the HR portal: the updated design's palette derivation (its lib/brand.js, from the
// old system's V146), fed by OUR `GET /public/brand` instead of a Supabase settings row. Every value is checked
// as a hex colour before it reaches CSS. The design's rule for its AI button is left out (out of scope).

export type BrandColours = { p?: string; s?: string; a?: string; reset?: boolean };
export type PublicBrand = {
  brand: BrandColours & Record<string, unknown>;
  names: { coAr: string; coEn: string };
  logo: string | null;
  appLogo: string | null;
};

const HEX = /^#[0-9a-f]{6}$/i;
/** `#abc` → `#aabbcc` (our /public/brand allows the short form, the palette needs six digits) */
const long = (h?: string) => (h && /^#[0-9a-f]{3}$/i.test(h) ? "#" + h.slice(1).split("").map((c) => c + c).join("") : h ?? "");
export const validHex = (h: string) => HEX.test(h);

type RGB = [number, number, number];
function hex2rgb(h: string): RGB {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb2hex = (r: number[]) =>
  "#" + r.map((v) => { const x = Math.max(0, Math.min(255, Math.round(v))); return (x < 16 ? "0" : "") + x.toString(16); }).join("").toUpperCase();
function rgb2hsl(r: RGB): RGB {
  const R = r[0] / 255, G = r[1] / 255, B = r[2] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h0: number, s: number, l: number): RGB {
  const h = ((h0 % 360) + 360) % 360, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function palette(p: string, s: string, a: string) {
  const P = hex2rgb(p), S = hex2rgb(s), hp = rgb2hsl(P), hs = rgb2hsl(S);
  const A = validHex(a) ? hex2rgb(a) : hsl2rgb(hp[0], Math.min(0.7, Math.max(0.45, hp[1] * 0.7)), 0.43);
  const dk = (l: number, sat?: number) => rgb2hex(hsl2rgb(hp[0], sat ?? 0.52, l));
  return {
    P: rgb2hex(P), A: rgb2hex(A), S: rgb2hex(S),
    bdL: rgb2hex(hsl2rgb(hs[0], Math.min(hs[1], 0.3), Math.max(0.05, hs[2] - 0.11))),
    dBg: dk(0.06, 0.55), dP: dk(0.09), dC: dk(0.11), dC2: dk(0.14), dBd: dk(0.21, 0.5),
    dTx: rgb2hex(hsl2rgb(hp[0], 0.45, 0.95)), dMu: rgb2hex(hsl2rgb(hp[0], 0.18, 0.67)), dDm: rgb2hex(hsl2rgb(hp[0], 0.15, 0.45)),
    lMu: rgb2hex(hsl2rgb(hp[0], 0.18, 0.34)), lDm: rgb2hex(hsl2rgb(hp[0], 0.12, 0.5)),
  };
}

const ID = "ariba-brand-css";

/** Paint the portal in the company's colours, or remove the paint when there are none (or `reset`). */
export function applyBrand(b: BrandColours | null | undefined) {
  let el = document.getElementById(ID);
  const p = long(b?.p), s = long(b?.s), a = long(b?.a);
  if (!b || b.reset || !validHex(p) || !validHex(s)) {
    el?.remove();
    return;
  }
  const pal = palette(p, s, a);
  const D = 'html[data-ariba-theme="dark"]', L = 'html[data-ariba-theme="light"]';
  const hp = rgb2hsl(hex2rgb(pal.P)), dkc = (l: number) => rgb2hex(hsl2rgb(hp[0], 0.52, l));
  const Ar = hex2rgb(pal.A).join(",");
  const css =
    `html{--gr:${pal.A};--ariba-dark:${pal.P};--ariba-bright:${pal.A}}` +
    `${L}{--bg:${pal.S};--c2:${pal.S};--bd:${pal.bdL};--bl:${pal.P};--gr:${pal.A};--cy:${pal.P};--pu:${pal.P};--mu:${pal.lMu};--dm:${pal.lDm}}` +
    `${D}{--bg:${pal.dBg};--p:${pal.dP};--c:${pal.dC};--c2:${pal.dC2};--bd:${pal.dBd};--bl:${pal.A};--gr:${pal.A};--cy:${pal.A};--pu:${pal.P};--tx:${pal.dTx};--mu:${pal.dMu};--dm:${pal.dDm}}` +
    `.lic{background:linear-gradient(135deg,${pal.A},${pal.P})!important}.pg.on th{background:${pal.P}!important}.hero-p{background:${pal.P}!important}` +
    `html:root{--ariba-dark:${pal.P}!important;--ariba-green:${pal.A}!important;--ariba-bright:${pal.A}!important;--ariba-beige:${pal.S}!important;--ariba-soft:${pal.S}!important}` +
    `html .topbar,html .sb,html .tbar{background:${pal.P}!important;border-color:${pal.P}!important}` +
    `${L} .topbar,${L} .sb{background:${pal.P}!important;border-color:${pal.P}!important}` +
    `${L} .sb .ni:hover,${L} .sb .ni.on,${L} .sb .ns.on{background:rgba(${Ar},.28)!important}` +
    `${L} body{background:${pal.S}!important}` +
    `${D} body{background:${pal.dBg}!important}${D} .topbar{background:${dkc(0.17)}!important}${D} .sb{background:${dkc(0.12)}!important}` +
    `${D} .card,${D} .panel,${D} .box,${D} .tbar,${D} .modal,${D} .section,${D} .table-wrap{background:${pal.dC}!important;border-color:${pal.dBd}!important}` +
    `${D} .stat,${D} .tile,${D} .kpi{background:${pal.dC2}!important;border-color:${pal.dBd}!important}` +
    `${D} input,${D} select,${D} textarea{background:${pal.dP}!important;border-color:${pal.dBd}!important}` +
    `.btn.bpl,.btn.bgl,.primary,.btn-primary,.active-btn{background:${pal.P}!important;border-color:${pal.P}!important}` +
    `.btn.bpl:hover,.btn.bgl:hover,.primary:hover,.btn-primary:hover{background:${pal.A}!important;border-color:${pal.A}!important}` +
    `#HRL,.hr-role,#ARIBA_PAYROLL_ARCHIVE .ct,${L} #aribaThemeBtn,${L} .ariba-theme-label,#KR .kpi:last-child .kv{color:${pal.P}!important}`;
  if (!el) {
    el = document.createElement("style");
    el.id = ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
  document.querySelector("meta[name=theme-color]")?.setAttribute("content", pal.P);
}

/** A raster logo from /public/brand, or nothing (the design also accepts only data: images). */
export const logoSrc = (data: string | null | undefined) =>
  data && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(data) ? data : null;
