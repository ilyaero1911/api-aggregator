"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { dict, LANG_COOKIE, type Dict, type Lang } from "./index";

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void };
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ lang: initial, children }: { lang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    setLangState(l);
    // серверные компоненты тоже должны переключиться
    window.location.reload();
  }, []);
  const value = useMemo(() => ({ lang, t: dict(lang), setLang }), [lang, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18n);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
