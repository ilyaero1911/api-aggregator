"use client";

import { useState } from "react";
import { Modal, PageHead, Switch, useLoad, useToast } from "@/components/ui";
import { ApiError, get, put } from "@/lib/api";
import { kopecks, num } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Plan } from "@/lib/types";

type F = Omit<Plan, "features_ru" | "features_en"> & { features_ru: string; features_en: string; price: string; isNew: boolean };

export default function Plans() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { data, reload } = useLoad(() => get<{ data: Plan[] }>("/api/admin/plans"));
  const [f, setF] = useState<F | null>(null);
  const open = (p?: Plan) => setF(p ? { ...p, features_ru: p.features_ru.join("\n"), features_en: p.features_en.join("\n"), price: String(p.price_kopecks / 100), isNew: false }
    : { id: "", name_ru: "", name_en: "", description_ru: "", description_en: "", price_kopecks: 0, price: "0", period_days: 30, token_quota: 0, daily_free_requests: 0, concurrency: 1, features_ru: "", features_en: "", highlighted: false, sort: 100, active: true, isNew: true });
  const save = async () => {
    if (!f) return;
    const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    try {
      await put("/api/admin/plans", { ...f, price_kopecks: Math.round(Number(f.price) * 100), features_ru: lines(f.features_ru), features_en: lines(f.features_en) });
      toast(t.common.saved); setF(null); reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); }
  };
  const n = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement>) => f && setF({ ...f, [k]: Number(e.target.value) });
  const s = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => f && setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHead title={A.plans} actions={<button className="btn" onClick={() => open()}>+ {A.newPlan}</button>} />
      <table className="table">
        <thead><tr><th>ID</th><th>{t.common.name}</th><th className="r">{A.priceRub}</th><th className="r">{A.periodDays}</th><th className="r">{A.tokenQuota}</th><th className="r">{A.dailyFree}</th><th className="r">{A.concurrency}</th><th>{t.common.status}</th></tr></thead>
        <tbody>
          {data?.data.map((p) => (
            <tr key={p.id} className="clickable" onClick={() => open(p)} style={{ opacity: p.active ? 1 : 0.5 }}>
              <td className="mono small">{p.id}</td>
              <td>{lang === "en" ? p.name_en : p.name_ru}{p.highlighted && <span className="tag tag-signal" style={{ marginLeft: 6 }}>★</span>}</td>
              <td className="r num">{kopecks(p.price_kopecks, lang)}</td>
              <td className="r num">{p.period_days}</td>
              <td className="r num">{num(p.token_quota, lang)}</td>
              <td className="r num">{p.daily_free_requests}</td>
              <td className="r num">{p.concurrency}</td>
              <td>{p.active ? <span className="tag tag-ok">on</span> : <span className="tag">off</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal wide open={!!f} onClose={() => setF(null)} title={f?.isNew ? A.newPlan : f?.id}
        footer={<><button className="btn btn-ghost" onClick={() => setF(null)}>{t.common.cancel}</button><button className="btn" onClick={save}>{t.common.save}</button></>}>
        {f && (
          <>
            <div className="grid-3" style={{ gap: 12 }}>
              <label className="field"><span>ID</span><input className="input mono" disabled={!f.isNew} value={f.id} onChange={s("id")} /></label>
              <label className="field"><span>{A.nameRu}</span><input className="input" value={f.name_ru} onChange={s("name_ru")} /></label>
              <label className="field"><span>{A.nameEn}</span><input className="input" value={f.name_en} onChange={s("name_en")} /></label>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{A.descriptionRu}</span><input className="input" value={f.description_ru} onChange={s("description_ru")} /></label>
              <label className="field"><span>{A.descriptionEn}</span><input className="input" value={f.description_en} onChange={s("description_en")} /></label>
            </div>
            <div className="grid-3" style={{ gap: 12 }}>
              <label className="field"><span>{A.priceRub}</span><input className="input" type="number" value={f.price} onChange={s("price")} /></label>
              <label className="field"><span>{A.periodDays}</span><input className="input" type="number" value={f.period_days} onChange={n("period_days")} /></label>
              <label className="field"><span>{A.tokenQuota}</span><input className="input" type="number" value={f.token_quota} onChange={n("token_quota")} /></label>
              <label className="field"><span>{A.dailyFree}</span><input className="input" type="number" value={f.daily_free_requests} onChange={n("daily_free_requests")} /></label>
              <label className="field"><span>{A.concurrency}</span><input className="input" type="number" value={f.concurrency} onChange={n("concurrency")} /></label>
              <label className="field"><span>{A.sort}</span><input className="input" type="number" value={f.sort} onChange={n("sort")} /></label>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{A.featuresRu}</span><textarea className="textarea" rows={5} value={f.features_ru} onChange={s("features_ru")} /></label>
              <label className="field"><span>{A.featuresEn}</span><textarea className="textarea" rows={5} value={f.features_en} onChange={s("features_en")} /></label>
            </div>
            <div className="row" style={{ gap: 20 }}>
              <label className="row small"><Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} />{A.active}</label>
              <label className="row small"><Switch checked={f.highlighted} onChange={(v) => setF({ ...f, highlighted: v })} />{A.highlighted}</label>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
