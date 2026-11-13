import { DocsApp } from "@/components/docs-app";
import { findEntry } from "@/lib/docs";
import { loadConfig } from "@/lib/server-data";

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const e = findEntry(slug);
  return { title: `${e.page.title} · Документация`, description: e.page.desc };
}

export default async function Docs({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const { api_base_url } = await loadConfig();
  return <DocsApp slug={slug} base="/docs" apiBase={api_base_url} />;
}
