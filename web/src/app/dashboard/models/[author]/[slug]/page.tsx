import { ModelDetail } from "@/components/model-detail";

export default async function DashModelPage({ params }: { params: Promise<{ author: string; slug: string }> }) {
  const { author, slug } = await params;
  return <ModelDetail author={author} slug={slug} base="/dashboard/models" inShell />;
}
