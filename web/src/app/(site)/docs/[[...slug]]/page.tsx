import { DocsApp } from "@/components/docs-app";
import { entriesFor } from "@/lib/docs";
import { getLang } from "@/lib/i18n/server";
import { loadConfig } from "@/lib/server-data";

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const lang = await getLang();
  const all = entriesFor(lang), key = (slug ?? []).join("/");
  const e = all.find((x) => x.path === key) ?? all[0];
  return { title: `${e.page.title} · ${lang === "en" ? "Docs" : "Документация"}`, description: e.page.desc };
}

export default async function Docs({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const { api_base_url } = await loadConfig();
  return <DocsApp slug={slug} base="/docs" apiBase={api_base_url} />;
}
