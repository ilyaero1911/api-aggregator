"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { setUsdRate } from "../format";
import { dict, LANG_COOKIE, type Dict, type Lang } from "./index";

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void; switching: boolean };
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ lang: initial, usdRate, children }: { lang: Lang; usdRate: number; children: ReactNode }) {
  setUsdRate(usdRate);
  const [lang, setLangState] = useState<Lang>(initial);
  const [switching, start] = useTransition();
  const router = useRouter();
  const setLang = useCallback((l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    // без перезагрузки страницы: клиент меняет язык сразу, серверные части обновляются в фоне
    setLangState(l);
    start(() => router.refresh());
  }, [router]);
  const value = useMemo(() => ({ lang, t: dict(lang), setLang, switching }), [lang, setLang, switching]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18n);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
