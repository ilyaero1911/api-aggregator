"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/** Знак: маршрут из одной точки в другую. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M8 24 L8 15 Q8 8 15 8 L24 8" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="8" cy="24" r="3.6" fill="var(--signal)" />
      <circle cx="24" cy="8" r="3.6" fill="currentColor" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo">
      <Mark />
      <span>NeuroGateway</span>
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
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" /><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></svg>
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
