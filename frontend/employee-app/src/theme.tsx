// Colours of the legacy employee app (frontend/legacy/employee-portal/css/08-ariba-employee-theme-v12.css): body.ariba-light
// (default) / body.ariba-dark. Same variable names as the prototype so screens can be compared side by side.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { store } from "@/lib/store";

export const palettes = {
  light: {
    bg: "#F4F0E6", c: "#FFFDF8", c2: "#EEE9DC", bd: "#D8D2C4", bl: "#014D3D", gr: "#29B35E", rd: "#B54A4A", am: "#9B7A32",
    pu: "#6B5B73", cy: "#014D3D", mu: "#59625F", dm: "#727A76", tx: "#17201D",
  },
  dark: {
    bg: "#014D3D", c: "#013D31", c2: "#075444", bd: "#176A58", bl: "#29B35E", gr: "#29B35E", rd: "#F07A7A", am: "#E4E4BC",
    pu: "#D8C9DD", cy: "#E4E4BC", mu: "#D0D9D5", dm: "#E1E7E4", tx: "#FFFFFF",
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string } & { dark: boolean };

// Brand constants (css 06/07/08).
export const brand = { dark: "#014D3D", green: "#29B35E", beige: "#E4E4BC", gray: "#D9D9D9" };

export const fonts = { light: "AribaTwoLight", medium: "AribaTwoMedium", bold: "AribaTwoBold" } as const;

const KEY = "ariba_employee_theme";
type Mode = "light" | "dark";
const Ctx = createContext<{ mode: Mode; toggle: () => void }>({ mode: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("light"); // the prototype defaults to day mode
  useEffect(() => {
    store.get(KEY).then((v) => v === "dark" && setMode("dark")).catch(() => {});
  }, []);
  const toggle = useCallback(() => {
    setMode((m) => {
      const next = m === "dark" ? "light" : "dark";
      store.set(KEY, next).catch(() => {});
      return next;
    });
  }, []);
  return <Ctx.Provider value={{ mode, toggle }}>{children}</Ctx.Provider>;
}

export const useThemeMode = () => useContext(Ctx);

export function useTheme(): Palette {
  const { mode } = useContext(Ctx);
  return { ...palettes[mode], dark: mode === "dark" };
}
