"use client";

import { useEffect, useState } from "react";
import { SubTag, UserLink, useL } from "@/components/admin-kit";
import { Modal, PageHead, useLoad, useToast } from "@/components/ui";
import { ApiError, get, patch } from "@/lib/api";
import { date, num } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Plan } from "@/lib/types";
import { Select } from "@/components/select";

type Row = { id: string; user_id: string; plan_id: string; status: string; tokens_used: number; started_at: string; ends_at: string; email: string; name_ru: string; token_quota: number };

export default function Subscriptions() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const [status, setStatus] = useState("active");
  const [plan, setPlan] = useState("");
  const [q, setQ] = useState(""), [qd, setQd] = useState("");
  useEffect(() => { const id = setTimeout(() => setQd(q), 300); return () => clearTimeout(id); }, [q]);
  const { data, reload } = useLoad(() => get<{ data: Row[] }>(`/api/admin/subscriptions?status=${status}&plan=${plan}&q=${encodeURIComponent(qd)}`), [status, plan, qd]);
  const plans = useLoad(() => get<{ data: Plan[] }>("/api/admin/plans"));
  const [ed, setEd] = useState<{ id: string; plan_id: string; ends: string; tokens: string; status: string } | null>(null);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); toast(L("Сохранено", "Saved")); reload(); } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); } };
  return (
    <>
      <PageHead title={L("Подписки", "Subscriptions")} lead={L("Кто на каком тарифе, сколько токенов потратил и когда заканчивается. Можно продлить, сменить тариф, обнулить расход или отменить.", "Who is on which plan, usage and end dates. Extend, change plan, reset usage or cancel.")} />
      <div className="filters">
        <input className="input" placeholder="Email" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{L("Любой статус", "Any status")}</option><option value="active">active</option><option value="expired">expired</option><option value="canceled">canceled</option></Select>
        <Select value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">{L("Любой тариф", "Any plan")}</option>{plans.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {p.period_days}d</option>)}</Select>
      </div>
      <table className="table">
        <thead><tr><th>{L("Пользователь", "User")}</th><th>{L("Тариф", "Plan")}</th><th>{L("Статус", "Status")}</th><th>{L("Период", "Period")}</th><th style={{ width: 220 }}>{L("Расход токенов", "Token usage")}</th><th /></tr></thead>
        <tbody>
          {data?.data.map((s) => {
            const pct = s.token_quota ? Math.min(100, (s.tokens_used / s.token_quota) * 100) : 0;
            return (
              <tr key={s.id}>
                <td><UserLink id={s.user_id} email={s.email} /></td>
                <td>{s.name_ru} <span className="mono faint small">{s.plan_id}</span></td>
                <td><SubTag s={s.status} /></td>
                <td className="small muted">{date(s.started_at, lang)} → {date(s.ends_at, lang)}</td>
                <td><div className="share-track"><div className="share-bar" style={{ width: `${pct}%`, background: pct > 90 ? "var(--bad)" : undefined }} /></div><div className="hint mono">{num(s.tokens_used, lang)} / {num(s.token_quota, lang)}</div></td>
                <td className="r"><div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => act(() => patch(`/api/admin/subscriptions/${s.id}`, { extend_days: 30, status: "active" }))}>+30 {L("дн.", "d")}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEd({ id: s.id, plan_id: s.plan_id, ends: s.ends_at.slice(0, 10), tokens: String(s.tokens_used), status: s.status })}>{L("Изменить", "Edit")}</button>
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data && data.data.length === 0 && <div className="empty">—</div>}
      <Modal open={!!ed} onClose={() => setEd(null)} title={L("Подписка", "Subscription")}
        footer={<><button className="btn btn-ghost" onClick={() => setEd(null)}>{L("Отмена", "Cancel")}</button><button className="btn" onClick={() => ed && act(async () => { await patch(`/api/admin/subscriptions/${ed.id}`, { plan_id: ed.plan_id, ends_at: new Date(ed.ends + "T23:59:59").toISOString(), tokens_used: Number(ed.tokens), status: ed.status }); setEd(null); })}>{L("Сохранить", "Save")}</button></>}>
        {ed && (
          <div className="grid-2" style={{ gap: 12 }}>
            <label className="field"><span>{L("Тариф", "Plan")}</span><Select value={ed.plan_id} onChange={(e) => setEd({ ...ed, plan_id: e.target.value })}>{plans.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {p.period_days}d</option>)}</Select></label>
            <label className="field"><span>{L("Статус", "Status")}</span><Select value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}><option value="active">active</option><option value="expired">expired</option><option value="canceled">canceled</option></Select></label>
            <label className="field"><span>{L("Действует до", "Ends at")}</span><input className="input" type="date" value={ed.ends} onChange={(e) => setEd({ ...ed, ends: e.target.value })} /></label>
            <label className="field"><span>{L("Израсходовано токенов", "Tokens used")}</span><input className="input" type="number" value={ed.tokens} onChange={(e) => setEd({ ...ed, tokens: e.target.value })} /></label>
          </div>
        )}
      </Modal>
    </>
  );
}
