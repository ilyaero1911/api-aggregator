import type { Metadata } from "next";
import { Catalog } from "@/components/catalog";
import { loadModels } from "@/lib/server-data";

export const metadata: Metadata = { title: "Модели" };

export default async function ModelsPage() {
  const { data } = await loadModels();
  return <Catalog models={data} />;
}
