// TypeScript surface for the vendored QR encoder `qrcode.js` (same folder).
//
// `qrcode.js` is the MIT-licensed "QR Code Generator for JavaScript" by Kazuhiko Arase
// (http://www.d-project.com/, copyright (c) 2009 Kazuhiko Arase — see qrcode-README.md), copied verbatim
// from the updated design (`ARIBA_HR_React/node_modules/qrcode-generator`) so a business card can draw its
// QR code without a new dependency and without a network call. Only the members the card uses are declared.

interface VendoredQRCode {
  addData(data: string, mode?: "Numeric" | "Alphanumeric" | "Byte" | "Kanji"): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

interface VendoredQRCodeFactory {
  (typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): VendoredQRCode;
  stringToBytes(s: string): number[];
  stringToBytesFuncs: Record<string, (s: string) => number[]>;
}

declare const qrcode: VendoredQRCodeFactory;
export default qrcode;
