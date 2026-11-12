import Link from "next/link";
import { GatewayScene } from "@/components/gateway-scene";
import { HeroText } from "@/components/hero";
import { Icon } from "@/components/icons";
import { PlanGrid } from "@/components/plans";
import { ProviderLogo } from "@/components/provider-logo";
import { CodeBlock } from "@/components/ui";
import { ctx, perM } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import { loadConfig, loadFx, loadModels, loadPlans } from "@/lib/server-data";


export default async function Landing() {
  const { t, lang } = await getDict();
  const ru = lang !== "en";
  const [{ data: models }, plans, fx, cfg] = await Promise.all([loadModels(), loadPlans(), loadFx(), loadConfig()]);
  const usd = fx.data.find((r) => r.currency === "USD");
  const popular = models.filter((m) => m.modality === "text" && !m.is_free).slice(0, 6);
  const sample = "deepseek/deepseek-v3.2";
  const L = t.landing;
  const py = `from openai import OpenAI\n\nclient = OpenAI(base_url="${cfg.api_base_url}", api_key="…")\n\nresp = client.chat.completions.create(\n    model="${sample}",\n    messages=[{"role": "user", "content": "${ru ? "Привет!" : "Hello!"}"}],\n)\nprint(resp.choices[0].message.content)`;
  const ts = `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "${cfg.api_base_url}", apiKey: process.env.API_KEY });\n\nconst resp = await client.chat.completions.create({\n  model: "${sample}",\n  messages: [{ role: "user", content: "${ru ? "Привет!" : "Hello!"}" }],\n});`;
  const curl = `curl ${cfg.api_base_url}/chat/completions \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${sample}", "messages": [{"role": "user", "content": "${ru ? "Привет!" : "Hello!"}"}]}'`;

  return (
    <>
      <section className="hero-wrap">
        <div className="hero-glow" aria-hidden><span /><span /><span /></div>
        <div className="wrap hero">
          <HeroText models={models.length} rate={usd ? (usd.rub_micro / 1e6).toFixed(2) : "—"} />
          <div className="hero-art" data-reveal><GatewayScene /></div>
        </div>
      </section>

      <section className="wrap section">
        <div className="split" data-reveal>
          <div className="split-text">
            <h2 className="h1">{ru ? "Подключение — две строки" : "Two lines to connect"}</h2>
            <p className="muted">{ru ? "Берёте любой код под OpenAI, меняете адрес и ключ. Все модели каталога сразу доступны под своими именами." : "Take any OpenAI code, swap the base URL and key. Every model in the catalog is available by its name."}</p>
            <Link href="/docs" className="btn btn-ghost"><Icon name="book" size={17} />{t.nav.docs}</Link>
          </div>
          <CodeBlock tabs={[{ label: "python", code: py }, { label: "typescript", code: ts }, { label: "curl", code: curl }]} />
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head spread" data-reveal>
          <div><h2 className="h1">{L.modelsTitle}</h2><p className="muted">{ru ? "Цены за миллион токенов по сегодняшнему курсу." : "Prices per million tokens at today's rate."} <Link href="/pricing#how" className="link-u">{ru ? "Что это значит?" : "What does that mean?"}</Link></p></div>
          <Link href="/models" className="btn btn-ghost">{L.allModels} <Icon name="arrow" size={16} /></Link>
        </div>
        <div className="mcards">
          {popular.map((m, i) => (
            <Link key={m.id} href={`/models/${m.id}`} className="mcard" data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}>
              <div className="row" style={{ gap: 10 }}>
                <ProviderLogo author={m.author} size={44} />
                <div><div className="h3">{m.name}</div><div className="hint">{m.author} · {ctx(m.context_length)} {ru ? "контекст" : "context"}</div></div>
              </div>
              <p className="muted small mclamp">{m.description}</p>
              <div className="mcard-prices">
                <div><span className="hint">{t.models.input}</span><b className="num">{perM(m.prices.input_per_m, lang)}</b></div>
                <div><span className="hint">{t.models.output}</span><b className="num">{perM(m.prices.output_per_m, lang)}</b></div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head" data-reveal><h2 className="h1">{L.plansTitle}</h2><p className="muted">{L.plansLead}</p></div>
        <div data-reveal><PlanGrid plans={plans} /></div>
      </section>

      <section className="wrap section">
        <div className="faq-wrap" data-reveal>
          <h2 className="h1">{L.faqTitle}</h2>
          <div className="faq">
            {L.faq.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p className="muted">{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="cta" data-reveal>
          <div>
            <h2 className="h1">{ru ? "Попробуйте бесплатно" : "Try it for free"}</h2>
            <p>{ru ? "Регистрация за минуту, стартовый бонус на баланс и бесплатные модели без ограничений по времени." : "Sign up in a minute, get a starter bonus and free models with no time limit."}</p>
          </div>
          <Link href="/register" className="btn btn-lg btn-signal">{ru ? "Создать аккаунт" : "Create account"} <Icon name="arrow" size={18} /></Link>
        </div>
      </section>
    </>
  );
}
