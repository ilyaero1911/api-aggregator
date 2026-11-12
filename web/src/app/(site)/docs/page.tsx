import { DocsView } from "@/components/docs-view";
import { loadConfig } from "@/lib/server-data";

export const metadata = { title: "Документация" };

export default async function Docs() {
  const { api_base_url } = await loadConfig();
  return <DocsView base={api_base_url} />;
}
