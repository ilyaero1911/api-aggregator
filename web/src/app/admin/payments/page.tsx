"use client";

import { useEffect, useState } from "react";
import { PaymentActions, PayTag, UserLink, useL } from "@/components/admin-kit";
import { PageHead, Pager, Seg, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, get } from "@/lib/api";
import { dateTime, kopecks, num } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Payment } from "@/lib/types";

export default function Payments() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState(""), [qd, setQd] = useState("");
  const [off, setOff] = useState(0);
  useEffect(() => { const id = setTimeout(() => { setQd(q); setOff(0); }, 300); return () => clearTimeout(id); }, [q]);
  const { data, reload } = useLoad(() => get<{ data: Payment[]; totals: { status: string; n: number; kopecks: number }[] }>(`/api/admin/payments?status=${status}&q=${encodeURIComponent(qd)}&offset=${off}&limit=100`), [status, qd, off]);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); toast(L("Готово", "Done")); reload(); } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); } };
  const tot = (s: string) => data?.totals.find((x) => x.status === s);
  return (
    <>
      <PageHead title={L("Платежи", "Payments")} lead={L("Все пополнения и оплаты тарифов. Можно зачислить вручную, отменить или оформить возврат.", "All top-ups and plan payments. Mark paid, cancel or refund.")} />
      <div className="board board-sm" style={{ marginBottom: 24 }}>
        {(["succeeded", "pending", "failed", "canceled", "refunded"] as const).map((s) => (
          <div key={s}><span className="label">{s} · 30d</span><span className="v">{kopecks(tot(s)?.kopecks ?? 0, lang)}</span><span className="hint">{num(tot(s)?.n ?? 0, lang)} {L("шт.", "pcs")}</span></div>
        ))}
      </div>
      <div className="filters">
        <input className="input" style={{ minWidth: 260 }} placeholder={L("Email или ID платежа", "Email or payment ID")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg value={status} onChange={(v) => { setStatus(v); setOff(0); }} options={[{ value: "", label: L("Все", "All") }, ...["pending", "succeeded", "failed", "canceled", "refunded"].map((s) => ({ value: s, label: s }))]} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{L("Дата", "Date")}</th><th>{L("Пользователь", "User")}</th><th>{L("Назначение", "Purpose")}</th><th>{L("Провайдер", "Provider")}</th><th>ID</th><th>{L("Статус", "Status")}</th><th className="r">{L("Сумма", "Amount")}</th><th /></tr></thead>
          <tbody>
            {data?.data.map((p) => (
              <tr key={p.id}>
                <td className="small muted">{dateTime(p.created_at, lang)}</td>
                <td><UserLink id={p.user_id} email={p.email ?? ""} /></td>
                <td className="small">{p.purpose === "plan" ? `${L("тариф", "plan")} · ${p.plan_id}` : L("пополнение", "top-up")}</td>
                <td className="mono small">{p.provider}</td>
                <td className="mono small faint">{p.external_id}</td>
                <td><PayTag s={p.status} /></td>
                <td className="r num">{kopecks(p.amount_kopecks, lang)}</td>
                <td className="r"><PaymentActions p={p} act={act} ask={ask} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.data.length === 100 && <Pager offset={off} limit={100} total={off + 101} onChange={setOff} />}
      {node}
    </>
  );
}
