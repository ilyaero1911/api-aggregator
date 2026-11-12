"use client";

import { SessionGate } from "@/components/session";
import { Shell, type NavGroup } from "@/components/shell";
import { useI18n } from "@/lib/i18n/client";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const A = t.adm;
  const nav: NavGroup[] = [
    { label: A.title, items: [{ href: "/admin", label: A.overview, exact: true }, { href: "/admin/users", label: A.users }, { href: "/admin/payments", label: A.payments }, { href: "/admin/requests", label: A.requests }] },
    { label: A.models, items: [{ href: "/admin/models", label: A.models }, { href: "/admin/providers", label: A.providers }, { href: "/admin/plans", label: A.plans }, { href: "/admin/promos", label: A.promos }] },
    { label: A.settings, items: [{ href: "/admin/settings", label: A.settings }, { href: "/admin/audit", label: A.audit }] },
  ];
  return <SessionGate admin><Shell nav={nav} home="/admin" badge={<span className="tag tag-ink">ADMIN</span>}>{children}</Shell></SessionGate>;
}
