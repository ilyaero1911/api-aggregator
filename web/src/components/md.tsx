import type { ReactNode } from "react";

/** Простая разметка для юридических текстов из админки: ## заголовки, - списки, абзацы, **жирный**. */
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p));
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; } };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ")) { list.push(line.slice(2)); continue; }
    flush();
    if (!line) continue;
    if (line.startsWith("## ")) out.push(<h2 key={out.length} className="h2">{inline(line.slice(3))}</h2>);
    else if (line.startsWith("# ")) out.push(<h1 key={out.length} className="h1">{inline(line.slice(2))}</h1>);
    else out.push(<p key={out.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="md">{out}</div>;
}
