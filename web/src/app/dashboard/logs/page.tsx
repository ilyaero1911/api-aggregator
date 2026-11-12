"use client";

import { useEffect, useState } from "react";
import { Drawer, PageHead, Pager, Seg, Skeleton, useLoad } from "@/components/ui";
import { get } from "@/lib/api";
import { ago, dateTime, ms, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { RequestLog } from "@/lib/types";
import { Select } from "@/components/select";

export default function Logs() {
  const { t, lang } = useI18n();
  const L = t.logs;
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [status, setStatus] = useState<"" | "ok" | "error">("");
  const [model, setModel] = useState("");
  const [off, setOff] = useState(0);
  const [open, setOpen] = useState<RequestLog | null>(null);
  useEffect(() => { const id = setTimeout(() => { setQd(q); setOff(0); }, 300); return () => clearTimeout(id); }, [q]);
  const qs = `q=${encodeURIComponent(qd)}&status=${status}&model=${encodeURIComponent(model)}`;
  const { data, loading, reload } = useLoad(() => get<{ data: RequestLog[]; total: number }>(`/api/logs?${qs}&limit=50&offset=${off}`), [qs, off]);
  const models = useLoad(() => get<{ models: string[] }>("/api/stats?range=all"));

  return (
    <>
      <PageHead title={L.title} lead={L.lead} actions={<>
        <button className="btn btn-ghost btn-sm" onClick={reload}>↻</button>
        <a className="btn btn-ghost btn-sm" href={`/api/logs/export?${qs}&format=csv`}>CSV</a>
        <a className="btn btn-ghost btn-sm" href={`/api/logs/export?${qs}&format=json`}>JSON</a>
      </>} />
      <div className="row-wrap" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder={L.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select style={{ width: 240 }} value={model} onChange={(e) => { setModel(e.target.value); setOff(0); }}>
          <option value="">{t.dash.allModels}</option>
          {models.data?.models.map((m) => <option key={m}>{m}</option>)}
        </Select>
        <Seg value={status} onChange={(v) => { setStatus(v); setOff(0); }} options={[{ value: "", label: L.all }, { value: "ok", label: L.ok }, { value: "error", label: L.errors }]} />
      </div>
      {loading && !data ? <Skeleton h={300} /> : data && data.data.length === 0 ? <div className="empty">{L.empty}</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{L.time}</th><th>{L.model}</th><th>{L.key}</th><th className="r">{L.tokens}</th><th className="r">{L.cost}</th><th className="r">{L.latency}</th><th>{L.status}</th></tr></thead>
            <tbody>
              {data?.data.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                  <td className="small muted" title={dateTime(r.created_at, lang)}>{ago(r.created_at, lang)}</td>
                  <td className="mono small">{r.model_id}{r.preset && <span className="faint"> @{r.preset}</span>}</td>
                  <td className="small muted">{r.key_name || (r.app === "playground" ? "playground" : "—")}</td>
                  <td className="r num">{num(r.prompt_tokens, lang)} → {num(r.completion_tokens, lang)}</td>
                  <td className="r num">{r.paid_by === "balance" ? rub(r.cost_micro, lang) : <span className="faint">{L.paid[r.paid_by]}</span>}</td>
                  <td className="r num">{ms(r.latency_ms)}</td>
                  <td><span className={`tag ${r.status < 400 ? "tag-ok" : "tag-bad"}`}>{r.status}</span>{r.cache_hit && <span className="tag tag-signal" style={{ marginLeft: 6 }}>{lang === "en" ? "cache" : "кэш"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager offset={off} limit={50} total={data.total} onChange={setOff} />}

      <Drawer open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <div style={{ padding: 24 }} className="stack">
            <div className="spread"><h2 className="h2">{L.detail}</h2><button className="x-btn" onClick={() => setOpen(null)}>×</button></div>
            <code className="mono small faint">gen-{open.id.replaceAll("-", "")}</code>
            <dl className="kv">
              {([
                [L.time, dateTime(open.created_at, lang)], [L.model, open.model_id], [L.provider, open.provider_id || "—"],
                [L.key, open.key_name || "—"], [L.app, open.app || "—"], [L.preset, open.preset || "—"],
                [L.status, String(open.status)], [L.tokens, `${num(open.prompt_tokens, lang)} + ${num(open.completion_tokens, lang)}`],
                [L.cost, rub(open.cost_micro, lang, { precise: true })], [L.paidBy, L.paid[open.paid_by]],
                [L.latency, ms(open.latency_ms)], [L.ttft, ms(open.ttft_ms)], [L.streamed, open.streamed ? t.common.yes : t.common.no],
                [L.finish, open.finish_reason || "—"],
              ] as [string, string][]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>)}
            </dl>
            {open.error && <p className="note" style={{ borderColor: "var(--bad)" }}>{open.error}</p>}
            <div className="stack" style={{ ["--gap" as string]: "8px" }}>
              <div className="label">{L.prompt}</div>
              {open.prompt_preview ? <div className="box box-tint small" style={{ whiteSpace: "pre-wrap" }}>{open.prompt_preview}</div> : <p className="hint">{L.promptOff}</p>}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
