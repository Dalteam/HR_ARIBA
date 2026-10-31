// Open one of my documents (their downloadDoc): HTML in the in-app viewer, anything else saved to the cache and handed
// to the system share sheet (Files, Mail, print …).
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { docs } from "./port";
import { deliverFile } from "./web-file";

export async function openDocument(id: string, title?: string) {
  const d = await docs.content(id);
  const isHtml = /\.html?$/i.test(d.file_name) || /text\/html/i.test(d.mime_type);
  if (isHtml) {
    router.push({ pathname: "/document/[id]", params: { id, title: title ?? d.file_name } });
    return;
  }
  if (Platform.OS === "web") {
    await deliverFile(Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0)), d.file_name, d.mime_type);
    return;
  }
  const f = new File(Paths.cache, `${id}-${d.file_name.replace(/[^\w.\-]+/g, "_")}`);
  if (f.exists) f.delete();
  f.create();
  f.write(Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0)));
  await Sharing.shareAsync(f.uri, { mimeType: d.mime_type, dialogTitle: title ?? d.file_name });
}
