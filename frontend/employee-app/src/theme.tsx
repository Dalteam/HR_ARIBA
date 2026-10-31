// Colours of the legacy employee app (frontend/legacy/employee-portal/css/08-ariba-employee-theme-v12.css): body.ariba-light
// (default) / body.ariba-dark. Same variable names as the prototype so screens can be compared side by side.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, AppState } from "react-native";
import { brandInfo } from "@/lib/port";
import { store } from "@/lib/store";

export const palettes = {
  light: {
    bg: "#E9EFEA", c: "#FFFFFF", c2: "#F1F5F1", bd: "#D3DDD6", bl: "#014D3D", gr: "#29B35E", rd: "#B3342B", am: "#231F20",
    pu: "#231F20", cy: "#014D3D", mu: "#4A5F57", dm: "#6A7C74", tx: "#10211C",
  },
  dark: {
    bg: "#011A15", c: "#013D31", c2: "#075444", bd: "#176A58", bl: "#29B35E", gr: "#29B35E", rd: "#FF8A7E", am: "#E4E4BC",
    pu: "#E4E4BC", cy: "#E4E4BC", mu: "#B5CCC3", dm: "#CFE0D8", tx: "#E8F2ED",
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string } & { dark: boolean };

// Brand constants (css 06/07/08).
export const brand = { dark: "#014D3D", green: "#29B35E", beige: "#E4E4BC", gray: "#D9D9D9" };

export const fonts = { light: "AribaTwoLight", medium: "AribaTwoMedium", bold: "AribaTwoBold" } as const;

const KEY = "ariba_employee_theme";
const BRAND_KEY = "ariba_employee_brand";
type Mode = "light" | "dark";
type Brand = { p: string; a?: string; s?: string; hero?: string } | null;
/** What HR sets for the app apart from the colours: the picture behind the punch button and the app's own logo (kept in memory only; the keychain holds 2 KB). */
export type AppAssets = { punch: string; logo: string; heroBg: string };
export type Choice = "auto" | "light" | "dark";
const Ctx = createContext<{ mode: Mode; toggle: () => void; brand: Brand; assets: AppAssets; choice: Choice; setChoice: (c: Choice) => void }>({ mode: "light", toggle: () => {}, brand: null, assets: { punch: "", logo: "", heroBg: "" }, choice: "auto", setChoice: () => {} });

// The company colours HR sets (their employee brand.js): the ARIBA colours of the palette are swapped for the
// company's primary (P, with shades), accent (A) and light background (S).
const h2r = (h: string) => { let x = String(h || "").replace("#", ""); if (x.length === 3) x = x.split("").map((c) => c + c).join(""); const n = parseInt(x, 16); return Number.isFinite(n) && x.length === 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null; };
const r2h = (r: number[]) => "#" + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const shade = (r: number[], k: number) => r.map((v) => v * (1 - k));
const lift = (r: number[], k: number) => r.map((v) => v + (255 - v) * k);
function conv(b: NonNullable<Brand>): (c: string) => string {
  const P = h2r(b.p)!, A = (b.a && h2r(b.a)) || lift(P, 0.35), S = (b.s && h2r(b.s)) || [244, 240, 230];
  const map: Record<string, string> = { "#013D31": r2h(shade(P, 0.2)), "#075444": r2h(lift(P, 0.1)), "#176A58": r2h(lift(P, 0.2)), "#014D3D": r2h(P),
    "#4BDC86": r2h(lift(A, 0.3)), "#1D9A4C": r2h(shade(A, 0.15)), "#1F9A4F": r2h(shade(A, 0.15)), "#29B35E": r2h(A), "#E4E4BC": r2h(S), "#F4F0E6": r2h(S), "#011A15": r2h(shade(P, 0.7)),
    "#E9EFEA": b.s ? r2h(S) : "#E9EFEA" };
  return (c) => map[c.toUpperCase()] ?? c;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => (Appearance.getColorScheme() === "dark" ? "dark" : "light")); // follows the device until the user picks one
  const [explicit, setExplicit] = useState(false);
  const [brand, setBrand] = useState<Brand>(null);
  const [assets, setAssets] = useState<AppAssets>({ punch: "", logo: "", heroBg: "" });
  useEffect(() => {
    store.get(KEY).then((v) => { if (v === "dark" || v === "light") { setMode(v); setExplicit(true); } }).catch(() => {});
    store.get(BRAND_KEY).then((v) => { try { const b = v ? JSON.parse(v) : null; if (b && h2r(b.p)) setBrand(b); } catch { /* ignore */ } }).catch(() => {});
    const pull = () => brandInfo().then((r) => {
      const v = r.brand;
      const nb: Brand = !v || v.reset || !v.p || !h2r(v.p) ? null : { p: v.p, a: v.a || "", s: v.s || "", ...(v.hero && h2r(v.hero) ? { hero: v.hero } : {}) };
      setBrand((o) => (JSON.stringify(o) === JSON.stringify(nb) ? o : nb));
      const na = { punch: v?.punch && /^data:image\//.test(v.punch) ? v.punch : "", logo: r.appLogo && /^data:image\//.test(r.appLogo) ? r.appLogo : "", heroBg: v?.heroImage && /^data:image\//.test(v.heroImage) ? v.heroImage : "" };
      setAssets((o) => (o.punch === na.punch && o.logo === na.logo && o.heroBg === na.heroBg ? o : na));
      (nb ? store.set(BRAND_KEY, JSON.stringify(nb)) : store.del(BRAND_KEY)).catch(() => {});
    }).catch(() => {});
    pull();
    const sub = AppState.addEventListener("change", (st) => st === "active" && pull());
    const timer = setInterval(pull, 90_000);   // what HR changes in the website's settings reaches an open app within a minute or two
    return () => { sub.remove(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (explicit) return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => setMode(colorScheme === "dark" ? "dark" : "light"));
    return () => sub.remove();
  }, [explicit]);
  const toggle = useCallback(() => {
    setExplicit(true);
    setMode((m) => {
      const next = m === "dark" ? "light" : "dark";
      store.set(KEY, next).catch(() => {});
      return next;
    });
  }, []);
  // auto = follow the device; light / dark = the user's own pick (kept on this device)
  const setChoice = useCallback((c: Choice) => {
    if (c === "auto") { setExplicit(false); setMode(Appearance.getColorScheme() === "dark" ? "dark" : "light"); store.del(KEY).catch(() => {}); return; }
    setExplicit(true); setMode(c); store.set(KEY, c).catch(() => {});
  }, []);
  const choice: Choice = explicit ? mode : "auto";
  return <Ctx.Provider value={{ mode, toggle, brand, assets, choice, setChoice }}>{children}</Ctx.Provider>;
}

export const useThemeMode = () => useContext(Ctx);

export function useTheme(): Palette {
  const { mode, brand } = useContext(Ctx);
  return useMemo(() => {
    const base = palettes[mode];
    if (!brand) return { ...base, dark: mode === "dark" };
    const c = conv(brand);
    return { ...(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, c(v)])) as { [K in keyof typeof base]: string }), dark: mode === "dark" };
  }, [mode, brand]);
}

/** The app's own identity as HR set it: hero colours (null = the original green), the punch picture and the app logo. */
export function useAppBrand() {
  const { brand, assets } = useContext(Ctx);
  return useMemo(() => {
    if (!brand) return { hero: null as null | { a: string; b: string; c: string; band1: string; band2: string }, punch: assets.punch, logo: assets.logo, heroBg: assets.heroBg };
    const P = h2r(brand.hero || brand.p)!, A = (brand.a && h2r(brand.a)) || lift(h2r(brand.p)!, 0.35), S = (brand.s && h2r(brand.s)) || [228, 228, 188];
    return { hero: { a: r2h(shade(P, 0.25)), b: r2h(P), c: r2h(lift(P, 0.12)), band1: r2h(A), band2: r2h(S) }, punch: assets.punch, logo: assets.logo, heroBg: assets.heroBg };
  }, [brand, assets]);
}
