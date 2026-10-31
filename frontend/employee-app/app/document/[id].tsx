// One of my HTML documents (forms, letters, settlements) in the in-app viewer; their bilingual files keep the
// Arabic part (<!--ARIBA_EN--> separates the English copy).
import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { HtmlView } from "@/components/html-view";
import { Screen } from "@/components/screen";
import { Loading } from "@/components/ui";
import { docs } from "@/lib/port";

const utf8 = (b64: string) => decodeURIComponent(Array.from(atob(b64), (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));

export default function DocumentScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    docs.content(id)
      .then((d) => {
        const body = utf8(d.base64).split("<!--ARIBA_EN-->")[0];
        setHtml(/<html[\s>]/i.test(body) ? body : `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${body}</body></html>`);
      })
      .catch(() => setHtml("<p style='font-family:sans-serif;text-align:center'>تعذر تحميل المستند</p>"));
  }, [id]);
  return (
    <Screen title={title ?? "المستند"} scroll={false}>
      {html === null ? <Loading /> : <HtmlView html={html} fileName={title ?? "document"} />}
    </Screen>
  );
}
