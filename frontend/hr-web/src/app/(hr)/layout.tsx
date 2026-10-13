import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "@/styles/hr.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/common/toast";
import { AuthProvider } from "@/lib/auth-context";
import { LocaleProvider, type Lang } from "@/lib/i18n/locale";
import { HR_THEME_COOKIE, LANG_COOKIE } from "@/lib/prefs";
import { RefreshProvider } from "@/lib/refresh";
import { ThemeProvider, type Theme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "نظام الموارد البشرية — اريبا",
  description: "Ariba for Consulting — HR portal",
  icons: { icon: "/brand/ariba-logo.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#014D3D" };

// HR portal root layout. Like the prototype it stays right-to-left in both languages and opens
// in night mode by default.
export default async function HrRootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang: Lang = jar.get(LANG_COOKIE)?.value === "en" ? "en" : "ar";
  const theme: Theme = jar.get(HR_THEME_COOKIE)?.value === "light" ? "light" : "dark";

  return (
    <html id="H" lang={lang} dir="rtl" data-ariba-theme={theme}>
      <body>
        <LocaleProvider lang={lang} flipDir={false}>
          <ThemeProvider initial={theme} cookie={HR_THEME_COOKIE} bodyClass={false}>
            <ToastProvider variant="hr">
              <AuthProvider>
                <RefreshProvider>{children}</RefreshProvider>
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
