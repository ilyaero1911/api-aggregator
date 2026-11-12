"use client";

import { useEffect, useState } from "react";
import { Bars } from "@/components/charts";
import { PageHead, Switch, useLoad, useToast } from "@/components/ui";
import { ApiError, get, put } from "@/lib/api";
import { date } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Set = Record<string, unknown>;

export default function AdminSettings() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { data } = useLoad(() => get<{ data: Set }>("/api/admin/settings"));
  const hist = useLoad(() => get<{ data: { on_date: string; rub_micro: number; source: string }[] }>("/api/admin/fx/history?currency=USD"));
  const [v, setV] = useState<Record<string, string>>({});
  const [reg, setReg] = useState(true);
  useEffect(() => {
    if (!data) return;
    const d = data.data;
    const n = (k: string) => Number(d[k] ?? 0);
    setV({ markup: String(n("markup_bps") / 100), bonus: String(n("signup_bonus_micro") / 1e6), fx: String(n("fx_fallback_usd_rub_micro") / 1e6), free: String(n("free_daily_requests")), min: String(n("min_topup_kopecks") / 100) });
    setReg(d.registration_open !== false);
  }, [data]);

  const save = async () => {
    try {
      await put("/api/admin/settings", {
        markup_bps: Math.round(Number(v.markup) * 100), signup_bonus_micro: Math.round(Number(v.bonus) * 1e6), fx_fallback_usd_rub_micro: Math.round(Number(v.fx) * 1e6),
        free_daily_requests: Number(v.free), min_topup_kopecks: Math.round(Number(v.min) * 100), registration_open: reg,
      });
      toast(t.common.saved);
    } catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); }
  };
  const field = (k: string, label: string) => <label className="field"><span>{label}</span><input className="input num" type="number" step="any" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  const series = [...(hist.data?.data ?? [])].reverse().map((r) => ({ d: r.on_date, rate: r.rub_micro / 1e6 }));

  return (
    <>
      <PageHead title={A.settings} actions={<button className="btn" onClick={save}>{t.common.save}</button>} />
      <div className="grid-2" style={{ alignItems: "start", gap: 40 }}>
        <section className="panel stack">
          {field("markup", A.markup)}
          {field("bonus", A.signupBonus)}
          {field("fx", A.fxFallback)}
          {field("free", A.freeDaily)}
          {field("min", A.minTopup)}
          <label className="row small"><Switch checked={reg} onChange={setReg} />{A.registrationOpen}</label>
        </section>
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 16 }}>{A.fxHistory}</h2>
          {series.length > 0 ? <Bars data={series} xLabel={(r) => date(r.d, lang)} format={(x) => `${x.toFixed(4)} ₽`} series={[{ key: "rate", color: "var(--ink)", label: "USD" }]} /> : <p className="hint">—</p>}
        </section>
      </div>
    </>
  );
}
