import { MeShell } from "@/components/me/me-shell";

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <MeShell>{children}</MeShell>;
}
