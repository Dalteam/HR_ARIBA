// عرض المستند — the HTML HR sent (legacy forms/020 «عرض المستند»). Approve / reject happen on the documents tab.
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useInsets } from "@/lib/insets";
import { router, useLocalSearchParams } from "expo-router";
import { HtmlView } from "@/components/html-view";
import { Icon } from "@/components/icons";
import { Loading, T } from "@/components/ui";
import { letters } from "@/lib/api";
import { useTheme } from "@/theme";
import { goBack } from "@/lib/nav";

export default function LetterScreen() {
  const t = useTheme();
  const insets = useInsets();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    letters.html(id).then(setHtml).catch(() => setHtml("<p style='font-family:sans-serif;text-align:center'>تعذر تحميل المستند</p>"));
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: insets.top + 10, paddingBottom: 10, paddingHorizontal: 14, backgroundColor: t.c, borderBottomWidth: 1, borderBottomColor: t.bd }}>
        <Pressable onPress={() => goBack()} style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: t.bd, backgroundColor: t.c2, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" size={18} color={t.tx} />
        </Pressable>
        <T size={16} weight={800} style={{ flex: 1 }} numberOfLines={1}>{title ?? "المستند"}</T>
      </View>
      {html === null ? <Loading /> : <HtmlView html={html} fileName={title ?? "document"} />}
    </View>
  );
}
