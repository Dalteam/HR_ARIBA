// «ثبّت التطبيق» on the login screen of the PWA, until it is installed (or the employee dismisses it):
//  • Android / desktop Chrome: the browser's own install prompt, behind a button (beforeinstallprompt);
//  • iPhone / iPad: Safari has no such prompt, so the steps are written out (Share › Add to Home Screen).
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { T } from "@/components/ui";
import { useTheme } from "@/theme";

const KEY = "ariba.install_hint_dismissed";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function InstallHint() {
  const t = useTheme();
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let off = false;
    try { off = standalone() || globalThis.localStorage?.getItem(KEY) === "1"; } catch { /* storage blocked: show the hint */ }
    setHidden(off);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const ios = isIos();
  if (hidden || (!evt && !ios)) return null;
  const dismiss = () => { try { globalThis.localStorage?.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); };
  const install = async () => { if (!evt) return; await evt.prompt(); const c = await evt.userChoice; if (c.outcome === "accepted") setHidden(true); setEvt(null); };
  return (
    <View style={{ marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.bd, backgroundColor: t.c2 }}>
      <T size={13} weight={800}>ثبّت التطبيق على جوالك</T>
      {evt ? (
        <Pressable onPress={install} style={{ marginTop: 8, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: "#29B35E" }}>
          <T size={13} weight={800} color="#012A21">تثبيت التطبيق</T>
        </Pressable>
      ) : (
        <T size={12} color={t.mu} style={{ marginTop: 6, lineHeight: 20 }}>افتح هذه الصفحة في Safari، ثم اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية».</T>
      )}
      <Pressable onPress={dismiss} style={{ marginTop: 8, alignItems: "center" }}>
        <T size={11} color={t.mu}>لاحقًا</T>
      </Pressable>
    </View>
  );
}
