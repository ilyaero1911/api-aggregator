"use client";

import { useState } from "react";
import { Modal, PageHead, Switch, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, put } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { Select } from "@/components/select";

type P = { id: string; name: string; kind: "mock" | "openai_compatible"; base_url: string; enabled: boolean; priority: number; mock_latency_ms: number; mock_error_rate: number; has_key: boolean };

export default function Providers() {
  const { t } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { ask, node } = useConfirm();
  const { data, reload } = useLoad(() => get<{ data: P[] }>("/api/admin/providers"));
  const [f, setF] = useState<(P & { api_key: string; isNew: boolean }) | null>(null);
  const save = async (p: P & { api_key?: string }) => {
    try { await put("/api/admin/providers", { ...p, api_key: p.api_key ?? "" }); toast(t.common.saved); setF(null); reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); }
  };
  return (
    <>
      <PageHead title={A.providers} actions={<button className="btn" onClick={() => setF({ id: "", name: "", kind: "mock", base_url: "", enabled: true, priority: 100, mock_latency_ms: 50, mock_error_rate: 0, has_key: false, api_key: "", isNew: true })}>+ {A.newProvider}</button>} />
      <table className="table">
        <thead><tr><th>ID</th><th>{A.kind}</th><th>{A.baseUrl}</th><th className="r">{A.priority}</th><th className="r">{A.latency}</th><th className="r">{A.errorRate}</th><th>{A.apiKey}</th><th /></tr></thead>
        <tbody>
          {data?.data.map((p) => (
            <tr key={p.id}>
              <td><div>{p.name}</div><div className="mono hint">{p.id}</div></td>
              <td className="mono small">{p.kind}</td>
              <td className="mono small faint">{p.base_url || "—"}</td>
              <td className="r num">{p.priority}</td>
              <td className="r num">{p.kind === "mock" ? p.mock_latency_ms : "—"}</td>
              <td className="r num">{p.kind === "mock" ? `${p.mock_error_rate}%` : "—"}</td>
              <td>{p.has_key ? <span className="tag tag-ok">set</span> : <span className="faint small">—</span>}</td>
              <td className="r"><div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <Switch checked={p.enabled} onChange={(v) => save({ ...p, enabled: v })} />
                <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...p, api_key: "", isNew: false })}>{t.common.edit}</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 12 }}>openai_compatible — настоящий провайдер с OpenAI-совместимым API (OpenAI, DeepSeek, OpenRouter, Together и др.): укажите Base URL вида https://api.openai.com/v1 и API-ключ, затем добавьте маршрут к модели в разделе «Модели».</p>
      <Modal open={!!f} onClose={() => setF(null)} title={f?.isNew ? A.newProvider : f?.id}
        footer={<>
          {f && !f.isNew && <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={async () => { if (await ask(`${t.common.delete} ${f.id}?`)) { await del(`/api/admin/providers/${f.id}`); setF(null); reload(); } }}>{t.common.delete}</button>}
          <button className="btn btn-ghost" onClick={() => setF(null)}>{t.common.cancel}</button><button className="btn" onClick={() => f && save(f)}>{t.common.save}</button>
        </>}>
        {f && (
          <>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>ID</span><input className="input mono" disabled={!f.isNew} value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} /></label>
              <label className="field"><span>{t.common.name}</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="field"><span>{A.kind}</span><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as P["kind"] })}><option value="mock">mock</option><option value="openai_compatible">openai_compatible</option></Select></label>
              <label className="field"><span>{A.priority}</span><input className="input" type="number" value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} /></label>
            </div>
            {f.kind === "mock" ? (
              <div className="grid-2" style={{ gap: 12 }}>
                <label className="field"><span>{A.latency}</span><input className="input" type="number" value={f.mock_latency_ms} onChange={(e) => setF({ ...f, mock_latency_ms: Number(e.target.value) })} /></label>
                <label className="field"><span>{A.errorRate}</span><input className="input" type="number" min="0" max="100" value={f.mock_error_rate} onChange={(e) => setF({ ...f, mock_error_rate: Number(e.target.value) })} /></label>
              </div>
            ) : (
              <>
                <label className="field"><span>{A.baseUrl}</span><input className="input mono" value={f.base_url} placeholder="https://api.example.com/v1" onChange={(e) => setF({ ...f, base_url: e.target.value })} /></label>
                <label className="field"><span>{A.apiKey}</span><input className="input mono" type="password" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} /><span className="hint">{A.apiKeyKeep}</span></label>
              </>
            )}
          </>
        )}
      </Modal>
      {node}
    </>
  );
}
