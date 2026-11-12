import { LOGOS } from "@/lib/logos";

/** Логотип автора модели. Монохромные логотипы берут цвет текста, поэтому видны и в тёмной теме. */
export function ProviderLogo({ author, size = 28 }: { author: string; size?: number }) {
  const svg = LOGOS[author];
  if (!svg) return <span className="plogo plogo-fallback" style={{ width: size, height: size, fontSize: size * 0.45 }}>{author[0]}</span>;
  return <span className="plogo" style={{ width: size, height: size, padding: Math.round(size * 0.17) }} dangerouslySetInnerHTML={{ __html: svg }} aria-label={author} role="img" />;
}
