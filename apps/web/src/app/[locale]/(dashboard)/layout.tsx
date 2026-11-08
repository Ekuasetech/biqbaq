import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/**
 * Account, shop and admin pages (owner's redesign, 2026-11-08): a sidebar and a top bar in
 * place of the public header and footer.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
