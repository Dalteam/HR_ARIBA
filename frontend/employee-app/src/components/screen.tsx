// A full screen opened from a tab (their modals / overlays): back button, title, scrolling content.
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useInsets } from "@/lib/insets";
import { router } from "expo-router";
import { Icon } from "./icons";
import { T } from "./ui";
import { useTheme } from "@/theme";
import { goBack } from "@/lib/nav";

export function Screen({ title, children, scroll = true, scrollEnabled = true }: { title: string; children: ReactNode; scroll?: boolean; scrollEnabled?: boolean }) {
  const t = useTheme();
  const insets = useInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: insets.top + 12, paddingBottom: 8, paddingHorizontal: 18,
        backgroundColor: t.bg }}>
        <Pressable onPress={() => goBack()} accessibilityLabel="رجوع"
          style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: t.c, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" size={18} color={t.tx} />
        </Pressable>
        <T size={22} weight={800} style={{ flex: 1, letterSpacing: -0.4 }} numberOfLines={1}>{title}</T>
      </View>
      {scroll ? <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : children}
    </View>
  );
}
