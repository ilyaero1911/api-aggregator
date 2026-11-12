import { cookies } from "next/headers";
import { dict, LANG_COOKIE, normLang, type Lang } from "./index";

export async function getLang(): Promise<Lang> {
  return normLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getDict() {
  const lang = await getLang();
  return { lang, t: dict(lang) };
}
