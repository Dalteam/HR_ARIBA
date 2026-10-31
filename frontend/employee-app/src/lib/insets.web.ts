// Safe-area insets on the web. The library measures env(safe-area-inset-*) once and can read 0 in an installed iOS PWA
// (viewport-fit=cover, black-translucent status bar), which put the header under the clock / Dynamic Island. Here the probe
// is read again on load, resize and rotation, and the larger of the two values wins.
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Ins = { top: number; bottom: number; left: number; right: number };

function read(): Ins {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;" +
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(el);
  const s = getComputedStyle(el);
  const v = { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
  document.body.removeChild(el);
  return v;
}

export function useInsets(): Ins {
  const lib = useSafeAreaInsets();
  const [m, setM] = useState<Ins>({ top: 0, bottom: 0, left: 0, right: 0 });
  useEffect(() => {
    const upd = () => setM(read());
    upd();
    const t = setTimeout(upd, 400);
    window.addEventListener("resize", upd);
    window.addEventListener("orientationchange", upd);
    return () => { clearTimeout(t); window.removeEventListener("resize", upd); window.removeEventListener("orientationchange", upd); };
  }, []);
  return { top: Math.max(lib.top, m.top), bottom: Math.max(lib.bottom, m.bottom), left: Math.max(lib.left, m.left), right: Math.max(lib.right, m.right) };
}
