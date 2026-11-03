// Excel (.xlsx) writer without any library: the updated design's lib/xlsx.js (from the old system), typed.
// No dependency, so no supply-chain risk; text that starts with = + - @ is prefixed so it never runs as a formula.

type Cell = string | number | null | { f: string; v: string | number } | "";
export type Sheet = { name: string; rows: Cell[][]; widths: number[]; raw?: boolean };

const CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (u8: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const enc = (s: string) => new TextEncoder().encode(s);

function zip(files: { name: string; data: string }[]): Blob {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  const w16 = (a: number[], v: number) => a.push(v & 255, (v >>> 8) & 255);
  const w32 = (a: number[], v: number) => a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  files.forEach((f) => {
    const name = enc(f.name), data = enc(f.data), crc = crc32(data), h: number[] = [];
    w32(h, 0x04034b50); w16(h, 20); w16(h, 0x0800); w16(h, 0); w16(h, 0); w16(h, 0x21);
    w32(h, crc); w32(h, data.length); w32(h, data.length); w16(h, name.length); w16(h, 0);
    chunks.push(new Uint8Array(h), name, data);
    const c: number[] = [];
    w32(c, 0x02014b50); w16(c, 20); w16(c, 20); w16(c, 0x0800); w16(c, 0); w16(c, 0); w16(c, 0x21);
    w32(c, crc); w32(c, data.length); w32(c, data.length); w16(c, name.length);
    w16(c, 0); w16(c, 0); w16(c, 0); w16(c, 0); w32(c, 0); w32(c, off);
    central.push(new Uint8Array(c), name);
    off += h.length + name.length + data.length;
  });
  let csz = 0;
  central.forEach((x) => { csz += x.length; });
  const e: number[] = [];
  w32(e, 0x06054b50); w16(e, 0); w16(e, 0); w16(e, files.length); w16(e, files.length); w32(e, csz); w32(e, off); w16(e, 0);
  return new Blob([...chunks, ...central, new Uint8Array(e)] as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export const colL = (i0: number) => {
  let s = "", i = i0 + 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
};
const xesc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
/** formula-injection guard: text that starts with = + - @ is prefixed with an apostrophe */
const safeText = (v: unknown) => {
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
};

function sheetXml(rows: Cell[][], widths: number[], rtl: boolean) {
  let x =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"' +
    (rtl ? ' rightToLeft="1"' : "") +
    '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
    widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") +
    "</cols><sheetData>";
  rows.forEach((r, ri) => {
    x +=
      '<row r="' + (ri + 1) + '">' +
      r
        .map((v, ci) => {
          const ref = colL(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : "";
          if (v && typeof v === "object" && typeof v.f === "string") {
            const cv = typeof v.v === "number" && Number.isFinite(v.v) ? "<v>" + v.v + "</v>" : "";
            return '<c r="' + ref + '"' + st + (typeof v.v === "string" ? ' t="str"' : "") + "><f>" + xesc(v.f) + "</f>" + (typeof v.v === "string" ? "<v>" + xesc(v.v) + "</v>" : cv) + "</c>";
          }
          if (typeof v === "number" && Number.isFinite(v)) return '<c r="' + ref + '"' + st + "><v>" + v + "</v></c>";
          if (v === "" || v == null) return '<c r="' + ref + '"' + st + "/>";
          return '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + xesc(safeText(v)) + "</t></is></c>";
        })
        .join("") +
      "</row>";
  });
  return x + "</sheetData></worksheet>";
}

export function buildXlsx(sheets: Sheet[], { rtl = true }: { rtl?: boolean } = {}): Blob {
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ct =
    H +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
    "</Types>";
  const rels =
    H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb =
    H +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets.map((s, i) => '<sheet name="' + xesc(s.name).slice(0, 31) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") +
    '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  const wbr =
    H +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
    '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const st =
    H +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF014D3D"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const files = [
    { name: "[Content_Types].xml", data: ct },
    { name: "_rels/.rels", data: rels },
    { name: "xl/workbook.xml", data: wb },
    { name: "xl/_rels/workbook.xml.rels", data: wbr },
    { name: "xl/styles.xml", data: st },
  ];
  sheets.forEach((s, i) => files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: sheetXml(s.raw ? s.rows : formulaizeTotals(s.rows), s.widths, rtl) }));
  return zip(files);
}

/** Number-looking text becomes numbers, and a totals row with SUM formulas is added for the numeric columns. */
const NOSUM = /^(م|#|no\.?|id)$|رقم|كود|تاريخ|date|جوال|هاتف|phone|mobile|هوية|iban|حساب|سنة|شهر|year|month|معدل|نسبة|rate|%/i;
const NUMLIKE = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;
export function withFormulaTotals(rows: Cell[][], { label = "الإجمالي", totals = true }: { label?: string; totals?: boolean } = {}): Cell[][] {
  if (!rows || rows.length < 2) return rows;
  const head = rows[0];
  const body = rows.slice(1).map((r) =>
    r.map((v) =>
      typeof v === "string" && NUMLIKE.test(v.trim()) && v.trim() !== "" && !/^-?0\d/.test(v.trim()) && v.replace(/[,.-]/g, "").length <= 12 ? Number(v.replace(/,/g, "")) : v,
    ),
  );
  if (!totals) return [head, ...body];
  const n = body.length;
  const tot: Cell[] = head.map((h, ci) => {
    if (NOSUM.test(String(h).trim())) return "";
    const vals = body.map((r) => r[ci]).filter((v) => v !== "" && v != null);
    if (!vals.length || !vals.every((v) => typeof v === "number")) return "";
    const sum = (vals as number[]).reduce((a, b) => a + b, 0);
    return { f: "SUM(" + colL(ci) + "2:" + colL(ci) + (n + 1) + ")", v: Math.round(sum * 100) / 100 };
  });
  if (!tot.some((v) => v !== "")) return [head, ...body];
  tot[0] = tot[0] === "" ? label : tot[0];
  return [head, ...body, tot];
}

const isTotLabel = (v: unknown) => typeof v === "string" && /^\s*(الإجمالي|إجمالي|المجموع|مجموع|total|grand total|totals?\b)/i.test(v);
const toNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && NUMLIKE.test(v.trim()) ? Number(v.replace(/,/g, "")) : null);
/** An existing totals row turns into SUM formulas when the column really adds up to the written value. */
export function formulaizeTotals(rows: Cell[][]): Cell[][] {
  const out = rows.map((r) => r.slice());
  out.forEach((r, ri) => {
    const lab = r.findIndex((v) => isTotLabel(v));
    if (lab < 0 || ri < 2) return;
    r.forEach((v, ci) => {
      if (ci === lab || (v && typeof v === "object")) return;
      const val = toNum(v);
      if (val === null || v === "") return;
      let top = ri;
      while (top - 1 >= 0 && typeof out[top - 1][ci] === "number" && !isTotLabel(out[top - 1].find((x) => typeof x === "string"))) top--;
      if (top === ri) return;
      let sum = 0;
      for (let k = top; k < ri; k++) sum += out[k][ci] as number;
      if (Math.abs(sum - val) > 0.011 * Math.max(1, ri - top)) return;
      out[ri][ci] = { f: "SUM(" + colL(ci) + (top + 1) + ":" + colL(ci) + ri + ")", v: val };
    });
  });
  return out;
}
