"use client";

import Link from "next/link";
import { useState } from "react";
import { Bars, Shares } from "@/components/charts";
import { Icon, type IconName } from "@/components/icons";
import { NewsBanner } from "@/components/news";
import { useSession } from "@/components/session";
import { PageHead, Seg, Skeleton, useLoad } from "@/components/ui";
import { get } from "@/lib/api";
import { compact, date, num, rub } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Stats, Subscription } from "@/lib/types";
import { Select } from "@/components/select";

type Range = "24h" | "7d" | "30d" | "all";

export default function Overview() {
  const { t, lang } = useI18n();
  const { user } = useSession();
  const D = t.dash;
  const [range, setRange] = useState<Range>("7d");
  const [model, setModel] = useState("");
  const { data, loading } = useLoad(() => get<Stats>(`/api/stats?range=${range}&model=${encodeURIComponent(model)}`), [range, model]);
  const bill = useLoad(() => get<{ subscription: Subscription | null }>("/api/billing"));
  const sub = bill.data?.subscription;
  const tot = data?.totals;
  const series = fill(data, range);
  const label = (b: string) => new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ru-RU", data?.bucket === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(new Date(b));

  return (
    <>
      <PageHead title={fmt(D.hello, { name: user.name || user.email.split("@")[0] })} lead={D.overviewLead}
        actions={<>
          <Select style={{ width: 220 }} value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">{D.allModels}</option>
            {data?.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Seg value={range} onChange={setRange} options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "all", label: t.common.all }]} />
        </>} />

      <NewsBanner />
      <div className="board">
        {[
          [D.cost, tot && rub(tot.cost_micro, lang), "wallet"],
          [D.apiRequests, tot && num(tot.requests, lang), "pulse"],
          [D.inputTokens, tot && compact(tot.prompt_tokens, lang), "send"],
          [D.outputTokens, tot && compact(tot.completion_tokens, lang), "chat"],
          [D.cachedTokens, tot && compact(tot.cached_tokens, lang), "refresh"],
          [D.errors, tot && num(tot.errors, lang), "close"],
        ].map(([l, v, ic]) => (
          <div key={l as string}><span className="label row" style={{ gap: 6 }}><Icon name={ic as IconName} size={15} />{l}</span>{loading || v === undefined ? <Skeleton h={28} w="60%" /> : <span className="v">{v}</span>}</div>
        ))}
      </div>

      {data && data.totals.requests === 0 ? (
        <section className="section" style={{ marginTop: 40 }}>
          <div className="panel stack">
            <h2 className="h2">{D.quickStart}</h2>
            <p className="muted">{D.noData}</p>
            <div className="qs">
              <Link href="/dashboard/keys"><Icon name="key" size={20} /><span>{D.quick1}</span><Icon name="arrow" size={16} /></Link>
              <Link href="/dashboard/billing"><Icon name="wallet" size={20} /><span>{D.quick2}</span><Icon name="arrow" size={16} /></Link>
              <Link href="/dashboard/playground"><Icon name="chat" size={20} /><span>{D.quick3}</span><Icon name="arrow" size={16} /></Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="dash-grid">
          <section className="panel">
            <div className="spread" style={{ marginBottom: 16 }}><h2 className="h3">{D.tokenUsage}</h2><Link className="small muted" href="/dashboard/logs">{D.goDeeper} →</Link></div>
            {data ? <Bars data={series} xLabel={(r) => label(r.bucket)} format={(v) => num(v, lang)}
              series={[{ key: "prompt_tokens", color: "var(--ink)", label: D.inputTokens }, { key: "completion_tokens", color: "var(--signal)", label: D.outputTokens }]} /> : <Skeleton h={180} />}
          </section>
          <section className="panel">
            <h2 className="h3" style={{ marginBottom: 16 }}>{D.spend}</h2>
            {data ? <Bars data={series} xLabel={(r) => label(r.bucket)} format={(v) => rub(v, lang)} series={[{ key: "cost_micro", color: "var(--ink)", label: D.cost }]} /> : <Skeleton h={180} />}
          </section>
          <section className="panel">
            <h2 className="h3" style={{ marginBottom: 16 }}>{D.topModels}</h2>
            {data && <Shares rows={data.top_models.map((m) => ({ label: m.model_id, value: m.cost_micro || m.tokens, sub: `${num(m.requests, lang)} ${t.common.requests} · ${compact(m.tokens, lang)} ${t.common.tokens}` }))}
              format={(v) => (data.top_models.some((m) => m.cost_micro > 0) ? rub(v, lang) : compact(v, lang))} />}
          </section>
          <section className="panel stack">
            <h2 className="h3">{D.plan}</h2>
            {sub ? (
              <>
                <div className="spread"><span className="h2">{lang === "en" ? sub.name_en : sub.name_ru}</span><span className="faint small">{fmt(D.until, { date: date(sub.ends_at, lang) })}</span></div>
                <div className="share-track"><div className="share-bar" style={{ width: `${Math.min(100, (sub.tokens_used / Math.max(1, sub.token_quota)) * 100)}%`, background: "var(--signal)" }} /></div>
                <div className="hint">{fmt(t.billing.planUsage, { used: num(sub.tokens_used, lang), quota: num(sub.token_quota, lang) })}</div>
              </>
            ) : <p className="muted">{t.billing.noPlan}</p>}
            <div><Link href="/dashboard/billing" className="btn btn-ghost btn-sm">{sub ? t.billing.changePlan : t.billing.choosePlan} →</Link></div>
          </section>
        </div>
      )}
    </>
  );
}

/** Дополняет ряд пустыми интервалами, чтобы на графике была вся шкала периода. */
function fill(data: Stats | null, range: Range): Stats["series"] {
  if (!data) return [];
  if (range === "all") return data.series;
  const hour = data.bucket === "hour";
  const n = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  const step = hour ? 3600_000 : 86400_000;
  const key = (d: Date) => (hour ? d.toISOString().slice(0, 13) : d.toLocaleDateString("sv-SE"));
  const have = new Map(data.series.map((s) => [key(new Date(s.bucket)), s]));
  const now = new Date();
  if (hour) now.setMinutes(0, 0, 0); else now.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() - (n - 1 - i) * step);
    return have.get(key(d)) ?? { bucket: d.toISOString(), prompt_tokens: 0, completion_tokens: 0, requests: 0, cost_micro: 0 };
  });
}
