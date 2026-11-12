"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { get, post } from "@/lib/api";
import { rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { LangSwitch, Logo, ThemeToggle } from "./brand";
import { useSession } from "./session";

export type NavGroup = { label: string; items: { href: string; label: string; exact?: boolean }[] };

export function Shell({ nav, children, home, badge }: { nav: NavGroup[]; children: ReactNode; home: string; badge?: ReactNode }) {
  const { t, lang } = useI18n();
  const { user } = useSession();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    get<{ wallet: { balance_micro: number } }>("/api/billing").then((r) => setBalance(r.wallet.balance_micro)).catch(() => {});
  }, [path]);

  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
  const initials = (user.name || user.email).slice(0, 1).toUpperCase();

  return (
    <div className="shell">
      <aside className={`side${open ? " open" : ""}`}>
        <div className="side-top spread"><Logo href={home} />{badge}</div>
        <nav className="route">
          {nav.map((g) => (
            <div key={g.label} className="route-group">
              <div className="label">{g.label}</div>
              <ol>
                {g.items.map((it) => (
                  <li key={it.href}><Link className="stop" href={it.href} aria-current={isActive(it.href, it.exact) ? "page" : undefined}>{it.label}</Link></li>
                ))}
              </ol>
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="row" style={{ gap: 10 }}>
            <span className="avatar">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : initials}</span>
            <div className="grow" style={{ lineHeight: 1.25 }}>
              <div className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
              <div className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
            </div>
          </div>
          <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
            {user.role === "admin" && (path.startsWith("/admin")
              ? <Link className="btn btn-ghost btn-sm" href="/dashboard">{t.common.dashboard}</Link>
              : <Link className="btn btn-ghost btn-sm" href="/admin">{t.common.admin}</Link>)}
            <button className="btn btn-ghost btn-sm" onClick={async () => { await post("/api/auth/logout"); router.push("/"); router.refresh(); }}>{t.common.signOut}</button>
          </div>
        </div>
      </aside>
      {open && <div className="drawer-back" style={{ zIndex: 45 }} onClick={() => setOpen(false)} />}
      <div className="main">
        <div className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-sm burger" onClick={() => setOpen(true)} aria-label="menu">☰</button>
            <Link href="/models" className="small muted">{t.nav.models}</Link>
            <Link href="/docs" className="small muted">{t.nav.docs}</Link>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {balance !== null && (
              <Link href="/dashboard/billing" className="row small" style={{ gap: 8 }}>
                <span className="label" style={{ margin: 0 }}>{t.dash.balance}</span>
                <span className={`num ${balance <= 0 ? "bad" : ""}`}>{rub(balance, lang)}</span>
              </Link>
            )}
            <LangSwitch />
            <ThemeToggle />
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
