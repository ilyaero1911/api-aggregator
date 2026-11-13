import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/ui";
import { TokenExplainer } from "@/components/token-explainer";
import { ProviderLogo } from "@/components/provider-logo";
import { CopyId } from "@/components/copy-id";
import { loadModels } from "@/lib/server-data";
import { api } from "@/lib/api";
import { ctx, date, perM } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import { loadConfig } from "@/lib/server-data";
import type { Model } from "@/lib/types";

type Resp = { model: Model; endpoints: { provider: string; enabled: boolean; priority: number }[] };

/** Страница модели: общая для публичного сайта и кабинета, base — откуда пришли (/models или /dashboard/models). */
export async function ModelDetail({ author, slug, base, inShell }: { author: string; slug: string; base: string; inShell?: boolean }) {
  const { t, lang } = await getDict();
  let data: Resp;
  try {
    data = await api<Resp>(`/api/models/${author}/${slug}`, { cache: "no-store" });
  } catch {
    notFound();
  }
  const { model: m, endpoints } = data;
  const [cfg, { data: all }] = await Promise.all([loadConfig(), loadModels()]);
  const M = t.models;
  const body = m.modality === "image"
    ? `curl ${cfg.api_base_url}/images/generations \\\n  -H "Authorization: Bearer $STRELKA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${m.id}", "prompt": "a lighthouse in fog"}'`
    : `curl ${cfg.api_base_url}/chat/completions \\\n  -H "Authorization: Bearer $STRELKA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${m.id}",\n    "stream": true,\n    "messages": [{"role": "user", "content": "Привет!"}]\n  }'`;

  return (
    <div className={inShell ? "" : "wrap"} style={{ paddingTop: inShell ? 0 : 40 }}>
      <Link href={base} className="small muted">← {M.title}</Link>
      <header className="page-head" style={{ marginTop: 16 }}>
        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <div className="row" style={{ gap: 16 }}><ProviderLogo author={m.author} size={64} /><div className="stack" style={{ ["--gap" as string]: "6px" }}><div className="label">{m.author}</div><h1 className="h1" style={{ fontSize: 40 }}>{m.name}</h1></div></div>
          <div className="row-wrap">
            <CopyId id={m.id} label />
            {m.is_free && <span className="tag tag-ok">{t.common.free}</span>}
            {m.in_plans && <span className="tag tag-signal">{M.inPlan}</span>}
            {m.open_weights && <span className="tag">{M.openWeights}</span>}
            {m.capabilities.map((c) => <span key={c} className="tag">{M.cap[c] ?? c}</span>)}
          </div>
          <p className="muted" style={{ maxWidth: 680 }}>{m.description}</p>
        </div>
        <Link className="btn btn-signal" href={`/dashboard/${m.modality === "image" ? "images" : "playground"}?model=${encodeURIComponent(m.id)}`}>{M.tryIt} →</Link>
      </header>

      <div className="board" style={{ marginBottom: 40 }}>
        {m.modality === "image" ? (
          <div><span className="label">{M.perImage}</span><span className="v">{perM(m.prices.image, lang)}</span></div>
        ) : (
          <>
            <div><span className="label">{M.input} · {M.perM}</span><span className="v">{perM(m.prices.input_per_m, lang)}</span></div>
            <div><span className="label">{M.output} · {M.perM}</span><span className="v">{perM(m.prices.output_per_m, lang)}</span></div>
            {m.prices.cache_read_per_m > 0 && <div><span className="label">{M.cacheRead}</span><span className="v">{perM(m.prices.cache_read_per_m, lang)}</span></div>}
          </>
        )}
        <div><span className="label">{M.contextLen}</span><span className="v">{ctx(m.context_length)}</span></div>
        {m.max_output > 0 && <div><span className="label">{M.maxOutput}</span><span className="v">{ctx(m.max_output)}</span></div>}
        <div><span className="label">{M.released}</span><span className="v" style={{ fontSize: 20 }}>{date(m.released_at, lang)}</span></div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="panel">
          <h2 className="h2" style={{ marginBottom: 16 }}>{M.apiExample}</h2>
          <CodeBlock lang="curl" code={body} />
        </section>
        <section className="panel">
          <h2 className="h2" style={{ marginBottom: 16 }}>{M.providers}</h2>
          <table className="table">
            <tbody>
              {endpoints.map((e, i) => (
                <tr key={e.provider}>
                  <td className="mono">{e.provider}</td>
                  <td className="r">{e.enabled ? <span className="tag tag-ok"><span className="dot" />online</span> : <span className="tag">off</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {m.modality === "text" && <div className="section"><TokenExplainer models={all} initialModel={m.id} /></div>}
    </div>
  );
}
