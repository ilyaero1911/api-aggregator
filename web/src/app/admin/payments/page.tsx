"use client";

import { useState } from "react";
import { PageHead, Pager, Seg, useConfirm, useLoad, useToast } from "@/components/ui";
import { get, post } from "@/lib/api";
import { date, kopecks } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Payment } from "@/lib/types";

export default function Payments() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [status, setStatus] = useState("");
  const [off, setOff] = useState(0);
  const { data, reload } = useLoad(() => get<{ data: Payment[] }>(`/api/admin/payments?status=${status}&offset=${off}&limit=50`), [status, off]);
  return (
    <>
      <PageHead title={A.payments} actions={<Seg value={status} onChange={(v) => { setStatus(v); setOff(0); }} options={[{ value: "", label: t.common.all }, ...(["pending", "succeeded", "failed", "canceled"] as const).map((s) => ({ value: s, label: t.billing.payStatus[s] }))]} />} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t.billing.date}</th><th>{A.user}</th><th>{A.purpose}</th><th>{A.provider}</th><th>ID</th><th>{t.common.status}</th><th className="r">{t.billing.sum}</th><th /></tr></thead>
          <tbody>
            {data?.data.map((p) => (
              <tr key={p.id}>
                <td className="small muted">{date(p.created_at, lang, true)}</td>
                <td className="small">{p.email}</td>
                <td className="small">{p.purpose === "plan" ? `${t.pay.purposePlan} · ${p.plan_id}` : t.pay.purposeTopup}</td>
                <td className="mono small">{p.provider}</td>
                <td className="mono small faint">{p.external_id}</td>
                <td><span className={`tag ${p.status === "succeeded" ? "tag-ok" : p.status === "pending" ? "tag-warn" : "tag-bad"}`}>{t.billing.payStatus[p.status]}</span></td>
                <td className="r num">{kopecks(p.amount_kopecks, lang)}</td>
                <td className="r">{p.status === "pending" && <button className="btn btn-ghost btn-sm" onClick={async () => { if (await ask(`${A.complete}: ${kopecks(p.amount_kopecks, lang)}?`, false)) { await post(`/api/admin/payments/${p.id}/complete`); toast(t.common.saved); reload(); } }}>{A.complete}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.data.length === 50 && <Pager offset={off} limit={50} total={off + 51} onChange={setOff} />}
      {node}
    </>
  );
}
