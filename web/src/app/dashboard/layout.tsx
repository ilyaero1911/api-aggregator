"use client";

import { SessionGate } from "@/components/session";
import { Shell, type NavGroup } from "@/components/shell";
import { useI18n } from "@/lib/i18n/client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const N = t.nav;
  const nav: NavGroup[] = [
    { label: N.groupWork, items: [
      { href: "/dashboard", label: N.overview, exact: true, icon: "overview" },
      { href: "/dashboard/playground", label: N.playground, icon: "chat" },
      { href: "/dashboard/images", label: N.images, icon: "image" },
      { href: "/dashboard/presets", label: N.presets, icon: "preset" },
    ] },
    { label: N.groupAccount, items: [
      { href: "/dashboard/keys", label: N.keys, icon: "key" },
      { href: "/dashboard/billing", label: N.billing, icon: "wallet" },
      { href: "/dashboard/logs", label: N.logs, icon: "logs" },
      { href: "/dashboard/management-keys", label: N.managementKeys, icon: "shieldKey" },
      { href: "/dashboard/settings", label: N.settings, icon: "settings" },
    ] },
    { label: N.groupResources, items: [{ href: "/models", label: N.models, icon: "cube" }, { href: "/docs", label: N.docs, icon: "book" }] },
  ];
  return <SessionGate><Shell nav={nav} home="/dashboard">{children}</Shell></SessionGate>;
}
