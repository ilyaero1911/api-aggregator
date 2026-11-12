"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { SCENARIOS, scenarioCode, type Scenario } from "@/lib/scenarios";
import { Icon } from "./icons";
import { CodeBlock, PageHead } from "./ui";

export function ScenarioList({ base, inShell }: { base: string; inShell?: boolean }) {
  const { lang } = useI18n();
  const L = lang === "en" ? 1 : 0;
  return (
    <div className={inShell ? "" : "wrap"} style={{ paddingTop: inShell ? 0 : 48 }}>
      <PageHead title={L ? "Ready-made scenarios" : "Готовые сценарии"} lead={L ? "Typical business tasks with a tested prompt and code. Copy, change the input and run." : "Типовые задачи бизнеса с проверенным промптом и кодом. Скопируйте, подставьте свои данные и запускайте."} />
      <div className="scn-grid">
        {SCENARIOS.map((s, i) => (
          <Link key={s.slug} href={`${base}/${s.slug}`} className="scn-card" data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}>
            <span className="scn-ico"><Icon name={s.icon} size={22} /></span>
            <h2 className="h3">{s.title[L]}</h2>
            <p className="muted small">{s.lead[L]}</p>
            <span className="scn-more">{L ? "Open scenario" : "Открыть сценарий"} <Icon name="arrow" size={15} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ScenarioDetail({ slug, base, apiBase, inShell }: { slug: string; base: string; apiBase: string; inShell?: boolean }) {
  const { lang } = useI18n();
  const L = lang === "en" ? 1 : 0;
  const s = SCENARIOS.find((x) => x.slug === slug) as Scenario | undefined;
  if (!s) return <div className="empty">404</div>;
  const tryHref = `/dashboard/playground?model=${encodeURIComponent(s.model)}&system=${encodeURIComponent(s.system)}&prompt=${encodeURIComponent(s.example)}`;
  return (
    <div className={inShell ? "" : "wrap"} style={{ paddingTop: inShell ? 0 : 40 }}>
      <Link href={base} className="small muted">← {L ? "All scenarios" : "Все сценарии"}</Link>
      <header className="page-head" style={{ marginTop: 14 }}>
        <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
          <span className="scn-ico big"><Icon name={s.icon} size={28} /></span>
          <div className="stack" style={{ ["--gap" as string]: "8px" }}>
            <h1 className="h1">{s.title[L]}</h1>
            <p className="muted" style={{ maxWidth: 680 }}>{s.lead[L]}</p>
          </div>
        </div>
        <Link href={tryHref} className="btn btn-signal"><Icon name="chat" size={16} />{L ? "Try in chat" : "Попробовать в чате"}</Link>
      </header>
      <div className="scn-steps">
        {s.steps.map((st, i) => <div key={i} className="scn-step"><span className="scn-n">{i + 1}</span>{st[L]}</div>)}
      </div>
      <div className="grid-2" style={{ alignItems: "start", marginTop: 24 }}>
        <section className="panel stack">
          <h2 className="h3">{L ? "Prompt (system instruction)" : "Промпт (инструкция для модели)"}</h2>
          <div className="scn-prompt">{s.system}</div>
          <h2 className="h3">{L ? "Example input" : "Пример входа"}</h2>
          <div className="scn-prompt">{s.example}</div>
          <h2 className="h3">{L ? "Example result" : "Пример результата"}</h2>
          <pre className="scn-prompt mono small">{s.result}</pre>
          <p className="hint">{L ? "Recommended model" : "Рекомендуемая модель"}: <span className="mono">{s.model}</span></p>
        </section>
        <section className="stack">
          <h2 className="h3">{L ? "Code" : "Код"}</h2>
          <CodeBlock lang="python" code={scenarioCode(s, apiBase)} />
        </section>
      </div>
    </div>
  );
}
