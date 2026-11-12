"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHead, useLoad, useToast } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { perM, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";

type Shot = { url: string; prompt: string; model: string };

function Images() {
  const { t, lang } = useI18n();
  const P = t.playground;
  const toast = useToast();
  const sp = useSearchParams();
  const { data } = useLoad(() => get<{ data: Model[] }>("/api/models"));
  const models = data?.data.filter((m) => m.modality === "image") ?? [];
  const [model, setModel] = useState(sp.get("model") ?? "");
  const [prompt, setPrompt] = useState("");
  const [n, setN] = useState(1);
  const [size, setSize] = useState("1024x1024");
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  useEffect(() => { if (!model && models.length) setModel(models[0].id); }, [models, model]);
  const cur = models.find((m) => m.id === model);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ data: { url: string }[]; usage: { cost: number } }>("/api/playground/image", { model, prompt, n, size });
      setShots((s) => [...r.data.map((d) => ({ url: d.url, prompt, model })), ...s]);
      toast(rub(r.usage.cost * 1e6, lang));
    } catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title={P.imagesTitle} lead={P.imagesLead} />
      <form onSubmit={go} className="img-form">
        <label className="field grow"><span>{P.prompt}</span><input className="input" value={prompt} placeholder={P.promptPh} onChange={(e) => setPrompt(e.target.value)} required /></label>
        <label className="field"><span>{P.model}</span><select className="select" value={model} onChange={(e) => setModel(e.target.value)}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="field" style={{ width: 90 }}><span>{P.count}</span><select className="select" value={n} onChange={(e) => setN(Number(e.target.value))}>{[1, 2, 3, 4].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field" style={{ width: 140 }}><span>{P.size}</span><select className="select" value={size} onChange={(e) => setSize(e.target.value)}>{["1024x1024", "1024x1536", "1536x1024"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <button className="btn btn-signal" disabled={busy || !prompt.trim()} style={{ alignSelf: "end" }}>{P.generate}</button>
      </form>
      {cur && <p className="hint mono" style={{ marginTop: 8 }}>{perM(cur.prices.image, lang)} / {t.models.perImage}</p>}
      <div className="img-grid">
        {busy && Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: "1" }} />)}
        {shots.map((s, i) => (
          <figure key={i} className="img-shot">
            <img src={s.url} alt={s.prompt} />
            <figcaption className="small"><span className="mclamp">{s.prompt}</span><span className="faint mono">{s.model}</span></figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

export default function Page() { return <Suspense><Images /></Suspense>; }
