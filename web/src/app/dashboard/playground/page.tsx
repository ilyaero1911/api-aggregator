"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Help } from "@/components/help";
import { ProviderLogo } from "@/components/provider-logo";
import { Select } from "@/components/select";
import { Seg, Switch, useLoad, useToast } from "@/components/ui";
import { get } from "@/lib/api";
import { perM, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string; meta?: string; error?: boolean; model?: string };

const COPY = {
  ru: {
    title: "Чат с моделями",
    lead: "Задайте вопрос любой модели прямо здесь, без кода. Удобно, чтобы сравнить модели перед подключением по API. Стоимость такая же, как через API.",
    settings: "Настройки ответа", model: "Модель",
    sys: "Инструкция для модели", sysHint: "Модель будет следовать ей во всём разговоре.", sysPh: "Например: отвечай кратко и по-русски",
    sysPresets: [["Кратко", "Отвечай кратко, по делу, без вступлений."], ["Как эксперт", "Ты опытный специалист. Объясняй понятно и приводи примеры."], ["Переводчик", "Переводи всё, что я пишу, на английский язык."]],
    creative: "Креативность", exact: "Точно", free: "Творчески",
    length: "Длина ответа", short: "Короткий", mid: "Средний", long: "Длинный",
    stream: "Показывать ответ по мере печати",
    clear: "Очистить чат", start: "С чего начать", startHint: "Нажмите на пример или напишите свой вопрос внизу.",
    examples: ["Объясни простыми словами, что такое API", "Напиши вежливое письмо о переносе встречи", "Придумай 5 названий для кофейни", "Сравни Python и Go для бэкенда"],
    ph: "Напишите сообщение…", hint: "Enter — отправить, Shift + Enter — новая строка", you: "Вы", send: "Отправить", stop: "Остановить",
    cost: "{t} токенов · {c}", freeModel: "бесплатная модель",
    sysHelp: "Это постоянное указание для модели: какую роль играть, каким тоном и в каком виде отвечать. Например «отвечай кратко» или «ты юрист». Модель помнит его весь разговор. Можно оставить пустым.",
    creativeHelp: "Насколько смело модель подбирает слова. Ближе к нулю — точные и предсказуемые ответы, подходит для кода, фактов и расчётов. Ближе к двум — разнообразнее и неожиданнее, подходит для идей и текстов.",
    lengthHelp: "Сколько модель может написать в ответ. Короткий — пара абзацев, длинный — подробная статья. Платите только за реально написанный текст, а лимит лишь не даёт ответу разрастись.",
    streamHelp: "Если включено, ответ появляется по словам, как будто модель печатает. Если выключено, ответ придёт целиком, когда будет готов.",
    priceHelp: "Цена за миллион токенов: сначала за ваш вопрос, потом за ответ модели. Один обычный вопрос с ответом стоит копейки.",
  },
  en: {
    title: "Chat with models",
    lead: "Ask any model right here, no code needed. Handy for comparing models before using the API. Same price as the API.",
    settings: "Response settings", model: "Model",
    sys: "Instructions for the model", sysHint: "The model follows them for the whole conversation.", sysPh: "For example: answer briefly",
    sysPresets: [["Brief", "Answer briefly and to the point."], ["Expert", "You are an experienced specialist. Explain clearly with examples."], ["Translator", "Translate everything I write into Spanish."]],
    creative: "Creativity", exact: "Precise", free: "Creative",
    length: "Answer length", short: "Short", mid: "Medium", long: "Long",
    stream: "Show the answer as it is typed",
    clear: "Clear chat", start: "Where to start", startHint: "Click an example or type your own question below.",
    examples: ["Explain what an API is in simple words", "Write a polite email to reschedule a meeting", "Come up with 5 names for a coffee shop", "Compare Python and Go for backends"],
    ph: "Write a message…", hint: "Enter to send, Shift + Enter for a new line", you: "You", send: "Send", stop: "Stop",
    cost: "{t} tokens · {c}", freeModel: "free model",
    sysHelp: "A standing instruction for the model: what role to play, which tone and format to use. For example “answer briefly” or “you are a lawyer”. The model keeps it for the whole chat. You can leave it empty.",
    creativeHelp: "How boldly the model picks words. Near zero means precise and predictable answers, good for code, facts and maths. Near two means more varied and surprising, good for ideas and writing.",
    lengthHelp: "How much the model may write. Short is a couple of paragraphs, long is a detailed article. You only pay for what is actually written.",
    streamHelp: "When on, the answer appears word by word as the model types. When off, it arrives in one piece when ready.",
    priceHelp: "Price per million tokens: first for your question, then for the answer. A typical question and answer costs a fraction of a cent.",
  },
};

function Playground() {
  const { lang, t } = useI18n();
  const C = COPY[lang === "en" ? "en" : "ru"];
  const toast = useToast();
  const sp = useSearchParams();
  const { data } = useLoad(() => get<{ data: Model[] }>("/api/models"));
  const models = data?.data.filter((m) => m.modality === "text") ?? [];
  const [model, setModel] = useState(sp.get("model") ?? "");
  const [system, setSystem] = useState(sp.get("system") ?? "");
  const [temp, setTemp] = useState(0.7);
  const [len, setLen] = useState<"256" | "1024" | "4096">("1024");
  const [stream, setStream] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(sp.get("prompt") ?? "");
  const [busy, setBusy] = useState(false);
  const [showSet, setShowSet] = useState(false);
  useEffect(() => { try { setShowSet(localStorage.getItem("chat-settings") === "1"); } catch {} }, []);
  const toggleSet = () => setShowSet((v) => { try { localStorage.setItem("chat-settings", v ? "0" : "1"); } catch {} return !v; });
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!model && models.length) setModel(models.find((m) => m.is_free)?.id ?? models[0].id); }, [models, model]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "0px"; el.style.height = Math.min(200, el.scrollHeight) + "px"; } }, [input]);
  const cur = models.find((m) => m.id === model);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy || !model) return;
    const history: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs([...history, { role: "assistant", content: "", model }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const body = {
      model, stream, temperature: temp, max_tokens: Number(len),
      messages: [...(system ? [{ role: "system", content: system }] : []), ...history.map(({ role, content }) => ({ role, content }))],
    };
    const update = (fn: (m: Msg) => Msg) => setMsgs((xs) => [...xs.slice(0, -1), fn(xs[xs.length - 1])]);
    const meta = (u: { total_tokens: number; cost: number; paid_by: string }) =>
      C.cost.replace("{t}", String(u.total_tokens)).replace("{c}", u.paid_by === "balance" ? rub(u.cost * 1e6, lang, { precise: true }) : u.paid_by === "free" ? C.freeModel : t.logs.paid[u.paid_by]);
    try {
      const res = await fetch("/api/playground/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        update((m) => ({ ...m, content: e?.error?.message ?? res.statusText, error: true }));
        return;
      }
      if (!stream) {
        const j = await res.json();
        update((m) => ({ ...m, content: j.choices[0].message.content, meta: meta(j.usage) }));
        return;
      }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          const j = JSON.parse(payload);
          if (j.error) update((m) => ({ ...m, content: m.content + "\n" + j.error.message, error: true }));
          const d = j.choices?.[0]?.delta?.content;
          if (d) update((m) => ({ ...m, content: m.content + d }));
          if (j.usage) update((m) => ({ ...m, meta: meta(j.usage) }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(t.common.error, true);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="chat">
      <div className="chat-top">
        <div className="chat-model">
          {cur && <ProviderLogo author={cur.author} size={34} />}
          <Select value={model} onChange={(e) => setModel(e.target.value)} style={{ minWidth: 240 }}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.is_free ? (lang === "en" ? " · free" : " · бесплатно") : ""}</option>)}
          </Select>
          {cur && <span className="hint chat-price">{cur.is_free ? C.freeModel : `${perM(cur.prices.input_per_m, lang)} / ${perM(cur.prices.output_per_m, lang)} ${t.models.perM}`}<Help text={C.priceHelp} /></span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {msgs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setMsgs([])} disabled={busy}><Icon name="trash" size={15} /><span className="hide-sm">{C.clear}</span></button>}
          <button className={`btn btn-sm ${showSet ? "" : "btn-ghost"}`} onClick={toggleSet}><Icon name="preset" size={15} /><span className="hide-sm">{C.settings}</span>{system && <i className="stop-dot" style={{ position: "static" }} />}</button>
        </div>
      </div>
      <div className={`chat-body${showSet ? " with-set" : ""}`}>
        <section className="pg2-chat">
          <div className="pg2-log" ref={log}>
            {msgs.length === 0 ? (
              <div className="pg2-empty">
                <span className="pg2-empty-ico"><Icon name="sparkle" size={26} /></span>
                <h2 className="h2">{C.start}</h2>
                <p className="muted">{C.startHint}</p>
                <div className="pg2-ex">
                  {C.examples.map((x) => <button key={x} onClick={() => send(x)}><Icon name="chat" size={16} />{x}</button>)}
                </div>
              </div>
            ) : msgs.map((m, i) => (
              <div key={i} className={`bub bub-${m.role}`}>
                {m.role === "assistant" && <span className="bub-ava"><Icon name="sparkle" size={15} /></span>}
                <div className="bub-body">
                  {m.role === "assistant" && <div className="hint">{m.model}</div>}
                  <div className={`bub-text${m.error ? " bad" : ""}`}>{m.content || (busy && i === msgs.length - 1 ? <span className="dots"><i /><i /><i /></span> : "")}</div>
                  {m.meta && <div className="hint">{m.meta}</div>}
                </div>
              </div>
            ))}
          </div>
          <form className="pg2-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea ref={ta} rows={1} placeholder={C.ph} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {busy ? <button type="button" className="btn btn-ghost" onClick={() => abort.current?.abort()}><Icon name="stop" size={16} />{C.stop}</button>
              : <button className="btn btn-signal" disabled={!input.trim() || !model}><Icon name="send" size={16} /><span className="hide-sm">{C.send}</span></button>}
          </form>
          <div className="hint" style={{ padding: "0 18px 12px" }}>{C.hint}</div>
        </section>

        {showSet && (
          <aside className="pg2-side chat-set">
            <div className="spread"><h2 className="h3">{C.settings}</h2><button className="x-btn" onClick={toggleSet} aria-label="close"><Icon name="close" size={16} /></button></div>
            <div className="field">
              <span>{C.sys}<Help text={C.sysHelp} /></span>
              <textarea className="textarea" rows={4} placeholder={C.sysPh} value={system} onChange={(e) => setSystem(e.target.value)} />
              <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
                {C.sysPresets.map(([l, v]) => <button key={l} type="button" className={`chip${system === v ? " on" : ""}`} onClick={() => setSystem(system === v ? "" : v)}>{l}</button>)}
              </div>
            </div>
            <div className="field">
              <span className="spread"><span>{C.creative}<Help text={C.creativeHelp} /></span><b className="mono small">{temp.toFixed(1)}</b></span>
              <input type="range" min="0" max="2" step="0.1" value={temp} onChange={(e) => setTemp(Number(e.target.value))} />
              <div className="spread hint"><span>{C.exact}</span><span>{C.free}</span></div>
            </div>
            <div className="field">
              <span>{C.length}<Help text={C.lengthHelp} /></span>
              <Seg value={len} onChange={setLen} options={[{ value: "256", label: C.short }, { value: "1024", label: C.mid }, { value: "4096", label: C.long }]} />
            </div>
            <label className="spread small" style={{ gap: 12 }}><span>{C.stream}<Help text={C.streamHelp} /></span><Switch checked={stream} onChange={setStream} /></label>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function Page() { return <Suspense><Playground /></Suspense>; }
