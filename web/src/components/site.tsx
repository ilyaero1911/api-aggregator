"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { User } from "@/lib/types";
import { LangSwitch, Logo, Mark, ThemeToggle } from "./brand";

export function SiteHeader() {
  const { t } = useI18n();
  const path = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => { get<{ user: User | null }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  const links = [
    { href: "/models", label: t.nav.models },
    { href: "/pricing", label: t.nav.pricing },
    { href: "/rankings", label: t.nav.rankings },
    { href: "/docs", label: t.nav.docs },
  ];
  return (
    <header className="site-head">
      <div className="wrap">
        <Logo />
        <nav className="site-nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="row" style={{ marginLeft: "auto", gap: 10 }}>
          <LangSwitch />
          <div className="auth-slot" style={{ visibility: user === undefined ? "hidden" : "visible" }}>
            {user ? (
              <Link className="btn btn-sm" href="/dashboard">{t.common.dashboard} →</Link>
            ) : (
              <>
                <Link className="btn btn-ghost btn-sm" href="/login">{t.common.signIn}</Link>
                <Link className="btn btn-sm" href="/register">{t.common.signUp}</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-foot">
      <div className="wrap spread" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <div className="row" style={{ color: "var(--ink)" }}><Mark size={18} /><span>NeuroGateway</span></div>
          <p>{t.landing.footer}</p>
        </div>
        <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
          <Link href="/models">{t.nav.models}</Link>
          <Link href="/pricing">{t.nav.pricing}</Link>
          <Link href="/docs">{t.nav.docs}</Link>
          <Link href="/rankings">{t.nav.rankings}</Link>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
