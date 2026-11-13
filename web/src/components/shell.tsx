"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { get, post } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { LangSwitch, Mark, ThemeToggle } from "./brand";
import { Icon, type IconName } from "./icons";
import { useSession } from "./session";

export type NavGroup = { label: string; items: { href: string; label: string; exact?: boolean; icon: IconName; badge?: number }[] };

/** Каркас кабинета и админки. Боковую панель можно свернуть до иконок, выбор запоминается в браузере. */
export function Shell({ nav, children, home, badge }: { nav: NavGroup[]; children: ReactNode; home: string; badge?: ReactNode }) {
  const { t, lang } = useI18n();
  const { user } = useSession();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => { try { setMini(localStorage.getItem("side-mini") === "1"); } catch {} }, []);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    get<{ wallet: { balance_micro: number } }>("/api/billing").then((r) => setBalance(r.wallet.balance_micro)).catch(() => {});
  }, [path]);
  const toggleMini = () => setMini((m) => { try { localStorage.setItem("side-mini", m ? "0" : "1"); } catch {} return !m; });

  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
  const initials = (user.name || user.email).slice(0, 1).toUpperCase();
  const en = lang === "en";

  return (
    <div className={`shell${mini ? " mini" : ""}`}>
      <aside className={`side${open ? " open" : ""}`}>
        <div className="side-top">
          <Link href="/" className="logo" title="На главную"><Mark /><span className="logo-word side-text">{BRAND}</span></Link>
          <span className="side-text">{badge}</span>
          <button className="side-toggle" onClick={toggleMini} title={mini ? (en ? "Expand panel" : "Развернуть панель") : (en ? "Collapse panel" : "Свернуть панель")} aria-label="toggle sidebar">
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <nav className="route">
          {nav.map((g) => (
            <div key={g.label} className="route-group">
              <div className="label side-text">{g.label}</div>
              <ol>
                {g.items.map((it) => (
                  <li key={it.href}>
                    <Link className="stop" href={it.href} aria-current={isActive(it.href, it.exact) ? "page" : undefined} title={mini ? it.label : undefined}>
                      <span className="stop-ico"><Icon name={it.icon} />{!!it.badge && mini && <i className="stop-dot" />}</span>
                      <span className="side-text grow">{it.label}</span>
                      {!!it.badge && <span className="stop-badge side-text">{it.badge}</span>}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="row" style={{ gap: 10 }}>
            <span className="avatar" title={user.email}>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : initials}</span>
            <div className="grow side-text" style={{ lineHeight: 1.25, minWidth: 0 }}>
              <div className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
              <div className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
            </div>
          </div>
          <div className="side-actions">
            {user.role === "admin" && (path.startsWith("/admin")
              ? <Link className="btn btn-ghost btn-sm" href="/dashboard" title={t.common.dashboard}><Icon name="overview" size={15} /><span className="side-text">{t.common.dashboard}</span></Link>
              : <Link className="btn btn-ghost btn-sm" href="/admin" title={t.common.admin}><Icon name="admin" size={15} /><span className="side-text">{t.common.admin}</span></Link>)}
            <button className="btn btn-ghost btn-sm" title={t.common.signOut} onClick={async () => { await post("/api/auth/logout"); router.push("/"); router.refresh(); }}><Icon name="logout" size={15} /><span className="side-text">{t.common.signOut}</span></button>
          </div>
        </div>
      </aside>
      {open && <div className="drawer-back" style={{ zIndex: 45 }} onClick={() => setOpen(false)} />}
      <div className="main">
        <div className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-sm burger" onClick={() => setOpen(true)} aria-label="menu"><Icon name="menu" size={16} /></button>
            <Link href={path.startsWith("/admin") ? "/models" : "/dashboard/models"} className="top-link"><Icon name="cube" size={15} />{t.nav.models}</Link>
            <Link href={path.startsWith("/admin") ? "/docs" : "/dashboard/docs"} className="top-link"><Icon name="book" size={15} />{t.nav.docs}</Link>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {balance !== null && (
              <Link href="/dashboard/billing" className="top-balance">
                <Icon name="wallet" size={15} />
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
