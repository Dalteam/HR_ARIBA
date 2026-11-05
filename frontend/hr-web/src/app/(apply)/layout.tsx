import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "@/styles/hr.css";
import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/common/toast";

export const metadata: Metadata = {
  title: "التقديم على وظيفة — شركة اريبا لخدمات الأعمال",
  description: "نموذج التقديم على الوظائف",
  icons: { icon: "/brand/ariba-logo.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#014D3D" };

// The public application page's own root layout: no session, no side menu, no auth provider — a candidate who
// has never heard of us opens one form. It is a second root layout (the HR portal's `(hr)` group is the other),
// which is why this file exists at all.
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-ariba-theme="light">
      <body>
        <ToastProvider variant="hr">{children}</ToastProvider>
      </body>
    </html>
  );
}
