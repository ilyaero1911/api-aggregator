import Link from "next/link";
import { CodeBlock } from "@/components/ui";
import { PlanGrid } from "@/components/plans";
import { RouteDiagram } from "@/components/route-diagram";
import { ctx, perM } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { getDict } from "@/lib/i18n/server";
import { loadConfig, loadFx, loadModels, loadPlans } from "@/lib/server-data";

export default async function Landing() {
  const { t, lang } = await getDict();
  const [{ data: models }, plans, fx, cfg] = await Promise.all([loadModels(), loadPlans(), loadFx(), loadConfig()]);
  const authors = Array.from(new Set(models.map((m) => m.author)));
  const usd = fx.data.find((r) => r.currency === "USD");
  const popular = models.filter((m) => m.modality === "text" && !m.is_free).slice(0, 8);
  const sample = popular[1]?.id ?? "openai/gpt-5";
  const L = t.landing;

  const py = `from openai import OpenAI

client = OpenAI(
    base_url="${cfg.api_base_url}",
    api_key="ng-v1-…",
)

resp = client.chat.completions.create(
    model="${sample}",
    messages=[{"role": "user", "content": "Привет!"}],
)
print(resp.choices[0].message.content)`;
  const curl = `curl ${cfg.api_base_url}/chat/completions \\
  -H "Authorization: Bearer $NG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${sample}", "messages": [{"role": "user", "content": "Привет!"}]}'`;
  const ts = `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${cfg.api_base_url}", apiKey: process.env.NG_API_KEY });

const resp = await client.chat.completions.create({
  model: "${sample}",
  messages: [{ role: "user", content: "Привет!" }],
});`;

  return (
    <>
      <section className="wrap hero">
        <div className="hero-text">
          <div className="label">{fmt(L.kicker, { n: models.length })}</div>
          <h1 className="h-display" style={{ whiteSpace: "pre-line" }}>{L.title}</h1>
          <p className="hero-lead">{L.lead}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <Link href="/register" className="btn btn-lg btn-signal">{L.start} →</Link>
            <Link href="/docs" className="btn btn-lg btn-ghost">{L.docs}</Link>
          </div>
        </div>
        <div className="hero-art"><RouteDiagram providers={authors} /></div>
      </section>

      <section className="wrap">
        <div className="board">
          <div><span className="label">{L.statModels}</span><span className="v">{models.length}</span></div>
          <div><span className="label">{L.statProviders}</span><span className="v">{authors.length}</span></div>
          <div><span className="label">{L.statRate}</span><span className="v">{usd ? (usd.rub_micro / 1e6).toFixed(2) : "—"}<small>₽/$</small></span></div>
          <div><span className="label">OpenAI SDK</span><span className="v">/v1<small>compatible</small></span></div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head"><span className="label">01</span><h2 className="h1">{L.howTitle}</h2></div>
        <div className="how">
          {[[L.how1t, L.how1], [L.how2t, L.how2], [L.how3t, L.how3], [L.how4t, L.how4]].map(([h, p], i) => (
            <div key={h}>
              <div className="label">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="h3">{h}</h3>
              <p className="muted">{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head"><span className="label">02</span><h2 className="h1">{L.tryTitle}</h2></div>
        <CodeBlock tabs={[{ label: "python", code: py }, { label: "typescript", code: ts }, { label: "curl", code: curl }]} />
      </section>

      <section className="wrap section">
        <div className="section-head spread">
          <div><span className="label">03</span><h2 className="h1">{L.modelsTitle}</h2></div>
          <Link href="/models" className="btn btn-ghost">{L.allModels} →</Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t.models.title}</th><th>{t.models.author}</th><th className="r">{t.models.context}</th><th className="r">{t.models.input}</th><th className="r">{t.models.output}</th></tr></thead>
            <tbody>
              {popular.map((m) => (
                <tr key={m.id}>
                  <td><Link href={`/models/${m.id}`}><b style={{ fontWeight: 500 }}>{m.name}</b> <span className="faint mono small">{m.id}</span></Link></td>
                  <td className="muted">{m.author}</td>
                  <td className="r num">{ctx(m.context_length)}</td>
                  <td className="r num">{perM(m.prices.input_per_m, lang)}</td>
                  <td className="r num">{perM(m.prices.output_per_m, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>{t.models.perM} · {usd ? fmt(t.pricing.rateNote, { rate: (usd.rub_micro / 1e6).toFixed(2), source: usd.source, markup: fx.markup_bps / 100 }) : ""}</p>
      </section>

      <section className="wrap section">
        <div className="section-head"><span className="label">04</span><h2 className="h1">{L.plansTitle}</h2><p className="muted">{L.plansLead}</p></div>
        <PlanGrid plans={plans} />
      </section>

      <section className="wrap section">
        <div className="section-head"><span className="label">05</span><h2 className="h1">{L.faqTitle}</h2></div>
        <div className="faq">
          {L.faq.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p className="muted">{a}</p></details>
          ))}
        </div>
      </section>
    </>
  );
}
