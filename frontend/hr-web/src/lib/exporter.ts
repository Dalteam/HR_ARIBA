// Export any table on the page to Excel / PDF / Word: the updated design's lib/exporter.js, typed. Its
// "send by e-mail" half (a Supabase edge function) is not here: e-mail stays off, lib/features.ts `exportEmail`.

import { buildXlsx, withFormulaTotals } from "./xlsx";

export type ExportSpec = { title: string; headers: string[]; rows: string[][]; sub?: string; name?: string; dir?: "rtl" | "ltr"; totals?: boolean };
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
