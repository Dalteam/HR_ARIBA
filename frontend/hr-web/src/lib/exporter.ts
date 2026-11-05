// Export any table on the page to Excel / PDF / Word: the updated design's lib/exporter.js, typed. Its
// "send by e-mail" half (a Supabase edge function) is not here: e-mail stays off, lib/features.ts `exportEmail`.

import type { jsPDF as JsPdf } from "jspdf";
import { buildXlsx, withFormulaTotals } from "./xlsx";

/** `overlay` is the seal layer (lib/seal.ts `overlayHtml`), drawn over page 1 of the PDF only — as the
 *  design's exporter did (a landscape table has no place for it). */
export type ExportSpec = { title: string; headers: string[]; rows: string[][]; sub?: string; name?: string; dir?: "rtl" | "ltr"; totals?: boolean; overlay?: string };
export type ExportFile = { blob: Blob; name: string; mime: string };
export type Format = "xlsx" | "pdf" | "doc";

export const FORMATS: Record<Format, [string, string, string]> = {
  xlsx: ["Excel", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pdf: ["PDF", "pdf", "application/pdf"],
  doc: ["Word", "doc", "application/msword"],
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const safeName = (s: string | undefined) => String(s || "report").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);

/** A formatted HTML table (used for PDF and Word); every cell is escaped. */
export function tableHtml({ title, headers, rows, sub, dir = "rtl" }: ExportSpec): string {
  const th = "background:#014D3D;color:#fff;padding:5px 7px;font-size:11px;border:1px solid #014D3D";
  const td = "padding:4px 7px;border:1px solid #cfdad6;font-size:11px;text-align:center";
  return (
    '<div dir="' + dir + '" style="font-family:Tahoma,Arial,sans-serif;color:#111">' +
    (title ? '<h3 style="text-align:center;color:#014D3D;margin:0 0 4px">' + esc(title) + "</h3>" : "") +
    (sub ? '<div style="text-align:center;font-size:10px;color:#667;margin-bottom:8px">' + esc(sub) + "</div>" : "") +
    '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
    headers.map((h) => '<th style="' + th + '">' + esc(h) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + r.map((c) => '<td style="' + td + '">' + esc(c) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>"
  );
}

/** The seal layer over the page jsPDF is on: rendered once as a transparent A4 sheet, then drawn on top
 *  (the design's `pdfBlob` did exactly this for `spec.overlay`). */
async function stampOverlay(pdf: JsPdf, overlay: string) {
  const { default: html2canvas } = await import("html2canvas");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;background:transparent";
  host.innerHTML = '<div style="position:relative;width:794px;height:1123px;overflow:hidden">' + overlay + "</div>";
  document.body.appendChild(host);
  try {
    const sheet = await html2canvas(host, { scale: 1.5, backgroundColor: null, width: 794, height: 1123, windowWidth: 794 });
    pdf.addImage(sheet.toDataURL("image/png"), "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, "FAST");
  } finally {
    host.remove();
  }
}

async function pdfBlob(spec: ExportSpec): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const wide = spec.headers.length > 7;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: wide ? "landscape" : "portrait" });
  const W = pdf.internal.pageSize.getWidth(), PH = pdf.internal.pageSize.getHeight(), PER = wide ? 22 : 32;
  const chunks: string[][][] = [];
  for (let i = 0; i < Math.max(spec.rows.length, 1); i += PER) chunks.push(spec.rows.slice(i, i + PER));
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;padding:16px;width:" + (wide ? 1180 : 780) + "px";
  document.body.appendChild(host);
  try {
    for (let i = 0; i < chunks.length; i++) {
      host.innerHTML =
        tableHtml({ ...spec, title: i === 0 ? spec.title : "", sub: i === 0 ? spec.sub : "", rows: chunks[i] }) +
        '<div style="text-align:center;font-size:9px;color:#889;margin-top:6px">' + (i + 1) + " / " + chunks.length + "</div>";
      const cv = await html2canvas(host, { scale: 2, backgroundColor: "#fff" });
      if (i) pdf.addPage();
      const h = Math.min(PH - 6, (cv.height * (W - 8)) / cv.width);
      pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 4, 3, W - 8, h);
      if (i === 0 && spec.overlay && !wide) await stampOverlay(pdf, spec.overlay);
    }
  } finally {
    host.remove();
  }
  return pdf.output("blob");
}

/** A whole HTML report (several sections) as an A4 PDF: rendered once off-screen, then cut into pages.
 *  Simpler than the design's htmlPdf.js (no "smart" breaks: a row may be cut at a page edge). */
export async function htmlPdfBlob(html: string, { landscape = false, overlay }: { landscape?: boolean; overlay?: string } = {}): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  const W = pdf.internal.pageSize.getWidth(), PH = pdf.internal.pageSize.getHeight();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;width:" + (landscape ? 1120 : 790) + "px";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const cv = await html2canvas(host, { scale: 2, backgroundColor: "#fff" });
    const pxPerPage = Math.floor((cv.width * (PH - 8)) / (W - 8));
    for (let y = 0, i = 0; y < cv.height; y += pxPerPage, i++) {
      const h = Math.min(pxPerPage, cv.height - y);
      const part = document.createElement("canvas");
      part.width = cv.width;
      part.height = h;
      part.getContext("2d")!.drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
      if (i) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", 4, 4, W - 8, (h * (W - 8)) / cv.width);
      if (i === 0 && overlay && !landscape) await stampOverlay(pdf, overlay);
    }
  } finally {
    host.remove();
  }
  return pdf.output("blob");
}

export async function makeFile(fmt: Format, spec: ExportSpec): Promise<ExportFile> {
  const base = safeName(spec.name || spec.title);
  if (fmt === "xlsx") {
    const blob = buildXlsx([
      {
        name: String(spec.title || "Report").replace(/[\\/?*[\]:]/g, " ").slice(0, 30),
        rows: withFormulaTotals([spec.headers, ...spec.rows], { totals: spec.totals !== false }),
        widths: spec.headers.map(() => 18),
      },
    ]);
    return { blob, name: base + ".xlsx", mime: FORMATS.xlsx[2] };
  }
  if (fmt === "doc") {
    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" dir="' + (spec.dir || "rtl") +
      '"><head><meta charset="utf-8"><title>' + esc(spec.title) +
      "</title><style>@page{size:A4 landscape}body{font-family:Tahoma,Arial}</style></head><body>" + tableHtml(spec) + "</body></html>";
    return { blob: new Blob(["﻿", html], { type: "application/msword" }), name: base + ".doc", mime: FORMATS.doc[2] };
  }
  return { blob: await pdfBlob(spec), name: base + ".pdf", mime: FORMATS.pdf[2] };
}

export function saveBlob(file: ExportFile) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file.blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 800);
}

/** Every visible table inside `root`, as export specs (the card's title, the header row and the rows). */
export function tablesFrom(root: Element | null): ExportSpec[] {
  const out: ExportSpec[] = [];
  (root ? Array.from(root.querySelectorAll("table")) : []).forEach((t, i) => {
    if (!(t as HTMLElement).offsetParent && t.getClientRects().length === 0) return;
    const trs = Array.from(t.querySelectorAll("tr")).filter((tr) => tr.closest("table") === t);
    if (trs.length < 2) return;
    const cells = (tr: Element) => Array.from(tr.children).map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim());
    const head = trs.find((tr) => tr.querySelector("th")) || trs[0];
    const headers = cells(head);
    const rows = trs.filter((tr) => tr !== head).map(cells).filter((r) => r.some(Boolean));
    if (!rows.length) return;
    const card = t.closest(".card");
    const ct = card?.querySelector(".ct") as HTMLElement | null;
    out.push({
      title: ct ? ct.innerText.trim() : "جدول " + (i + 1),
      headers,
      rows: rows.map((r) => {
        const x = r.slice(0, headers.length);
        while (x.length < headers.length) x.push("");
        return x;
      }),
    });
  });
  return out;
}
