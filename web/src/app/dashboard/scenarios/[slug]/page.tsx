import { ScenarioDetail } from "@/components/scenarios-view";
import { loadConfig } from "@/lib/server-data";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cfg = await loadConfig();
  return <ScenarioDetail slug={slug} base="/dashboard/scenarios" apiBase={cfg.api_base_url} inShell />;
}
