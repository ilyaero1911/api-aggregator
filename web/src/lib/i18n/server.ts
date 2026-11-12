import { cookies } from "next/headers";
import { setUsdRate } from "../format";
import { loadUsdRate } from "../server-data";
import { dict, LANG_COOKIE, normLang, type Lang } from "./index";

export async function getLang(): Promise<Lang> {
  return normLang((await cookies()).get(LANG_COOKIE)?.value);
}

/** Язык и словарь для серверной страницы; заодно выставляет курс для форматирования цен в долларах. */
export async function getDict() {
  const [lang, rate] = await Promise.all([getLang(), loadUsdRate()]);
  setUsdRate(rate);
  return { lang, t: dict(lang) };
}
