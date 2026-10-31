// Native builds make the payslip PDF with expo-print (see payslip-pdf.ts); only the web build needs this (pdf.web.ts).
export async function htmlToPdfBlob(_html: string): Promise<Blob> {
  throw new Error("PDF_WEB_ONLY");
}
