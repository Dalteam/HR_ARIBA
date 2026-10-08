import { HrShell } from "@/components/hr/hr-shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <HrShell>{children}</HrShell>;
}
