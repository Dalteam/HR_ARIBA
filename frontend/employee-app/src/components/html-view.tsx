// The in-app viewer for an HTML document (forms, letters, settlements): the system web view on the phone.
// The web build uses html-view.web.tsx (an iframe), because react-native-webview has no web implementation.
import { WebView } from "react-native-webview";
import { stripEmojiHtml } from "@/lib/clean";

export function HtmlView({ html }: { html: string; fileName?: string }) {
  return <WebView originWhitelist={["*"]} source={{ html: stripEmojiHtml(html) }} style={{ flex: 1 }} />;
}
