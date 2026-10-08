"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE } from "../prefs";
import { ar, type MessageKey } from "./ar";
import { en } from "./en";

export type Lang = "ar" | "en";

const dictionaries: Record<Lang, Record<MessageKey, string>> = { ar, en };

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface LocaleContextValue {
  lang: Lang;
  t: Translate;
  /** Translate an enum value, e.g. tEnum("category", "tamheer"). Falls back to the raw value. */
  tEnum: (group: string, value: string | null | undefined) => string;
  setLang: (lang: Lang) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = dictionaries[lang][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/**
 * @param flipDir  The employee app switches to left-to-right in English (as its prototype did);
 *                 the HR portal stays right-to-left and only swaps its labels (as its prototype did).
 */
export function LocaleProvider({ lang, flipDir, children }: { lang: Lang; flipDir: boolean; children: React.ReactNode }) {
  const router = useRouter();

  const setLang = useCallback(
    (next: Lang) => {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      if (flipDir) document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
      router.refresh();
    },
    [router, flipDir],
  );

  const value = useMemo<LocaleContextValue>(() => {
    const t: Translate = (key, vars) => translate(lang, key, vars);
    const tEnum = (group: string, v: string | null | undefined) => {
      if (!v) return translate(lang, "common.none");
      const key = `enum.${group}.${v}` as MessageKey;
      return key in dictionaries[lang] ? translate(lang, key) : v;
    };
    return { lang, t, tEnum, setLang };
  }, [lang, setLang]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}
