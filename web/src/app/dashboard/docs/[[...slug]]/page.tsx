import { DocsApp } from "@/components/docs-app";
import { loadConfig } from "@/lib/server-data";

export default async function DashDocs({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const { api_base_url } = await loadConfig();
  return <DocsApp slug={slug} base="/dashboard/docs" apiBase={api_base_url} inShell />;
}
