"use client";

import { SessionGate } from "@/components/session";
import { Shell, type NavGroup } from "@/components/shell";
import { useI18n } from "@/lib/i18n/client";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n();
  const A = t.adm;
  const L = (ru: string, en: string) => (lang === "en" ? en : ru);
  const nav: NavGroup[] = [
    { label: L("Люди и деньги", "People and money"), items: [
      { href: "/admin", label: A.overview, exact: true }, { href: "/admin/users", label: A.users },
      { href: "/admin/subscriptions", label: L("Подписки", "Subscriptions") }, { href: "/admin/payments", label: A.payments },
      { href: "/admin/transactions", label: L("Операции по балансу", "Balance ledger") }, { href: "/admin/keys", label: L("API-ключи", "API keys") },
      { href: "/admin/requests", label: A.requests },
    ] },
    { label: L("Каталог", "Catalog"), items: [{ href: "/admin/models", label: A.models }, { href: "/admin/providers", label: A.providers }, { href: "/admin/plans", label: A.plans }, { href: "/admin/promos", label: A.promos }] },
    { label: A.settings, items: [{ href: "/admin/settings", label: L("Наценка и курс", "Markup and FX") }, { href: "/admin/audit", label: A.audit }] },
  ];
  return <SessionGate admin><Shell nav={nav} home="/admin" badge={<span className="tag tag-ink">ADMIN</span>}>{children}</Shell></SessionGate>;
}
