// The app uses line icons, never emoji or dingbat symbols. Anything that still carries one (older strings, texts coming from
// the server) is cleaned when it is shown. Arrows used as separators (← → |) are plain typography and stay.
const SYMBOLS = "✓✔✕✖☐☑☒⬆⬇↩⏱⏳⏰✨";
const RE = new RegExp(`(?:(?![\\u00A9\\u00AE\\u2122])\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|[${SYMBOLS}\\uFE0F\\u200D\\u20E3])+`, "gu");

/** Emoji out of an HTML document (markup and spacing untouched). */
export const stripEmojiHtml = (h: string) => h.replace(RE, "");

export function stripEmoji(s: string): string {
  if (!RE.test(s)) { RE.lastIndex = 0; return s; }
  RE.lastIndex = 0;
  return s.replace(RE, "").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/g, "");
}

import { Children, isValidElement, type ReactNode } from "react";
/** Same for React children: strings are cleaned, elements and numbers pass through. */
export function cleanNode(n: ReactNode): ReactNode {
  if (typeof n === "string") return stripEmoji(n);
  if (Array.isArray(n)) return Children.map(n, cleanNode);
  return isValidElement(n) ? n : n;
}
