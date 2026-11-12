import { Catalog } from "@/components/catalog";
import { loadModels } from "@/lib/server-data";

export default async function DashModels() {
  const { data } = await loadModels();
  return <Catalog models={data} base="/dashboard/models" inShell />;
}
