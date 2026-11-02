// The in-app viewer for an HTML document (forms, letters, settlements): the system web view on the phone.
// The web build uses html-view.web.tsx (an iframe), because react-native-webview has no web implementation.
// `javaScriptEnabled={false}` is the phone's half of S12: the server already stores a cleaned document
// (services/html_safety.py), and this keeps a letter that never went through it (an old row) inert too.
// Kept in step with the iframe's `sandbox` in html-view.web.tsx: content, never code.
import { WebView } from "react-native-webview";
import { stripEmojiHtml } from "@/lib/clean";

export function HtmlView({ html }: { html: string; fileName?: string }) {
  return <WebView originWhitelist={["*"]} source={{ html: stripEmojiHtml(html) }} javaScriptEnabled={false}
                  domStorageEnabled={false} style={{ flex: 1 }} />;
}
