// Legacy printHtml (V62, requests/050): open a window with a simple table style and print it.
export function printHtml(title: string, innerHtml: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("من فضلك اسمح بالنوافذ المنبثقة للطباعة");
    return;
  }
  w.document.write(
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>` +
      "<style>body{font-family:Tahoma,Arial,sans-serif;padding:20px;color:#111}h3{margin-top:22px}table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#f0f0f0}</style>" +
      `</head><body><h2>${title}</h2>${innerHtml}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
