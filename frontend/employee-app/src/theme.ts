// Colours of the V114 employee app (frontend/legacy/employee-portal/css/08-ariba-employee-theme-v12.css).
// Same variable names as the prototype so screens can be compared side by side.
import { useColorScheme } from "react-native";

export const palettes = {
  light: {
    bg: "#F4F0E6",
    c: "#FFFDF8",
    c2: "#EEE9DC",
    bd: "#D8D2C4",
    bl: "#014D3D",
    gr: "#29B35E",
    rd: "#B54A4A",
    am: "#9B7A32",
    pu: "#6B5B73",
    cy: "#014D3D",
    mu: "#59625F",
    dm: "#727A76",
    tx: "#17201D",
  },
  dark: {
    bg: "#014D3D",
    c: "#013D31",
    c2: "#075444",
    bd: "#176A58",
    bl: "#29B35E",
    gr: "#29B35E",
    rd: "#F07A7A",
    am: "#E4E4BC",
    pu: "#D8C9DD",
    cy: "#E4E4BC",
    mu: "#D0D9D5",
    dm: "#E1E7E4",
    tx: "#FFFFFF",
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string };

export const fonts = {
  light: "AribaTwoLight",
  medium: "AribaTwoMedium",
  bold: "AribaTwoBold",
} as const;

export function useTheme(): Palette {
  // The prototype's employee app defaults to day mode.
  return useColorScheme() === "dark" ? palettes.dark : palettes.light;
}
