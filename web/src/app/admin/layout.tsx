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
      { href: "/admin", label: A.overview, exact: true, icon: "overview" }, { href: "/admin/users", label: A.users, icon: "users" },
      { href: "/admin/subscriptions", label: L("Подписки", "Subscriptions"), icon: "repeat" }, { href: "/admin/payments", label: A.payments, icon: "card" },
      { href: "/admin/transactions", label: L("Операции по балансу", "Balance ledger"), icon: "receipt" }, { href: "/admin/keys", label: L("API-ключи", "API keys"), icon: "key" },
      { href: "/admin/requests", label: A.requests, icon: "pulse" },
    ] },
    { label: L("Каталог", "Catalog"), items: [{ href: "/admin/models", label: A.models, icon: "cube" }, { href: "/admin/providers", label: A.providers, icon: "server" }, { href: "/admin/plans", label: A.plans, icon: "tag" }, { href: "/admin/promos", label: A.promos, icon: "ticket" }] },
    { label: L("Контент", "Content"), items: [{ href: "/admin/news", label: L("Новости", "News"), icon: "sparkle" }, { href: "/admin/content", label: L("Документы и подвал", "Documents and footer"), icon: "book" }] },
    { label: A.settings, items: [{ href: "/admin/settings", label: L("Наценка и курс", "Markup and FX"), icon: "coins" }, { href: "/admin/audit", label: A.audit, icon: "history" }] },
  ];
  return <SessionGate admin><Shell nav={nav} home="/admin" badge={<span className="tag tag-ink">ADMIN</span>}>{children}</Shell></SessionGate>;
}
