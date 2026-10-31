// My signature (their SigManager / lib/signature.js): kept on this device only (approved decision: the signature stays
// on the device), never sent to HR except inside a document I choose to sign. Stored as an SVG data URL in the app's
// document directory, one file per account.
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

// On the web (PWA) there is no document directory: the signature stays in this browser's localStorage, still on this
// device only and never sent to HR except inside a document the employee signs.
const web = Platform.OS === "web";
const webKey = (owner: string) => `ariba.signature.${owner.replace(/[^\w-]/g, "_")}`;

const fileFor = (owner: string) => new File(Paths.document, `ariba-signature-${owner.replace(/[^\w-]/g, "_")}.txt`);

export function getSig(owner: string): string {
  try {
    if (web) return globalThis.localStorage?.getItem(webKey(owner)) ?? "";
    const f = fileFor(owner);
    return f.exists ? f.textSync() : "";
  } catch {
    return "";
  }
}

export function setSig(owner: string, dataUrl: string): boolean {
  try {
    if (web) {
      if (!dataUrl) globalThis.localStorage?.removeItem(webKey(owner));
      else globalThis.localStorage?.setItem(webKey(owner), dataUrl);
      return true;
    }
    const f = fileFor(owner);
    if (!dataUrl) {
      if (f.exists) f.delete();
      return true;
    }
    if (!f.exists) f.create();
    f.write(dataUrl);
    return true;
  } catch {
    return false;
  }
}

export const isSigData = (d: string) => /^data:image\/(svg\+xml|png|jpeg|webp)[;,]/.test(d) && d.length < 400_000;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const today = () => new Date().toLocaleDateString("en-GB");
const imgTag = (sig: string) => `<img alt="signature" src="${sig}" style="height:38px;max-width:150px;vertical-align:middle">`;

/** Their injectSignature (lib/signature.js): the signature goes in the employee / manager slot of every part (Arabic /
 *  English); a document without a slot gets a signature block at its end. */
export function injectSignature(html: string, role: "employee" | "manager", sig: string, name?: string | null): string {
  if (!isSigData(sig)) throw new Error("BAD_SIGNATURE");
  const slot = `<span data-sig="${role}">________________</span>`;
  const stamp = ` <span style="font-size:10px;color:#555">${esc(today())}</span>`;
  return String(html).split("<!--ARIBA_EN-->").map((p) => {
    if (p.includes(slot)) {
      let n = 0;
      return p.split(slot).join("\u0000").replace(/\u0000/g, () => (n++ === 0 ? imgTag(sig) + stamp : `<span data-sig-done="${role}"></span>`));
    }
    const lbl = role === "manager" ? "اعتماد المدير المباشر / Direct manager approval" : "توقيع الموظف / Employee signature";
    const block = `<div style="margin:18px 12px 0;padding-top:8px;border-top:1px solid #999;font-size:12px"><b>${lbl}</b> ${name ? "— " + esc(name) : ""}<div style="margin-top:6px">${imgTag(sig)}${stamp}</div></div>`;
    return /<\/body>/i.test(p) ? p.replace(/<\/body>/i, block + "</body>") : p + block;
  }).join("<!--ARIBA_EN-->");
}

/** UTF-8 text ↔ base64 (their b64Utf8 / utf8FromB64). */
export const b64Utf8 = (s: string) => btoa(unescape(encodeURIComponent(s)));
export const utf8FromB64 = (b: string) => decodeURIComponent(escape(atob(b)));
