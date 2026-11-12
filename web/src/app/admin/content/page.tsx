"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Tabs, useL } from "@/components/admin-kit";
import { Md } from "@/components/md";
import { PageHead, Skeleton, useLoad, useToast } from "@/components/ui";
import { ApiError, get, put } from "@/lib/api";
import { date } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Page = { slug: string; title_ru: string; title_en: string; body_ru: string; body_en: string; version: number; updated_at: string };
type Resp = { data: Page[]; site: Record<string, string> };

const SITE_FIELDS: [string, string, string][] = [
  ["company_name", "Название компании (оператор ПД)", "Company name"], ["company_inn", "ИНН", "TIN"], ["company_ogrn", "ОГРН", "PSRN"],
  ["company_address", "Адрес", "Address"], ["company_email", "Почта для обращений", "Contact email"], ["company_phone", "Телефон", "Phone"],
  ["footer_tagline_ru", "Подпись в подвале (рус)", "Footer tagline (ru)"], ["footer_tagline_en", "Подпись в подвале (англ)", "Footer tagline (en)"],
];

export default function Content() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const { data, reload } = useLoad(() => get<Resp>("/api/admin/pages"));
  const [tab, setTab] = useState("site");
  const [site, setSite] = useState<Record<string, string>>({});
  const [page, setPage] = useState<Page | null>(null);
  const [preview, setPreview] = useState(false);
  const [lng, setLng] = useState<"ru" | "en">("ru");
  useEffect(() => { if (data) setSite(data.site); }, [data]);
  useEffect(() => { if (data && tab !== "site") setPage(data.data.find((p) => p.slug === tab) ?? null); }, [data, tab]);

  const saveSite = async () => {
    try { await put("/api/admin/settings", site); toast(L("Сохранено, подвал и документы обновились", "Saved")); reload(); } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };
  const savePage = async () => {
    if (!page) return;
    try { await put("/api/admin/pages", page); toast(L("Документ сохранён, номер редакции увеличен", "Saved, edition bumped")); reload(); } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };
  if (!data) return <Skeleton h={300} />;
  const names: Record<string, string> = { privacy: L("Политика", "Privacy"), terms: L("Оферта", "Terms"), consent: L("Согласие на ПД", "Data consent") };

  return (
    <>
      <PageHead title={L("Тексты сайта и документы", "Site texts and documents")} lead={L("Реквизиты компании подставляются в документы вместо {company}, {inn}, {ogrn}, {address}, {email}, {phone}. После сохранения документа его редакция увеличивается: новые пользователи дают согласие на актуальную версию.", "Company details replace {company}, {inn}, {ogrn}, {address}, {email}, {phone} in documents. Saving a document bumps its edition.")} />
      <Tabs value={tab} onChange={setTab} items={[{ value: "site", label: L("Реквизиты и подвал", "Company and footer") }, ...data.data.map((p) => ({ value: p.slug, label: names[p.slug] ?? p.slug }))]} />
      {tab === "site" ? (
        <div className="panel stack" style={{ maxWidth: 820 }}>
          <div className="grid-2" style={{ gap: 14 }}>
            {SITE_FIELDS.map(([k, ru, en]) => (
              <label key={k} className="field"><span>{lang === "en" ? en : ru}</span><input className="input" value={site[k] ?? ""} onChange={(e) => setSite({ ...site, [k]: e.target.value })} /></label>
            ))}
          </div>
          <div><button className="btn" onClick={saveSite}>{L("Сохранить", "Save")}</button></div>
        </div>
      ) : page && (
        <div className="stack" style={{ ["--gap" as string]: "16px" }}>
          <div className="spread">
            <div className="hint">{L("Редакция", "Edition")} {page.version} · {L("обновлено", "updated")} {date(page.updated_at, lang)} · <Link href={`/legal/${page.slug}`} target="_blank" className="link-u">{L("открыть на сайте", "open on site")}</Link></div>
            <div className="row" style={{ gap: 8 }}>
              <div className="seg"><button aria-pressed={lng === "ru"} onClick={() => setLng("ru")}>RU</button><button aria-pressed={lng === "en"} onClick={() => setLng("en")}>EN</button></div>
              <div className="seg"><button aria-pressed={!preview} onClick={() => setPreview(false)}>{L("Текст", "Edit")}</button><button aria-pressed={preview} onClick={() => setPreview(true)}>{L("Просмотр", "Preview")}</button></div>
              <button className="btn" onClick={savePage}>{L("Сохранить", "Save")}</button>
            </div>
          </div>
          <label className="field"><span>{L("Заголовок", "Title")}</span>
            <input className="input" value={lng === "ru" ? page.title_ru : page.title_en} onChange={(e) => setPage({ ...page, [lng === "ru" ? "title_ru" : "title_en"]: e.target.value })} />
          </label>
          {preview ? <div className="panel"><Md text={lng === "ru" ? page.body_ru : page.body_en} /></div> : (
            <label className="field"><span>{L("Текст: ## — заголовок раздела, - — пункт списка, **жирный**", "Text: ## heading, - list item, **bold**")}</span>
              <textarea className="textarea mono" style={{ minHeight: 480, fontSize: 13.5 }} value={lng === "ru" ? page.body_ru : page.body_en} onChange={(e) => setPage({ ...page, [lng === "ru" ? "body_ru" : "body_en"]: e.target.value })} />
            </label>
          )}
        </div>
      )}
    </>
  );
}
