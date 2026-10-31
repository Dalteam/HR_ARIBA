// Cross-platform shadow: react-native-web deprecated the shadow* props (use boxShadow there), the phone keeps the native props.
import { Platform, type ViewStyle } from "react-native";

function rgba(color: string, a: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function shadow(color: string, opacity: number, radius: number, x: number, y: number, elevation = 0): ViewStyle {
  if (Platform.OS === "web") {
    return (opacity <= 0 ? { boxShadow: "none" } : { boxShadow: `${x}px ${y}px ${radius * 2}px ${rgba(color, opacity)}` }) as ViewStyle;
  }
  return { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: x, height: y }, ...(elevation ? { elevation } : {}) };
}
