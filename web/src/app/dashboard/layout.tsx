"use client";

import { SessionGate } from "@/components/session";
import { Shell, type NavGroup } from "@/components/shell";
import { useI18n } from "@/lib/i18n/client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const N = t.nav;
  const nav: NavGroup[] = [
    { label: N.overview, items: [{ href: "/dashboard", label: N.overview, exact: true }] },
    { label: N.groupWork, items: [{ href: "/dashboard/playground", label: N.playground }, { href: "/dashboard/images", label: N.images }, { href: "/dashboard/presets", label: N.presets }] },
    { label: N.groupAccount, items: [
      { href: "/dashboard/keys", label: N.keys }, { href: "/dashboard/management-keys", label: N.managementKeys },
      { href: "/dashboard/billing", label: N.billing }, { href: "/dashboard/logs", label: N.logs }, { href: "/dashboard/settings", label: N.settings },
    ] },
    { label: N.groupResources, items: [{ href: "/models", label: N.models }, { href: "/docs", label: N.docs }] },
  ];
  return <SessionGate><Shell nav={nav} home="/dashboard">{children}</Shell></SessionGate>;
}
