"use client";

import { useState } from "react";
import { CodeBlock, Modal, PageHead, Skeleton, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, post, put } from "@/lib/api";
import { ago } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Model, Preset } from "@/lib/types";

type Form = { id?: string; slug: string; name: string; description: string; model_id: string; fallbacks: string; system_prompt: string; temperature: string; max_tokens: string };

export default function Presets() {
  const { t, lang } = useI18n();
  const P = t.presets;
  const toast = useToast();
  const { ask, node } = useConfirm();
  const { data, loading, reload } = useLoad(() => get<{ data: Preset[]; limit: number }>("/api/presets"));
  const models = useLoad(() => get<{ data: Model[] }>("/api/models"));
  const textModels = models.data?.data.filter((m) => m.modality === "text") ?? [];
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (p?: Preset) => setForm(p ? {
    id: p.id, slug: p.slug, name: p.name, description: p.description, model_id: p.model_id, fallbacks: p.fallback_models.join(", "),
    system_prompt: p.system_prompt, temperature: p.temperature?.toString() ?? "", max_tokens: p.max_tokens?.toString() ?? "",
  } : { slug: "", name: "", description: "", model_id: textModels[0]?.id ?? "", fallbacks: "", system_prompt: "", temperature: "", max_tokens: "" });

  async function save() {
    if (!form) return;
    setBusy(true);
    const body = {
      slug: form.slug, name: form.name, description: form.description, model_id: form.model_id, system_prompt: form.system_prompt,
      fallback_models: form.fallbacks.split(",").map((s) => s.trim()).filter(Boolean),
      temperature: form.temperature ? Number(form.temperature) : null, max_tokens: form.max_tokens ? Number(form.max_tokens) : null,
    };
    try {
      if (form.id) await put(`/api/presets/${form.id}`, body); else await post("/api/presets", body);
      setForm(null); reload(); toast(t.common.saved);
    } catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); } finally { setBusy(false); }
  }

  const list = data?.data ?? [];
  return (
    <>
      <PageHead title={P.title} lead={P.lead} actions={<>
        <span className="mono small faint">{fmt(P.count, { n: list.length, max: data?.limit ?? 10 })}</span>
        <button className="btn" disabled={list.length >= (data?.limit ?? 10)} onClick={() => open()}>+ {P.create}</button>
      </>} />
      {loading ? <Skeleton h={120} /> : list.length === 0 ? (
        <div className="stack">
          <div className="empty">{P.empty}</div>
          <CodeBlock lang="json" code={`{\n  "model": "@preset/support-bot",\n  "messages": [{"role": "user", "content": "Где мой заказ?"}]\n}`} />
        </div>
      ) : (
        <div className="mrows">
          {list.map((p) => (
            <div key={p.id} className="mrow" style={{ cursor: "default" }}>
              <div className="grow stack" style={{ ["--gap" as string]: "6px" }}>
                <div className="row-wrap"><span className="h3">{p.name}</span><code className="tag tag-ink">@preset/{p.slug}</code></div>
                {p.description && <p className="muted small">{p.description}</p>}
                <div className="small faint mono">{p.model_id}{p.fallback_models.length > 0 && <> → {p.fallback_models.join(" → ")}</>}</div>
                {p.system_prompt && <p className="small muted mclamp">“{p.system_prompt}”</p>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="hint">{ago(p.updated_at, lang)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => open(p)}>{t.common.edit}</button>
                <button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(fmt(P.deleteConfirm, { name: p.name }))) { await del(`/api/presets/${p.id}`); reload(); } }}>{t.common.delete}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal wide open={!!form} onClose={() => setForm(null)} title={form?.id ? t.common.edit : P.create}
        footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>{t.common.cancel}</button><button className="btn" disabled={busy || !form?.slug} onClick={save}>{t.common.save}</button></>}>
        {form && (
          <>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{P.slug}</span><input className="input mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="support-bot" /><span className="hint">{P.slugHint}</span></label>
              <label className="field"><span>{P.name}</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            </div>
            <label className="field"><span>{P.description}</span><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="field"><span>{P.model}</span>
              <select className="select" value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
                {textModels.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.id}</option>)}
              </select>
            </label>
            <label className="field"><span>{P.fallbacks}</span><input className="input mono" value={form.fallbacks} onChange={(e) => setForm({ ...form, fallbacks: e.target.value })} placeholder="openai/gpt-5-mini, deepseek/deepseek-v3.2" /><span className="hint">{P.fallbacksHint}</span></label>
            <label className="field"><span>{P.system}</span><textarea className="textarea" rows={4} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} /></label>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{P.temperature}</span><input className="input" type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} /></label>
              <label className="field"><span>{P.maxTokens}</span><input className="input" type="number" min="1" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} /></label>
            </div>
          </>
        )}
      </Modal>
      {node}
    </>
  );
}
