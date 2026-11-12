"use client";

import Link from "next/link";
import { useState } from "react";
import { kopecks } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Plan } from "@/lib/types";
import { Seg } from "./ui";

/** Сетка тарифов с переключателем периода. onChoose — для кабинета; без него ведём на регистрацию. */
export function PlanGrid({ plans, currentId, onChoose, busy }: {
  plans: Plan[]; currentId?: string | null; onChoose?: (p: Plan) => void; busy?: string | null;
}) {
  const { t, lang } = useI18n();
  const periods = Array.from(new Set(plans.filter((p) => p.price_kopecks > 0).map((p) => p.period_days))).sort((a, b) => a - b);
  const [period, setPeriod] = useState<number>(periods[0] ?? 30);
  const free = plans.filter((p) => p.price_kopecks === 0);
  const paid = plans.filter((p) => p.price_kopecks > 0 && p.period_days === period);
  const shown = [...free, ...paid];
  const label = (d: number) => (d === 14 ? t.pricing.weeks2 : d === 30 ? t.pricing.month : `${d}`);

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      {periods.length > 1 && (
        <Seg value={String(period)} options={periods.map((d) => ({ value: String(d), label: label(d) }))} onChange={(v) => setPeriod(Number(v))} />
      )}
      <div className="plans">
        {shown.map((p) => {
          const name = lang === "en" ? p.name_en : p.name_ru;
          const desc = lang === "en" ? p.description_en : p.description_ru;
          const feats = lang === "en" ? p.features_en : p.features_ru;
          const current = currentId === p.id;
          return (
            <article key={p.id} className={`plan${p.highlighted ? " plan-hot" : ""}`}>
              <div className="spread">
                <h3 className="h2">{name}</h3>
                {p.highlighted && <span className="tag tag-signal">{t.pricing.popular}</span>}
              </div>
              <div className="plan-price">
                {p.price_kopecks === 0 ? <span className="num">{t.common.free}</span> : (
                  <><span className="num">{kopecks(p.price_kopecks, lang)}</span><span className="faint"> {fmt(t.pricing.period, { n: p.period_days })}</span></>
                )}
              </div>
              <p className="muted small">{desc}</p>
              <ul className="plan-feats">
                {feats.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <div style={{ marginTop: "auto" }}>
                {onChoose ? (
                  <button className={`btn ${p.highlighted ? "btn-signal" : "btn-ghost"}`} style={{ width: "100%" }}
                    disabled={current || busy === p.id || p.price_kopecks === 0} onClick={() => onChoose(p)}>
                    {current ? t.pricing.current : p.price_kopecks === 0 ? t.common.free : t.pricing.choose}
                  </button>
                ) : (
                  <Link className={`btn ${p.highlighted ? "btn-signal" : "btn-ghost"}`} style={{ width: "100%" }} href="/register">
                    {p.price_kopecks === 0 ? t.pricing.starter : t.pricing.choose}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
