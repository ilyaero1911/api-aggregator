"use client";

import { useState } from "react";
import { Modal, PageHead, Switch, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, put } from "@/lib/api";
import { ctx, perM } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";
import { Select } from "@/components/select";

type Ep = { model_id: string; provider_id: string; upstream_model: string; priority: number; enabled: boolean };
type Prov = { id: string; name: string };
type F = { id: string; name: string; author: string; description: string; modality: "text" | "image"; capabilities: string; categories: string;
  context_length: string; max_output: string; pin: string; pout: string; pcache: string; pimg: string; open_weights: boolean; in_plans: boolean; enabled: boolean; released_at: string; isNew: boolean };

const usd = (micro: number) => String(micro / 1e6);

export default function AdminModels() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { ask, node } = useConfirm();
  const { data, reload } = useLoad(() => get<{ data: Model[]; endpoints: Ep[] }>("/api/admin/models"));
  const provs = useLoad(() => get<{ data: Prov[] }>("/api/admin/providers"));
  const [f, setF] = useState<F | null>(null);
  const [q, setQ] = useState("");
  const [newEp, setNewEp] = useState({ provider_id: "", upstream_model: "", priority: "100" });

  const open = (m?: Model) => setF(m ? {
    id: m.id, name: m.name, author: m.author, description: m.description, modality: m.modality, capabilities: m.capabilities.join(", "), categories: m.categories.join(", "),
    context_length: String(m.context_length), max_output: String(m.max_output), pin: usd(m.input_usd_micro), pout: usd(m.output_usd_micro), pcache: usd(m.cache_read_usd_micro), pimg: usd(m.image_usd_micro),
    open_weights: m.open_weights, in_plans: m.in_plans, enabled: m.enabled, released_at: m.released_at.slice(0, 10), isNew: false,
  } : { id: "", name: "", author: "", description: "", modality: "text", capabilities: "", categories: "", context_length: "131072", max_output: "8192", pin: "0", pout: "0", pcache: "0", pimg: "0", open_weights: false, in_plans: false, enabled: true, released_at: new Date().toISOString().slice(0, 10), isNew: true });

  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    if (!f) return;
    try {
      await put("/api/admin/models", {
        id: f.id, name: f.name, author: f.author, description: f.description, modality: f.modality, capabilities: list(f.capabilities), categories: list(f.categories),
        context_length: Number(f.context_length), max_output: Number(f.max_output), input_usd_micro: Math.round(Number(f.pin) * 1e6), output_usd_micro: Math.round(Number(f.pout) * 1e6),
        cache_read_usd_micro: Math.round(Number(f.pcache) * 1e6), image_usd_micro: Math.round(Number(f.pimg) * 1e6), open_weights: f.open_weights, in_plans: f.in_plans, enabled: f.enabled,
        released_at: new Date(f.released_at).toISOString(),
      });
      toast(t.common.saved); setF(null); reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); }
  };
  const saveEp = async (ep: Ep) => { try { await put("/api/admin/endpoints", ep); reload(); } catch (e) { toast((e as Error).message, true); } };
  const eps = (id: string) => data?.endpoints.filter((e) => e.model_id === id) ?? [];
  const shown = data?.data.filter((m) => !q || `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())) ?? [];

  return (
    <>
      <PageHead title={A.models} lead={data ? `${data.data.length}` : undefined} actions={<>
        <input className="input" style={{ width: 240 }} placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => open()}>+ {A.newModel}</button>
      </>} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{A.modelId}</th><th>{A.modality}</th><th className="r">{A.contextLength}</th><th className="r">$ in / out</th><th className="r">₽ in / out</th><th>{A.endpoints}</th><th>{t.common.status}</th></tr></thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className="clickable" onClick={() => open(m)} style={{ opacity: m.enabled ? 1 : 0.5 }}>
                <td><div>{m.name}</div><div className="mono hint">{m.id}</div></td>
                <td className="small">{m.modality}{m.in_plans && <span className="tag tag-signal" style={{ marginLeft: 6 }}>plan</span>}</td>
                <td className="r num">{ctx(m.context_length)}</td>
                <td className="r num small">{m.modality === "image" ? `$${usd(m.image_usd_micro)}` : `$${usd(m.input_usd_micro)} / $${usd(m.output_usd_micro)}`}</td>
                <td className="r num small">{m.modality === "image" ? perM(m.prices.image, lang) : `${perM(m.prices.input_per_m, lang)} / ${perM(m.prices.output_per_m, lang)}`}</td>
                <td className="mono small">{m.providers.join(", ") || <span className="bad">—</span>}</td>
                <td>{m.enabled ? <span className="tag tag-ok">on</span> : <span className="tag">off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal wide open={!!f} onClose={() => setF(null)} title={f?.isNew ? A.newModel : f?.id}
        footer={<>
          {f && !f.isNew && <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={async () => { if (await ask(`${t.common.delete} ${f.id}?`)) { try { await del(`/api/admin/models/${f.id}`); setF(null); reload(); } catch (e) { toast((e as Error).message, true); } } }}>{t.common.delete}</button>}
          <button className="btn btn-ghost" onClick={() => setF(null)}>{t.common.cancel}</button><button className="btn" onClick={save}>{t.common.save}</button>
        </>}>
        {f && (
          <>
            <div className="grid-3" style={{ gap: 12 }}>
              <label className="field"><span>{A.modelId}</span><input className="input mono" disabled={!f.isNew} value={f.id} placeholder="author/model" onChange={(e) => setF({ ...f, id: e.target.value })} /></label>
              <label className="field"><span>{t.common.name}</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="field"><span>{A.author}</span><input className="input" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></label>
            </div>
            <label className="field"><span>{t.presets.description}</span><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
            <div className="grid-3" style={{ gap: 12 }}>
              <label className="field"><span>{A.modality}</span><Select value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value as F["modality"] })}><option value="text">text</option><option value="image">image</option></Select></label>
              <label className="field"><span>{A.contextLength}</span><input className="input" type="number" value={f.context_length} onChange={(e) => setF({ ...f, context_length: e.target.value })} /></label>
              <label className="field"><span>{A.maxOutput}</span><input className="input" type="number" value={f.max_output} onChange={(e) => setF({ ...f, max_output: e.target.value })} /></label>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{A.priceIn}</span><input className="input" type="number" step="0.01" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} /></label>
              <label className="field"><span>{A.priceOut}</span><input className="input" type="number" step="0.01" value={f.pout} onChange={(e) => setF({ ...f, pout: e.target.value })} /></label>
              <label className="field"><span>{A.priceCache}</span><input className="input" type="number" step="0.01" value={f.pcache} onChange={(e) => setF({ ...f, pcache: e.target.value })} /></label>
              <label className="field"><span>{A.priceImage}</span><input className="input" type="number" step="0.001" value={f.pimg} onChange={(e) => setF({ ...f, pimg: e.target.value })} /></label>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{A.capabilities}</span><input className="input mono" value={f.capabilities} onChange={(e) => setF({ ...f, capabilities: e.target.value })} placeholder="vision, tools, reasoning" /></label>
              <label className="field"><span>{A.categories}</span><input className="input mono" value={f.categories} onChange={(e) => setF({ ...f, categories: e.target.value })} placeholder="coding, cheap" /></label>
            </div>
            <div className="row-wrap" style={{ ["--gap" as string]: "20px" }}>
              <label className="row small"><Switch checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />{t.common.enabled}</label>
              <label className="row small"><Switch checked={f.in_plans} onChange={(v) => setF({ ...f, in_plans: v })} />{A.inPlans}</label>
              <label className="row small"><Switch checked={f.open_weights} onChange={(v) => setF({ ...f, open_weights: v })} />{A.openWeights}</label>
              <label className="field" style={{ marginLeft: "auto" }}><span>{A.releasedAt}</span><input className="input" type="date" value={f.released_at} onChange={(e) => setF({ ...f, released_at: e.target.value })} /></label>
            </div>
            {!f.isNew && (
              <div className="stack" style={{ ["--gap" as string]: "10px" }}>
                <div className="label">{A.endpoints}</div>
                <table className="table"><tbody>
                  {eps(f.id).map((e) => (
                    <tr key={e.provider_id}>
                      <td className="mono small">{e.provider_id}</td>
                      <td><input className="input mono" style={{ height: 30 }} defaultValue={e.upstream_model} onBlur={(ev) => ev.target.value !== e.upstream_model && saveEp({ ...e, upstream_model: ev.target.value })} /></td>
                      <td style={{ width: 90 }}><input className="input" style={{ height: 30 }} type="number" defaultValue={e.priority} onBlur={(ev) => Number(ev.target.value) !== e.priority && saveEp({ ...e, priority: Number(ev.target.value) })} /></td>
                      <td><Switch checked={e.enabled} onChange={(v) => saveEp({ ...e, enabled: v })} /></td>
                      <td className="r"><button className="x-btn" onClick={async () => { await del(`/api/admin/endpoints?model_id=${encodeURIComponent(e.model_id)}&provider_id=${e.provider_id}`); reload(); }}>×</button></td>
                    </tr>
                  ))}
                </tbody></table>
                <div className="row" style={{ gap: 8 }}>
                  <Select value={newEp.provider_id} onChange={(e) => setNewEp({ ...newEp, provider_id: e.target.value })}>
                    <option value="">{A.provider}…</option>
                    {provs.data?.data.filter((p) => !eps(f.id).some((e) => e.provider_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <input className="input mono" placeholder={A.upstream} value={newEp.upstream_model} onChange={(e) => setNewEp({ ...newEp, upstream_model: e.target.value })} />
                  <input className="input" style={{ width: 90 }} type="number" value={newEp.priority} onChange={(e) => setNewEp({ ...newEp, priority: e.target.value })} />
                  <button className="btn btn-ghost" disabled={!newEp.provider_id} onClick={async () => { await saveEp({ model_id: f.id, provider_id: newEp.provider_id, upstream_model: newEp.upstream_model || f.id, priority: Number(newEp.priority), enabled: true }); setNewEp({ provider_id: "", upstream_model: "", priority: "100" }); }}>+</button>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
      {node}
    </>
  );
}
