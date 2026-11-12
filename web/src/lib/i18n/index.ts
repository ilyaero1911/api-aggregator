import en from "./en";
import ru, { type Dict } from "./ru";

export type Lang = "ru" | "en";
export const LANGS: Lang[] = ["ru", "en"];
export const LANG_COOKIE = "lang";

export function dict(lang: Lang): Dict {
  return lang === "en" ? en : ru;
}

export function normLang(v: string | undefined | null): Lang {
  return v === "en" ? "en" : "ru";
}

/** Подстановка {name} в строку. */
export function fmt(s: string, vars: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type { Dict };
