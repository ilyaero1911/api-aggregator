"use client";

import { useEffect, useState } from "react";
import { UserLink, useL } from "@/components/admin-kit";
import { PageHead, Pager, useLoad } from "@/components/ui";
import { get } from "@/lib/api";
import { dateTime, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Transaction } from "@/lib/types";

export default function Ledger() {
  const { lang, t } = useI18n();
  const L = useL();
  const [kind, setKind] = useState("");
  const [q, setQ] = useState(""), [qd, setQd] = useState("");
  const [off, setOff] = useState(0);
  useEffect(() => { const id = setTimeout(() => { setQd(q); setOff(0); }, 300); return () => clearTimeout(id); }, [q]);
  const { data } = useLoad(() => get<{ data: (Transaction & { user_id: string; email: string })[] }>(`/api/admin/transactions?kind=${kind}&q=${encodeURIComponent(qd)}&offset=${off}&limit=100`), [kind, qd, off]);
  return (
    <>
      <PageHead title={L("Операции по балансу", "Balance ledger")} lead={L("Каждое движение денег: пополнения, списания за запросы, тарифы, бонусы, промокоды, возвраты и ручные корректировки.", "Every money movement: top-ups, request charges, plans, bonuses, promo codes, refunds and manual adjustments.")} />
      <div className="filters">
        <input className="input" style={{ minWidth: 260 }} placeholder={L("Email или описание", "Email or description")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={kind} onChange={(e) => { setKind(e.target.value); setOff(0); }}>
          <option value="">{L("Все типы", "All types")}</option>
          {Object.entries(t.billing.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <table className="table">
        <thead><tr><th>{L("Дата", "Date")}</th><th>{L("Пользователь", "User")}</th><th>{L("Тип", "Type")}</th><th>{L("Описание", "Description")}</th><th className="r">{L("Сумма", "Amount")}</th><th className="r">{L("Баланс после", "Balance after")}</th></tr></thead>
        <tbody>
          {data?.data.map((x) => (
            <tr key={x.id}>
              <td className="small muted">{dateTime(x.created_at, lang)}</td>
              <td><UserLink id={x.user_id} email={x.email} /></td>
              <td><span className="tag">{t.billing.kinds[x.kind] ?? x.kind}</span></td>
              <td className="small">{x.description}</td>
              <td className={`r num ${x.amount_micro > 0 ? "ok" : ""}`}>{rub(x.amount_micro, lang, { precise: Math.abs(x.amount_micro) < 1e6 })}</td>
              <td className="r num muted">{rub(x.balance_after_micro, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.data.length === 100 && <Pager offset={off} limit={100} total={off + 101} onChange={setOff} />}
    </>
  );
}
