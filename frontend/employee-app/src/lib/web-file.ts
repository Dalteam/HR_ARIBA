// Native builds hand files to the system share sheet (open-doc.ts, payslip-pdf.ts); only the web build needs this.
export async function deliverFile(_bytes: Uint8Array, _name: string, _mime: string): Promise<void> {
  throw new Error("WEB_ONLY");
}
