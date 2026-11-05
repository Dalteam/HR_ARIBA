// The owner's three status icons (5 Nov 2026), in place of the ⏳ ❌ 🚫 emojis: waiting, rejected, cancelled.
// Transparent PNGs in assets/status-icons; `StatusLine` puts one before a line of text.
import type { ReactNode } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";

const SRC = {
  wait: require("../../assets/status-icons/wait.png"),
  rejected: require("../../assets/status-icons/rejected.png"),
  cancelled: require("../../assets/status-icons/cancelled.png"),
};

export type StatusIconName = keyof typeof SRC;

export function StatusIcon({ name, size = 14 }: { name: StatusIconName; size?: number }) {
  return <Image source={SRC[name]} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />;
}

/** An icon and its text on one line (the text wraps beside the icon). */
export function StatusLine({ name, size = 14, style, children }: { name: StatusIconName; size?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "flex-start", gap: 5 }, style]}>
      <View style={{ paddingTop: 1 }}><StatusIcon name={name} size={size} /></View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
