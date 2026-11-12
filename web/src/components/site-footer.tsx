"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/client";
import { LangSwitch, Mark, ThemeToggle } from "./brand";
import { Icon, type IconName } from "./icons";

type Site = Record<string, string>;

export function SiteFooter() {
  const { t, lang } = useI18n();
  const en = lang === "en";
  const [site, setSite] = useState<Site>({});
  useEffect(() => { get<Site>("/api/site").then(setSite).catch(() => {}); }, []);
  const cols: { title: string; links: [string, string, IconName][] }[] = [
    { title: en ? "Product" : "Продукт", links: [["/models", t.nav.models, "cube"], ["/pricing", t.nav.pricing, "tag"], ["/rankings", t.nav.rankings, "trophy"], ["/docs", t.nav.docs, "book"]] },
    { title: en ? "Account" : "Аккаунт", links: [["/dashboard", en ? "Dashboard" : "Кабинет", "overview"], ["/dashboard/playground", t.nav.playground, "chat"], ["/dashboard/keys", t.nav.keys, "key"], ["/dashboard/billing", t.nav.billing, "wallet"]] },
    { title: en ? "Documents" : "Документы", links: [["/legal/privacy", en ? "Privacy policy" : "Политика конфиденциальности", "lock"], ["/legal/terms", en ? "Terms of service" : "Публичная оферта", "receipt"], ["/legal/consent", en ? "Data consent" : "Согласие на обработку данных", "admin"]] },
  ];
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-top">
          <Link href="/" className="foot-brand">
            <Mark size={64} />
            <span>{BRAND}</span>
          </Link>
          <p className="foot-tag">{(en ? site.footer_tagline_en : site.footer_tagline_ru) || t.landing.footer}</p>
        </div>
        <div className="foot-cols">
          {cols.map((c) => (
            <div key={c.title}>
              <div className="label">{c.title}</div>
              <nav>{c.links.map(([href, label, icon]) => <Link key={href} href={href}><Icon name={icon} size={16} />{label}</Link>)}</nav>
            </div>
          ))}
          <div>
            <div className="label">{en ? "Company" : "Компания"}</div>
            <div className="foot-req">
              {site.company_name && <span>{site.company_name}</span>}
              {site.company_inn && <span>{en ? "TIN" : "ИНН"} {site.company_inn}{site.company_ogrn ? ` · ${en ? "PSRN" : "ОГРН"} ${site.company_ogrn}` : ""}</span>}
              {site.company_address && <span>{site.company_address}</span>}
              {site.company_email && <a href={`mailto:${site.company_email}`}><Icon name="send" size={15} />{site.company_email}</a>}
              {site.company_phone && <a href={`tel:${site.company_phone}`}>{site.company_phone}</a>}
            </div>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} {site.company_name || BRAND}</span>
          <div className="row" style={{ gap: 8 }}><LangSwitch /><ThemeToggle /></div>
        </div>
      </div>
    </footer>
  );
}

/** Уведомление о cookie: сайт ставит только технические cookie (сессия, язык, тема). */
export function CookieNote() {
  const { lang } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(!localStorage.getItem("cookie-ok")); } catch {} }, []);
  if (!show) return null;
  return (
    <div className="cookie">
      <span>{lang === "en" ? "We use only essential cookies to keep you signed in and remember settings." : "Мы используем только необходимые cookie: чтобы вы оставались в аккаунте и сохранялись настройки."} <Link href="/legal/privacy">{lang === "en" ? "Details" : "Подробнее"}</Link></span>
      <button className="btn btn-sm" onClick={() => { try { localStorage.setItem("cookie-ok", "1"); } catch {} setShow(false); }}>{lang === "en" ? "OK" : "Понятно"}</button>
    </div>
  );
}
