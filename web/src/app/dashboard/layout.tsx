"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionGate } from "@/components/session";
import { Shell, type NavGroup } from "@/components/shell";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";

function Nav({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n();
  const N = t.nav;
  const en = lang === "en";
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [supUnread, setSupUnread] = useState(0);
  useEffect(() => { get<{ unread: number }>("/api/news").then((r) => setUnread(r.unread)).catch(() => {}); }, [path]);
  useEffect(() => { get<{ unread: number }>("/api/support").then((r) => setSupUnread(r.unread)).catch(() => {}); }, [path]);
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
      { href: "/dashboard/activity", label: en ? "Account activity" : "Действия в аккаунте", icon: "history" },
      { href: "/dashboard/management-keys", label: N.managementKeys, icon: "shieldKey" },
      { href: "/dashboard/settings", label: N.settings, icon: "settings" },
    ] },
    { label: N.groupResources, items: [
      { href: "/dashboard/support", label: en ? "Support" : "Поддержка", icon: "chat", badge: supUnread },
      { href: "/dashboard/news", label: en ? "News" : "Новости", icon: "sparkle", badge: unread },
      { href: "/models", label: N.models, icon: "cube" }, { href: "/docs", label: N.docs, icon: "book" },
    ] },
  ];
  return <Shell nav={nav} home="/dashboard">{children}</Shell>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <SessionGate><Nav>{children}</Nav></SessionGate>;
}
