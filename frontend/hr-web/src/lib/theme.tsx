"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Sets `data-ariba-theme` on <html> (both prototypes) and, for the employee app,
 *  `ariba-light` / `ariba-dark` on <body> (its prototype's palette classes). */
export function ThemeProvider({
  initial,
  cookie,
  bodyClass,
  children,
}: {
  initial: Theme;
  cookie: string;
  bodyClass: boolean;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(initial);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.aribaTheme = next;
    if (bodyClass) {
      document.body.classList.remove("ariba-light", "ariba-dark");
      document.body.classList.add(`ariba-${next}`);
    }
    document.cookie = `${cookie}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, [theme, cookie, bodyClass]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
