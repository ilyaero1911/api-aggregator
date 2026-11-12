import { ModelDetail } from "@/components/model-detail";

export async function generateMetadata({ params }: { params: Promise<{ author: string; slug: string }> }) {
  const { author, slug } = await params;
  return { title: `${author}/${decodeURIComponent(slug)}` };
}

export default async function ModelPage({ params }: { params: Promise<{ author: string; slug: string }> }) {
  const { author, slug } = await params;
  return <ModelDetail author={author} slug={slug} base="/models" />;
}
