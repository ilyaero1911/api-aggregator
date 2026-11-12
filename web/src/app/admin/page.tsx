"use client";

import { Bars, Shares } from "@/components/charts";
import { PageHead, Skeleton, useLoad, useToast } from "@/components/ui";
import { get, post } from "@/lib/api";
import { compact, date, kopecks, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { FxRate } from "@/lib/types";

type S = {
  stats: { users: number; users_today: number; requests_today: number; revenue_today_micro: number; revenue_month_micro: number; payments_month_kopecks: number; active_subscriptions: number; errors_today: number };
  daily: { bucket: string; requests: number; cost_micro: number; users: number }[];
  top_models: { model_id: string; tokens: number; requests: number }[];
  fx: FxRate[];
};

export default function AdminOverview() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { data, reload } = useLoad(() => get<S>("/api/admin/stats"));
  const s = data?.stats;
  const refresh = async () => {
    const r = await post<{ error?: string }>("/api/admin/fx/refresh");
    toast(r.error ?? t.common.saved, !!r.error);
    reload();
  };
  return (
    <>
      <PageHead title={A.overview} />
      <div className="board">
        {([
          [A.usersTotal, s && num(s.users, lang)], [A.usersToday, s && num(s.users_today, lang)],
          [A.requestsToday, s && num(s.requests_today, lang)], [A.errorsToday, s && num(s.errors_today, lang)],
          [A.revenueToday, s && rub(s.revenue_today_micro, lang)], [A.revenueMonth, s && rub(s.revenue_month_micro, lang)],
          [A.paymentsMonth, s && kopecks(s.payments_month_kopecks, lang)], [A.activeSubs, s && num(s.active_subscriptions, lang)],
        ] as [string, string | undefined][]).map(([l, v]) => <div key={l}><span className="label">{l}</span>{v === undefined ? <Skeleton h={28} /> : <span className="v">{v}</span>}</div>)}
      </div>
      <div className="dash-grid">
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 16 }}>{A.daily}</h2>
          {data && <Bars data={data.daily} xLabel={(r) => date(r.bucket, lang)} format={(v) => num(v, lang)} series={[{ key: "requests", color: "var(--ink)", label: A.requests }]} />}
        </section>
        <section className="panel">
          <div className="spread" style={{ marginBottom: 16 }}><h2 className="h3">{A.fx}</h2><button className="btn btn-ghost btn-sm" onClick={refresh}>{A.refreshFx}</button></div>
          <table className="table"><tbody>
            {data?.fx.map((r) => (
              <tr key={r.currency}><td className="mono">{r.currency}</td><td className="r num">{(r.rub_micro / 1e6).toFixed(4)} ₽</td><td className="small muted">{r.source}</td><td className="small muted">{date(r.fetched_at, lang, true)}</td><td>{r.stale && <span className="tag tag-warn">{A.stale}</span>}</td></tr>
            ))}
          </tbody></table>
        </section>
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 16 }}>{A.models} · 7d</h2>
          {data && <Shares rows={data.top_models.map((m) => ({ label: m.model_id, value: m.tokens, sub: `${num(m.requests, lang)} ${t.common.requests}` }))} format={(v) => compact(v, lang)} />}
        </section>
      </div>
    </>
  );
}
