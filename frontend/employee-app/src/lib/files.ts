// Pick a file and read it as base64 (their fileToData + MAX_ATT): PDF / images / Word, at most 12 MB.
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import type { Attachment } from "./port";

export const MAX_ATT = 12 * 1024 * 1024;
export type Picked = Attachment & { size: number };

export async function pickFile(types: string[] = ["application/pdf", "image/*", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]): Promise<Picked | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, base64: true, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  if (a.size && a.size > MAX_ATT) throw new Error("حجم الملف يتجاوز 12 MB");
  // The picker's base64 is web only; on the phone the content is read from the copy in the cache.
  let data = a.base64 ? a.base64.replace(/^data:[^,]*,/, "") : "";
  if (!data && Platform.OS !== "web") {
    try { data = await new File(a.uri).base64(); } catch { data = ""; }
  }
  if (!data) throw new Error("تعذر قراءة الملف");
  const size = a.size ?? Math.floor((data.length * 3) / 4);
  if (size > MAX_ATT) throw new Error("حجم الملف يتجاوز 12 MB");
  return { name: a.name, mime: a.mimeType || "application/octet-stream", data, size };
}
