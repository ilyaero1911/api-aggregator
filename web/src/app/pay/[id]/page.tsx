"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { PayResult } from "@/components/pay-result";
import { get, post } from "@/lib/api";
import { date, kopecks } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Payment } from "@/lib/types";

/** Страница фиктивного эквайринга. Настоящий провайдер заменит её своей платёжной формой. */
export default function FakePay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useI18n();
  const P = t.pay;
  const [p, setP] = useState<Payment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<Payment>(`/api/payments/${id}`).then(setP).catch((e: Error) => setErr(e.message));
  }, [id]);
  const act = async (action: "pay" | "fail" | "cancel") => {
    setBusy(true);
    try { setP(await post<Payment>(`/api/payments/${id}/fake`, { action })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="pay-page">
      <div className="pay-card">
        <div className="spread"><Logo /><span className="tag tag-warn">TEST MODE</span></div>
        <div>
          <h1 className="h2">{P.title}</h1>
          <p className="muted small" style={{ marginTop: 6 }}>{P.lead}</p>
        </div>
        {err && <p className="error-text">{err}</p>}
        {p && (
          <>
            <dl className="pay-dl">
              <div><dt>{P.order}</dt><dd className="mono">{p.external_id}</dd></div>
              <div><dt>{p.purpose === "plan" ? P.purposePlan : P.purposeTopup}</dt><dd>{date(p.created_at, lang, true)}</dd></div>
              <div className="pay-total"><dt>{P.amount}</dt><dd className="num">{kopecks(p.amount_kopecks, lang)}</dd></div>
            </dl>
            {p.status === "pending" ? (
              <div className="stack" style={{ ["--gap" as string]: "8px" }}>
                <div className="fake-card mono"><span>4242 4242 4242 4242</span><span>12/34 · 123</span></div>
                <button className="btn btn-lg btn-signal" style={{ width: "100%" }} disabled={busy} onClick={() => act("pay")}>{P.pay} {kopecks(p.amount_kopecks, lang)}</button>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <button className="link-btn small" disabled={busy} onClick={() => act("fail")}>{P.fail}</button>
                  <button className="link-btn small" disabled={busy} onClick={() => act("cancel")}>{P.cancel}</button>
                </div>
              </div>
            ) : (
              <div className="stack">
                <PayResult status={p.status as "succeeded" | "failed" | "canceled"} title={p.status === "succeeded" ? P.done : p.status === "failed" ? P.failed : P.canceled}
                  sub={p.status === "succeeded" ? (lang === "en" ? "The money is already on your balance." : "Деньги уже на балансе.") : p.status === "failed" ? (lang === "en" ? "No money was charged. Try again or use another card." : "Деньги не списаны. Попробуйте ещё раз или другой картой.") : undefined} />
                <Link className="btn" href="/dashboard/billing" style={{ width: "100%" }}>{P.toBilling}</Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
