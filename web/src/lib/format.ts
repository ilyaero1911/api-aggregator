import type { Lang } from "./i18n";

const loc = (l: Lang) => (l === "en" ? "en-US" : "ru-RU");

/** Микрорубли → «1 234,56 ₽». Маленькие суммы показываем с большей точностью. */
export function rub(micro: number, lang: Lang = "ru", opts: { precise?: boolean } = {}): string {
  const v = micro / 1e6;
  const abs = Math.abs(v);
  let digits = 2;
  if (opts.precise || (abs > 0 && abs < 1)) digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat(loc(lang), { minimumFractionDigits: digits === 2 ? 2 : 0, maximumFractionDigits: digits }).format(v) + " ₽";
}

/** Цена за 1M токенов из микрорублей. */
export function perM(micro: number, lang: Lang = "ru"): string {
  if (micro === 0) return "0 ₽";
  const v = micro / 1e6;
  const digits = v >= 100 ? 0 : v >= 1 ? 2 : 3;
  return new Intl.NumberFormat(loc(lang), { maximumFractionDigits: digits, minimumFractionDigits: v >= 100 ? 0 : 2 }).format(v) + " ₽";
}

export function kopecks(k: number, lang: Lang = "ru"): string {
  return new Intl.NumberFormat(loc(lang), { maximumFractionDigits: 2 }).format(k / 100) + " ₽";
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
