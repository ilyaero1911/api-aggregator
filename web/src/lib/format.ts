import type { Lang } from "./i18n";

const loc = (l: Lang) => (l === "en" ? "en-US" : "ru-RU");

// Курс доллара в микрорублях. В английской версии все суммы показываем в долларах по этому курсу.
let usdRate = 95_000_000;
export function setUsdRate(micro: number) { if (micro > 0) usdRate = micro; }
export function getUsdRate() { return usdRate; }
/** Микрорубли в доллары (обычное число). */
export function toUsd(micro: number) { return micro / usdRate; }
/** Сумма в валюте интерфейса из микрорублей: рубли для ru, доллары для en. */
export function amount(micro: number, lang: Lang) { return lang === "en" ? micro / usdRate : micro / 1e6; }
export const cur = (lang: Lang) => (lang === "en" ? "$" : "₽");
function money(v: number, lang: Lang, digits: number, minDigits = digits) {
  const s = new Intl.NumberFormat(loc(lang), { minimumFractionDigits: minDigits, maximumFractionDigits: digits }).format(v);
  if (lang === "en") return v < 0 ? "-$" + s.slice(1) : "$" + s;
  return s + " ₽";
}

/** Микрорубли → «1 234,56 ₽». Маленькие суммы показываем с большей точностью. */
export function rub(micro: number, lang: Lang = "ru", opts: { precise?: boolean } = {}): string {
  const v = amount(micro, lang);
  const abs = Math.abs(v);
  let digits = 2;
  if (opts.precise || (abs > 0 && abs < 1)) digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return money(v, lang, digits, digits === 2 ? 2 : 0);
}

/** Цена за 1M токенов из микрорублей. */
export function perM(micro: number, lang: Lang = "ru"): string {
  if (micro === 0) return money(0, lang, 0);
  const v = amount(micro, lang);
  const digits = v >= 100 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 3 : 4;
  return money(v, lang, digits, v >= 100 ? 0 : 2);
}

export function kopecks(k: number, lang: Lang = "ru"): string {
  return money(amount(k * 10_000, lang), lang, 2, 0);
}

export function num(n: number, lang: Lang = "ru"): string {
  return new Intl.NumberFormat(loc(lang)).format(n);
}

/** 1 234 567 → 1,2M */
export function compact(n: number, lang: Lang = "ru"): string {
  return new Intl.NumberFormat(loc(lang), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function ctx(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_048_576).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1024)}K`;
  return String(n);
}

export function date(s: string | Date | null | undefined, lang: Lang = "ru", withTime = false): string {
  if (!s) return "—";
  const d = typeof s === "string" ? new Date(s) : s;
  return new Intl.DateTimeFormat(loc(lang), withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function dateTime(s: string | null | undefined, lang: Lang = "ru"): string {
  if (!s) return "—";
  return new Intl.DateTimeFormat(loc(lang), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(s));
}

export function ago(s: string | null | undefined, lang: Lang = "ru"): string {
  if (!s) return "—";
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(loc(lang), { numeric: "auto" });
  if (diff < 60) return rtf.format(-Math.round(diff), "second");
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return date(s, lang);
}

export function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n} ms`;
}

/** Число из поля ввода (в валюте интерфейса) → рубли для API. */
export function inputToRub(v: number, lang: Lang): number {
  return lang === "en" ? (v * usdRate) / 1e6 : v;
}
/** Микрорубли → число для поля ввода в валюте интерфейса. */
export function microToInput(micro: number, lang: Lang): number {
  const v = amount(micro, lang);
  return Math.round(v * 100) / 100;
}
