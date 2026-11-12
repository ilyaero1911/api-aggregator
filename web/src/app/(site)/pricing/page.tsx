import Link from "next/link";
import { PlanGrid } from "@/components/plans";
import { kopecks } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { getDict } from "@/lib/i18n/server";
import { loadConfig, loadFx, loadPlans } from "@/lib/server-data";

export const metadata = { title: "Тарифы" };

export default async function Pricing() {
  const { t, lang } = await getDict();
  const [plans, fx, cfg] = await Promise.all([loadPlans(), loadFx(), loadConfig()]);
  const usd = fx.data.find((r) => r.currency === "USD");
  return (
    <div className="wrap" style={{ paddingTop: 48 }}>
      <header className="page-head">
        <div>
          <h1 className="h-display" style={{ fontSize: "clamp(40px, 6vw, 72px)" }}>{t.pricing.title}</h1>
          <p className="muted" style={{ marginTop: 14, maxWidth: 620 }}>{t.pricing.lead}</p>
        </div>
      </header>
      <PlanGrid plans={plans} />
      <section className="grid-2 section" style={{ marginTop: 56 }}>
        <div className="panel stack">
          <h2 className="h2">{t.pricing.payg}</h2>
          <p className="muted">{fmt(t.pricing.paygText, { min: kopecks(cfg.min_topup_kopecks, lang).replace(" ₽", "") })}</p>
          <div><Link href="/models" className="btn btn-ghost">{t.nav.models} →</Link></div>
        </div>
        <div className="panel stack">
          <h2 className="h2">{t.billing.rate}</h2>
          <div className="row-wrap" style={{ ["--gap" as string]: "28px" }}>
            {fx.data.map((r) => (
              <div key={r.currency}><div className="label">{r.currency}</div><div className="num" style={{ fontSize: 26 }}>{(r.rub_micro / 1e6).toFixed(2)} ₽</div></div>
            ))}
          </div>
          {usd && <p className="hint">{fmt(t.pricing.rateNote, { rate: (usd.rub_micro / 1e6).toFixed(2), source: usd.source, markup: fx.markup_bps / 100 })}</p>}
        </div>
      </section>
    </div>
  );
}
