// Language of the app: Arabic (default) or English. Every text goes through T / Btn / toasts / Alert, which call tr() here, so the
// whole app switches without touching the screens. The layout direction follows the language (web: dir attribute; phone: the OS
// layout flag, which is applied the next time the app starts).
import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, DevSettings, I18nManager, Platform } from "react-native";
import { store } from "@/lib/store";
import { stripEmoji } from "@/lib/clean";
import { EN } from "./en";

export type Lang = "ar" | "en";
const KEY = "ariba_employee_lang";

let current: Lang = "ar";
export const getLang = (): Lang => current;
/** Locale tags for dates and times in the chosen language (Latin digits in both). */
export const dateLocale = () => (current === "en" ? "en-GB-u-nu-latn" : "ar-SA-u-ca-gregory-nu-latn");

const ESC = /[.*+?^${}()|[\]\\]/g;
const exact = new Map<string, string>();
const patterns: { re: RegExp; out: string; len: number }[] = [];
const pieces: [string, string][] = [];
for (const [ar, en] of EN) {
  if (ar.includes("{#}")) {
    const src = ar.split("{#}").map((x) => x.replace(ESC, "\\$&")).join("(.+?)");
    patterns.push({ re: new RegExp(`^${src}$`, "s"), out: en, len: ar.length });
  } else {
    exact.set(ar, en);
    if (ar.length >= 6) pieces.push([ar, en]);   // short words are never replaced inside a longer text (a name could contain one)
  }
}
patterns.sort((a, b) => b.len - a.len);
pieces.sort((a, b) => b[0].length - a[0].length);
const AR_LETTER = /[ء-ي]/;
const cache = new Map<string, string>();

function translate(s: string, depth = 0): string {
  const key = s.trim();
  if (!key) return s;
  const lead = s.slice(0, s.length - s.trimStart().length), tail = s.slice(s.trimEnd().length);
  const hit = exact.get(key);
  if (hit !== undefined) return lead + hit + tail;
  if (depth < 3) {
    for (const p of patterns) {
      const m = p.re.exec(key);
      if (m) return lead + p.out.replace(/\{(\d+)\}/g, (_, i) => translate(m[Number(i)] ?? "", depth + 1)) + tail;
    }
  }
  // piece by piece: known phrases inside a longer text (a number or a name next to a label), longest first
  let out = key, changed = false;
  for (const [ar, en] of pieces) {
    let from = 0;
    for (;;) {
      const i = out.indexOf(ar, from);
      if (i < 0) break;
      const before = out[i - 1] ?? "", after = out[i + ar.length] ?? "";
      if (AR_LETTER.test(before) || AR_LETTER.test(after)) { from = i + ar.length; continue; }
      out = out.slice(0, i) + en + out.slice(i + ar.length);
      from = i + en.length;
      changed = true;
    }
  }
  return lead + (changed ? out : key) + tail;
}

/** Arabic text → what the screen shows in the current language (emoji are removed in both). */
export function tr(s: string): string {
  const clean = stripEmoji(s);
  if (current === "ar") return clean;
  const c = cache.get(clean);
  if (c !== undefined) return c;
  const out = translate(clean);
  if (cache.size > 4000) cache.clear();
  cache.set(clean, out);
  return out;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => Promise<boolean> }>({ lang: "ar", setLang: async () => false });

function applyDirection(l: Lang) {
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") { document.documentElement.setAttribute("lang", l); document.documentElement.setAttribute("dir", l === "ar" ? "rtl" : "ltr"); }
    return false;
  }
  const rtl = l === "ar";
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl); I18nManager.forceRTL(rtl);
  return true;   // takes effect when the app is opened again
}

function reloadNow() { try { DevSettings.reload(); } catch { /* the new direction applies the next time the app is opened */ } }

let alertPatched = false;
function patchAlert() {
  if (alertPatched) return;
  alertPatched = true;
  const orig = Alert.alert.bind(Alert);
  Alert.alert = (title, message, buttons, options) => orig(tr(title ?? ""), message ? tr(message) : message, buttons?.map((b) => ({ ...b, text: b.text ? tr(b.text) : b.text })), options);
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setL] = useState<Lang>("ar");
  useEffect(() => {
    patchAlert();
    store.get(KEY).then((v) => {
      const l: Lang = v === "en" ? "en" : "ar";
      current = l; setL(l);
      if (applyDirection(l)) reloadNow();   // first start on a phone whose layout direction differs: set it once and restart
    }).catch(() => {});
  }, []);
  const setLang = useCallback(async (l: Lang) => {
    current = l; cache.clear(); setL(l);
    store.set(KEY, l).catch(() => {});
    const restart = applyDirection(l);
    if (restart) reloadNow();
    return restart;
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

/** The children of a text: strings are translated (and cleaned), elements and numbers pass through. */
export function trNode(n: ReactNode): ReactNode {
  if (typeof n === "string") return tr(n);
  if (Array.isArray(n)) return Children.map(n, trNode);
  return isValidElement(n) ? n : n;
}

/** Text inside an input starts on the reading side: right in Arabic, left in English. */
export const inputAlign = (): "left" | "right" => (current === "en" ? "left" : "right");
