"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PageHead, useLoad, useToast } from "@/components/ui";
import { get } from "@/lib/api";
import { perM, rub } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string; meta?: string; error?: boolean };

function Playground() {
  const { t, lang } = useI18n();
  const P = t.playground;
  const toast = useToast();
  const sp = useSearchParams();
  const { data } = useLoad(() => get<{ data: Model[] }>("/api/models"));
  const models = data?.data.filter((m) => m.modality === "text") ?? [];
  const [model, setModel] = useState(sp.get("model") ?? "");
  const [system, setSystem] = useState("");
  const [temp, setTemp] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [stream, setStream] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!model && models.length) setModel(models.find((m) => m.is_free)?.id ?? models[0].id); }, [models, model]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  const cur = models.find((m) => m.id === model);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const body = {
      model, stream, temperature: temp, max_tokens: maxTokens,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...history.map(({ role, content }) => ({ role, content }))],
    };
    const update = (fn: (m: Msg) => Msg) => setMsgs((xs) => [...xs.slice(0, -1), fn(xs[xs.length - 1])]);
    try {
      const res = await fetch("/api/playground/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        update((m) => ({ ...m, content: e?.error?.message ?? res.statusText, error: true }));
        return;
      }
      const meta = (u: { total_tokens: number; cost: number; paid_by: string }) =>
        fmt(P.cost, { tokens: u.total_tokens, cost: u.paid_by === "balance" ? rub(u.cost * 1e6, lang, { precise: true }) : t.logs.paid[u.paid_by] });
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
    <>
      <PageHead title={P.title} lead={P.lead} />
      <div className="pg">
        <aside className="pg-side stack">
          <label className="field"><span>{P.model}</span>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.is_free ? " · free" : ""}</option>)}
            </select>
          </label>
          {cur && <p className="hint mono">{cur.is_free ? t.common.free : `${perM(cur.prices.input_per_m, lang)} / ${perM(cur.prices.output_per_m, lang)} · ${t.models.perM}`}</p>}
          <label className="field"><span>{P.system}</span><textarea className="textarea" rows={5} placeholder={P.systemPh} value={system} onChange={(e) => setSystem(e.target.value)} /></label>
          <label className="field"><span className="spread">{P.temperature}<span className="mono">{temp.toFixed(1)}</span></span><input type="range" min="0" max="2" step="0.1" value={temp} onChange={(e) => setTemp(Number(e.target.value))} style={{ accentColor: "var(--signal)" }} /></label>
          <label className="field"><span>{P.maxTokens}</span><input className="input" type="number" min="1" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} /></label>
          <label className="check"><input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} />{P.stream}</label>
          <div><button className="btn btn-ghost btn-sm" onClick={() => setMsgs([])} disabled={busy}>{P.clear}</button></div>
        </aside>
        <section className="pg-chat">
          <div className="pg-log">
            {msgs.length === 0 && <div className="empty" style={{ border: 0 }}>{P.empty}</div>}
            {msgs.map((m, i) => (
              <div key={i} className={`msg msg-${m.role}`}>
                <div className="label">{m.role === "user" ? P.you : model}</div>
                <div className={`msg-body${m.error ? " bad" : ""}`}>{m.content || (busy && i === msgs.length - 1 ? <span className="caret" /> : "")}</div>
                {m.meta && <div className="hint mono">{m.meta}</div>}
              </div>
            ))}
            <div ref={end} />
          </div>
          <form className="pg-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea className="textarea" rows={3} placeholder={P.placeholder} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {busy ? <button type="button" className="btn btn-ghost" onClick={() => abort.current?.abort()}>{P.stop}</button>
              : <button className="btn btn-signal" disabled={!input.trim() || !model}>{P.send} ↵</button>}
          </form>
        </section>
      </div>
    </>
  );
}

export default function Page() { return <Suspense><Playground /></Suspense>; }
