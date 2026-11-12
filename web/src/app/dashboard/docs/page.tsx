import { DocsView } from "@/components/docs-view";
import { loadConfig } from "@/lib/server-data";

export default async function DashDocs() {
  const { api_base_url } = await loadConfig();
  return <DocsView base={api_base_url} inShell />;
}
