"use client";

import { useEffect, useState } from "react";
import { PlanGrid } from "@/components/plans";
import { Modal, PageHead, Pager, Skeleton, Switch, useLoad, useToast } from "@/components/ui";
import { ApiError, get, patch, post } from "@/lib/api";
import { amount as inCur, date, inputToRub, kopecks, microToInput, num, rub } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Payment, Plan, Subscription, Transaction, Wallet } from "@/lib/types";

type Billing = { wallet: Wallet; subscription: Subscription | null; payments: Payment[]; usd_rub_micro: number; min_topup_kopecks: number };

export default function BillingPage() {
  const { t, lang } = useI18n();
  const B = t.billing;
  const toast = useToast();
  const { data, reload } = useLoad(() => get<Billing>("/api/billing"));
  const plans = useLoad(() => get<{ data: Plan[] }>("/api/plans"));
  const [off, setOff] = useState(0);
  const txs = useLoad(() => get<{ data: Transaction[]; total: number }>(`/api/billing/transactions?limit=20&offset=${off}`), [off, data]);
  const [topup, setTopup] = useState(false);
  const [amount, setAmount] = useState(lang === "en" ? "10" : "500");
  const [promo, setPromo] = useState("");
  const [buy, setBuy] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [ws, setWs] = useState<Wallet | null>(null);
  useEffect(() => { if (data) setWs(data.wallet); }, [data]);

  const fail = (e: unknown) => toast(e instanceof ApiError ? (e.code === "insufficient_balance" ? B.insufficient : e.message) : t.common.error, true);

  async function startTopup() {
    setBusy(true);
    try { const p = await post<Payment>("/api/billing/topup", { amount_rub: Math.round(inputToRub(Number(amount), lang) * 100) / 100 }); location.href = p.confirmation_url; } catch (e) { fail(e); setBusy(false); }
  }
  async function subscribe(method: "balance" | "payment") {
    if (!buy) return;
    setBusy(true);
    try {
      const r = await post<{ subscription?: Subscription; confirmation_url?: string }>("/api/billing/subscribe", { plan_id: buy.id, method });
      if (r.confirmation_url) { location.href = r.confirmation_url; return; }
      toast(B.subscribed); setBuy(null); reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function redeem() {
    try { const r = await post<{ amount_micro: number }>("/api/billing/promo", { code: promo }); toast(fmt(B.promoOk, { n: rub(r.amount_micro, lang) })); setPromo(""); reload(); } catch (e) { fail(e); }
  }
  async function saveWallet(next: Wallet) {
    setWs(next);
    try {
      await patch("/api/billing/settings", { low_balance_alert: next.low_balance_alert, low_balance_rub: next.low_balance_micro / 1e6, auto_topup: next.auto_topup, auto_topup_below_rub: next.auto_topup_below_micro / 1e6, auto_topup_amount_rub: next.auto_topup_amount_micro / 1e6 });
    } catch (e) { fail(e); }
  }

  const sub = data?.subscription;
  const minMicro = (data?.min_topup_kopecks ?? 10000) * 10_000;
  const min = Math.ceil(inCur(minMicro, lang) * 100) / 100;
  const low = ws && ws.low_balance_alert && data && data.wallet.balance_micro < ws.low_balance_micro;

  return (
    <>
      <PageHead title={B.title} lead={B.lead} />
      <div className="bill-top">
        <section className="bill-balance">
          <div className="label">{B.balance}</div>
          {data ? <div className={`bill-amount num ${data.wallet.balance_micro < 0 ? "bad" : ""}`}>{rub(data.wallet.balance_micro, lang)}</div> : <Skeleton h={56} w={240} />}
          {low && <p className="note" style={{ borderColor: "var(--warn)" }}>{B.lowAlert}: {rub(ws!.low_balance_micro, lang)}</p>}
          <div className="row-wrap">
            <button className="btn btn-signal" onClick={() => setTopup(true)}>+ {B.topup}</button>
            <div className="row" style={{ gap: 6 }}>
              <input className="input mono" style={{ width: 160, textTransform: "uppercase" }} placeholder={B.promo} value={promo} onChange={(e) => setPromo(e.target.value)} />
              <button className="btn btn-ghost" disabled={!promo.trim()} onClick={redeem}>{B.promoApply}</button>
            </div>
          </div>
          {data && <p className="hint">{B.rate}: {(data.usd_rub_micro / 1e6).toFixed(2)} ₽ · {lang === "en" ? "Bank of Russia" : "ЦБ РФ"}</p>}
          <a href="/pricing#how" className="small muted" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{lang === "en" ? "How is the price calculated?" : "Как считается цена за токены?"}</a>
        </section>
        <section className="bill-settings">
          {ws && (
            <>
              <div className="bill-set">
                <div className="spread"><div><div className="h3">{B.lowAlert}</div><p className="hint">{B.lowAlertText}</p></div><Switch checked={ws.low_balance_alert} onChange={(v) => saveWallet({ ...ws, low_balance_alert: v })} /></div>
                {ws.low_balance_alert && (
                  <label className="field"><span>{B.threshold}</span><input className="input" type="number" min="0" defaultValue={microToInput(ws.low_balance_micro, lang)} onBlur={(e) => saveWallet({ ...ws, low_balance_micro: inputToRub(Number(e.target.value), lang) * 1e6 })} /></label>
                )}
              </div>
              <div className="bill-set">
                <div className="spread"><div><div className="h3">{B.autoTopup}</div><p className="hint">{B.autoTopupText}</p></div><Switch checked={ws.auto_topup} onChange={(v) => saveWallet({ ...ws, auto_topup: v })} /></div>
                {ws.auto_topup && (
                  <div className="grid-2" style={{ gap: 12 }}>
                    <label className="field"><span>{B.below}</span><input className="input" type="number" defaultValue={microToInput(ws.auto_topup_below_micro, lang)} onBlur={(e) => saveWallet({ ...ws, auto_topup_below_micro: inputToRub(Number(e.target.value), lang) * 1e6 })} /></label>
                    <label className="field"><span>{B.topupAmount}</span><input className="input" type="number" defaultValue={microToInput(ws.auto_topup_amount_micro, lang)} onBlur={(e) => saveWallet({ ...ws, auto_topup_amount_micro: inputToRub(Number(e.target.value), lang) * 1e6 })} /></label>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="section" style={{ marginTop: 56 }}>
        <div className="spread" style={{ marginBottom: 16, alignItems: "flex-end" }}>
          <div><h2 className="h2">{B.plan}</h2>
            <p className="muted small" style={{ marginTop: 6 }}>
              {sub ? <>{fmt(B.planActive, { name: lang === "en" ? sub.name_en : sub.name_ru, date: date(sub.ends_at, lang) })} · {fmt(B.planUsage, { used: num(sub.tokens_used, lang), quota: num(sub.token_quota, lang) })}</> : B.noPlan}
            </p>
          </div>
        </div>
        {plans.data && <PlanGrid plans={plans.data.data} currentId={sub?.plan_id} onChoose={setBuy} busy={busy ? buy?.id : null} />}
      </section>

      <section className="section" style={{ marginTop: 56 }}>
        <h2 className="h2" style={{ marginBottom: 16 }}>{B.history}</h2>
        {txs.data && txs.data.data.length === 0 ? <div className="empty">—</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{B.date}</th><th>{B.type}</th><th>{t.common.details}</th><th className="r">{B.sum}</th><th className="r">{B.after}</th></tr></thead>
              <tbody>
                {txs.data?.data.map((x) => (
                  <tr key={x.id}>
                    <td className="small muted">{date(x.created_at, lang, true)}</td>
                    <td><span className={`tag ${x.amount_micro > 0 ? "tag-ok" : ""}`}>{B.kinds[x.kind] ?? x.kind}</span></td>
                    <td className="small">{x.description}</td>
                    <td className={`r num ${x.amount_micro > 0 ? "ok" : ""}`}>{x.amount_micro > 0 ? "+" : ""}{rub(x.amount_micro, lang)}</td>
                    <td className="r num muted">{rub(x.balance_after_micro, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {txs.data && <Pager offset={off} limit={20} total={txs.data.total} onChange={setOff} />}
      </section>

      {data && data.payments.length > 0 && (
        <section className="section" style={{ marginTop: 40 }}>
          <h2 className="h2" style={{ marginBottom: 16 }}>{B.payments}</h2>
          <table className="table">
            <tbody>
              {data.payments.slice(0, 10).map((p) => (
                <tr key={p.id}>
                  <td className="small muted">{date(p.created_at, lang, true)}</td>
                  <td className="mono small">{p.external_id}</td>
                  <td className="small">{p.purpose === "plan" ? t.pay.purposePlan : t.pay.purposeTopup}</td>
                  <td><span className={`tag ${p.status === "succeeded" ? "tag-ok" : p.status === "pending" ? "tag-warn" : "tag-bad"}`}>{B.payStatus[p.status]}</span></td>
                  <td className="r num">{kopecks(p.amount_kopecks, lang)}</td>
                  <td className="r">{p.status === "pending" && <a className="btn btn-ghost btn-sm" href={p.confirmation_url}>{B.pay}</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Modal open={topup} onClose={() => setTopup(false)} title={B.topupTitle}
        footer={<><button className="btn btn-ghost" onClick={() => setTopup(false)}>{t.common.cancel}</button><button className="btn btn-signal" disabled={busy || Number(amount) < min} onClick={startTopup}>{B.pay} →</button></>}>
        <label className="field"><span>{B.amount}</span><input className="input num" type="number" min={min} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /><span className="hint">{fmt(B.min, { n: rub(minMicro, lang) })}{lang === "en" && ` · ≈ ${rub(inputToRub(Number(amount), lang) * 1e6, "ru")}`}</span></label>
        <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
          {(lang === "en" ? [5, 10, 20, 50, 100] : [300, 500, 1000, 3000, 5000]).map((v) => <button key={v} className={`chip${amount === String(v) ? " on" : ""}`} onClick={() => setAmount(String(v))}>{lang === "en" ? `$${v}` : `${num(v, lang)} ₽`}</button>)}
        </div>
      </Modal>

      <Modal open={!!buy} onClose={() => setBuy(null)} title={buy ? (lang === "en" ? buy.name_en : buy.name_ru) : ""}
        footer={<>
          <button className="btn btn-ghost" disabled={busy} onClick={() => subscribe("balance")}>{B.payFromBalance}</button>
          <button className="btn btn-signal" disabled={busy} onClick={() => subscribe("payment")}>{B.payByCard} →</button>
        </>}>
        {buy && (
          <>
            <div className="num" style={{ fontSize: 34 }}>{kopecks(buy.price_kopecks, lang)}<span className="faint small"> {fmt(t.pricing.period, { n: buy.period_days })}</span></div>
            <p className="muted">{lang === "en" ? buy.description_en : buy.description_ru}</p>
            {sub && <p className="note">{fmt(B.planActive, { name: lang === "en" ? sub.name_en : sub.name_ru, date: date(sub.ends_at, lang) })}</p>}
            {data && <p className="hint">{B.balance}: {rub(data.wallet.balance_micro, lang)}</p>}
          </>
        )}
      </Modal>
    </>
  );
}
