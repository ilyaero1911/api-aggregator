import Link from "next/link";
import { notFound } from "next/navigation";
import { Md } from "@/components/md";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";

type Page = { slug: string; title_ru: string; title_en: string; body_ru: string; body_en: string; version: number; updated_at: string };
const DOCS = [["privacy", "Политика конфиденциальности", "Privacy policy"], ["terms", "Публичная оферта", "Terms of service"], ["consent", "Согласие на обработку данных", "Data processing consent"]];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: DOCS.find((d) => d[0] === slug)?.[1] ?? "Документ" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { lang } = await getDict();
  let p: Page;
  try { p = await api<Page>(`/api/pages/${slug}`, { cache: "no-store" }); } catch { notFound(); }
  const en = lang === "en";
  return (
    <div className="wrap legal">
      <nav className="legal-nav">
        {DOCS.map(([s, ru, e]) => <Link key={s} href={`/legal/${s}`} aria-current={s === slug ? "page" : undefined}>{en ? e : ru}</Link>)}
      </nav>
      <article className="legal-body">
        <h1 className="h1">{en ? p.title_en : p.title_ru}</h1>
        <p className="hint">{en ? "Edition" : "Редакция"} {p.version} · {en ? "updated" : "обновлено"} {date(p.updated_at, lang)}</p>
        <Md text={en && p.body_en ? p.body_en : p.body_ru} />
      </article>
    </div>
  );
}
