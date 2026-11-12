"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { Icon } from "./icons";
import { useI18n } from "@/lib/i18n/client";

/** Знак: железнодорожная стрелка — путь раздваивается, активная ветка подсвечена. При наведении стрелка переключается. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="mark">
      <rect width="32" height="32" rx="9" className="mark-bg" />
      <path d="M8 25 L13.5 18" className="mark-stem" />
      <path d="M13.5 18 C16 14.5, 19 10.5, 24.5 8.5" className="mark-a" />
      <path d="M13.5 18 C17 17, 20.5 19, 24.5 21.5" className="mark-b" />
      <circle cx="13.5" cy="18" r="2.6" className="mark-dot" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo">
      <Mark />
      <span className="logo-word">{BRAND}</span>
    </Link>
  );
}

type Theme = "auto" | "light" | "dark";

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>("auto");
  useEffect(() => {
    try { const v = localStorage.getItem("theme"); if (v === "light" || v === "dark") setTheme(v); } catch {}
  }, []);
  const next: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
  const label = { auto: t.settings.themeAuto, light: t.settings.themeLight, dark: t.settings.themeDark }[theme];
  return (
    <button className="btn btn-ghost btn-sm theme-btn" title={t.common.theme} onClick={() => {
      const v = next[theme];
      setTheme(v);
      try { if (v === "auto") localStorage.removeItem("theme"); else localStorage.setItem("theme", v); } catch {}
      if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    }}>
      <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "contrast"} size={15} />
      {label}
    </button>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="seg">
      {(["ru", "en"] as const).map((l) => (
        <button key={l} aria-pressed={lang === l} onClick={() => lang !== l && setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}
