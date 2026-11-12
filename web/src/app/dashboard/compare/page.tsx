"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { ProviderLogo } from "@/components/provider-logo";
import { Select } from "@/components/select";
import { PageHead, useLoad, useToast } from "@/components/ui";
import { get } from "@/lib/api";
import { ms, num, perM, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";

type Col = { model: string; text: string; ms?: number; ttft?: number; tokens?: number; cost?: number; paid?: string; error?: string; busy: boolean };

/** Сравнение моделей: один вопрос уходит в 2–4 модели параллельно, ответы печатаются рядом. */
export default function Compare() {
  const { lang } = useI18n();
  const en = lang === "en";
  const toast = useToast();
  const { data } = useLoad(() => get<{ data: Model[] }>("/api/models"));
  const models = data?.data.filter((m) => m.modality === "text") ?? [];
  const [picked, setPicked] = useState<string[]>(["openai/gpt-5-mini", "deepseek/deepseek-v3.2", "anthropic/claude-haiku-4.5"]);
  const [prompt, setPrompt] = useState("");
  const [cols, setCols] = useState<Col[]>([]);
  const busy = cols.some((c) => c.busy);
  const byId = (id: string) => models.find((m) => m.id === id);

  async function runOne(i: number, model: string, text: string) {
    const t0 = performance.now();
    let first = 0;
    const upd = (p: Partial<Col>) => setCols((cs) => cs.map((c, k) => (k === i ? { ...c, ...p } : c)));
    try {
      const res = await fetch("/api/playground/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: true, cache: false, messages: [{ role: "user", content: text }] }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); upd({ busy: false, error: e?.error?.message ?? res.statusText }); return; }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:") || line.endsWith("[DONE]")) continue;
          const j = JSON.parse(line.slice(5));
          const d = j.choices?.[0]?.delta?.content;
          if (d) { if (!first) first = performance.now() - t0; acc += d; upd({ text: acc, ttft: Math.round(first) }); }
          if (j.usage) upd({ tokens: j.usage.total_tokens, cost: j.usage.cost * 1e6, paid: j.usage.paid_by });
        }
      }
      upd({ busy: false, ms: Math.round(performance.now() - t0) });
    } catch (e) { upd({ busy: false, error: (e as Error).message }); }
  }

  const run = () => {
    const text = prompt.trim();
    if (!text || picked.length < 2) return toast(en ? "Pick at least two models and write a question" : "Выберите хотя бы две модели и напишите вопрос", true);
    setCols(picked.map((m) => ({ model: m, text: "", busy: true })));
    picked.forEach((m, i) => runOne(i, m, text));
  };
  const done = cols.filter((c) => !c.busy && !c.error);
  const fastest = done.length > 1 ? done.reduce((a, b) => ((a.ms ?? 1e9) < (b.ms ?? 1e9) ? a : b)).model : "";
  const cheapest = done.length > 1 ? done.reduce((a, b) => ((a.cost ?? 1e18) < (b.cost ?? 1e18) ? a : b)).model : "";

  return (
    <>
      <PageHead title={en ? "Compare models" : "Сравнение моделей"} lead={en ? "Ask one question to several models at once and compare answers, speed and price side by side." : "Задайте один вопрос сразу нескольким моделям и сравните ответы, скорость и цену рядом."} />
      <div className="cmp-setup">
        <div className="cmp-picked">
          {picked.map((id) => (
            <span key={id} className="cmp-chip"><ProviderLogo author={byId(id)?.author ?? "?"} size={22} />{byId(id)?.name ?? id}
              <button onClick={() => setPicked(picked.filter((x) => x !== id))} aria-label="remove"><Icon name="close" size={13} /></button></span>
          ))}
          {picked.length < 4 && (
            <Select value="" placeholder={en ? "+ add model" : "+ добавить модель"} onChange={(e) => e.target.value && setPicked([...picked, e.target.value])} style={{ minWidth: 220 }}>
              <option value="">{en ? "+ add model" : "+ добавить модель"}</option>
              {models.filter((m) => !picked.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
        </div>
        <form className="pg2-input" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); run(); }}>
          <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={en ? "Your question for all models…" : "Ваш вопрос для всех моделей…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }} />
          <button className="btn btn-signal" disabled={busy}><Icon name="bolt" size={16} />{en ? "Compare" : "Сравнить"}</button>
        </form>
      </div>
      {cols.length > 0 && (
        <div className="cmp-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))` }}>
          {cols.map((c) => {
            const m = byId(c.model);
            return (
              <section key={c.model} className="cmp-col">
                <header className="row" style={{ gap: 10 }}>
                  <ProviderLogo author={m?.author ?? "?"} size={32} />
                  <div className="grow" style={{ minWidth: 0 }}><b>{m?.name ?? c.model}</b><div className="hint">{m ? `${perM(m.prices.input_per_m, lang)} / ${perM(m.prices.output_per_m, lang)}` : ""}</div></div>
                  {c.model === fastest && <span className="tag tag-ok">{en ? "fastest" : "быстрее всех"}</span>}
                  {c.model === cheapest && <span className="tag tag-signal">{en ? "cheapest" : "дешевле всех"}</span>}
                </header>
                <div className={`cmp-text${c.error ? " bad" : ""}`}>{c.error ?? c.text}{c.busy && <span className="caret" />}</div>
                <footer className="cmp-meta">
                  <span>{en ? "Time" : "Время"} <b>{c.ms ? ms(c.ms) : "…"}</b></span>
                  <span>{en ? "First token" : "Первый токен"} <b>{c.ttft ? ms(c.ttft) : "…"}</b></span>
                  <span>{en ? "Tokens" : "Токены"} <b>{c.tokens ? num(c.tokens, lang) : "…"}</b></span>
                  <span>{en ? "Cost" : "Цена"} <b>{c.cost !== undefined ? (c.paid === "balance" ? rub(c.cost, lang, { precise: true }) : c.paid === "plan" ? (en ? "plan" : "по тарифу") : (en ? "free" : "бесплатно")) : "…"}</b></span>
                </footer>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
