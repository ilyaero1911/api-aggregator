"use client";

import { useEffect, useState } from "react";
import { Drawer, Modal, PageHead, Pager, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { ago, date, kopecks, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Key, Payment, Plan, Subscription, Transaction, User, Wallet } from "@/lib/types";

type Row = User & { balance_micro: number; plan_id: string };
type Detail = { user: User; wallet: Wallet; transactions: Transaction[]; subscriptions: Subscription[]; keys: Key[]; payments: Payment[]; usage: { requests: number; cost_micro: number; prompt_tokens: number; completion_tokens: number } };

export default function Users() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [off, setOff] = useState(0);
  useEffect(() => { const id = setTimeout(() => { setQd(q); setOff(0); }, 300); return () => clearTimeout(id); }, [q]);
  const list = useLoad(() => get<{ data: Row[]; total: number }>(`/api/admin/users?q=${encodeURIComponent(qd)}&offset=${off}&limit=50`), [qd, off]);
  const plans = useLoad(() => get<{ data: Plan[] }>("/api/admin/plans"));
  const [sel, setSel] = useState<string | null>(null);
  const det = useLoad(() => (sel ? get<Detail>(`/api/admin/users/${sel}`) : Promise.resolve(null)), [sel]);
  const [adj, setAdj] = useState<{ amount: string; reason: string } | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); toast(t.common.saved); det.reload(); list.reload(); } catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); }
  };
  const d = det.data;

  return (
    <>
      <PageHead title={A.users} lead={list.data ? `${num(list.data.total, lang)}` : undefined}
        actions={<input className="input" style={{ width: 280 }} placeholder={`${A.email}…`} value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{A.email}</th><th>{A.role}</th><th>{A.plan}</th><th className="r">{A.balance}</th><th>{A.registered}</th><th>{A.lastLogin}</th></tr></thead>
          <tbody>
            {list.data?.data.map((u) => (
              <tr key={u.id} className="clickable" onClick={() => setSel(u.id)} style={{ opacity: u.status === "blocked" ? 0.5 : 1 }}>
                <td><div>{u.email}</div><div className="hint">{u.name}{u.has_google ? " · Google" : ""}</div></td>
                <td>{u.role === "admin" ? <span className="tag tag-ink">admin</span> : <span className="faint small">user</span>}{u.status === "blocked" && <span className="tag tag-bad" style={{ marginLeft: 6 }}>blocked</span>}</td>
                <td className="mono small">{u.plan_id || "—"}</td>
                <td className="r num">{rub(u.balance_micro, lang)}</td>
                <td className="small muted">{date(u.created_at, lang)}</td>
                <td className="small muted">{ago(u.last_login_at, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager offset={off} limit={50} total={list.data.total} onChange={setOff} />}

      <Drawer open={!!sel} onClose={() => setSel(null)}>
        {d && (
          <div style={{ padding: 24 }} className="stack">
            <div className="spread"><div><h2 className="h2">{d.user.email}</h2><p className="hint">{d.user.name} · {d.user.id}</p></div><button className="x-btn" onClick={() => setSel(null)}>×</button></div>
            <div className="board">
              <div><span className="label">{A.balance}</span><span className="v" style={{ fontSize: 22 }}>{rub(d.wallet.balance_micro, lang)}</span></div>
              <div><span className="label">{A.requests}</span><span className="v" style={{ fontSize: 22 }}>{num(d.usage.requests, lang)}</span></div>
              <div><span className="label">{t.dash.cost}</span><span className="v" style={{ fontSize: 22 }}>{rub(d.usage.cost_micro, lang)}</span></div>
            </div>
            <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
              <button className="btn btn-sm" onClick={() => setAdj({ amount: "", reason: "" })}>{A.adjust}</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => (await ask(d.user.status === "active" ? A.block + "?" : A.unblock + "?")) && act(() => post(`/api/admin/users/${d.user.id}/status`, { status: d.user.status === "active" ? "blocked" : "active" }))}>{d.user.status === "active" ? A.block : A.unblock}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => act(() => post(`/api/admin/users/${d.user.id}/role`, { role: d.user.role === "admin" ? "user" : "admin" }))}>{d.user.role === "admin" ? A.makeUser : A.makeAdmin}</button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <select className="select" id="grant" defaultValue="">{[<option key="" value="">{A.cancelPlan}</option>, ...(plans.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {p.period_days}d</option>) ?? [])]}</select>
              <button className="btn btn-ghost btn-sm" onClick={() => act(() => post(`/api/admin/users/${d.user.id}/plan`, { plan_id: (document.getElementById("grant") as HTMLSelectElement).value }))}>{A.grantPlan}</button>
            </div>
            <div className="label">{A.plan}</div>
            {d.subscriptions.length === 0 ? <p className="hint">—</p> : (
              <table className="table"><tbody>{d.subscriptions.map((s) => <tr key={s.id}><td>{s.name_ru}</td><td><span className={`tag ${s.status === "active" ? "tag-ok" : ""}`}>{s.status}</span></td><td className="small muted">{date(s.started_at, lang)} → {date(s.ends_at, lang)}</td><td className="r num small">{num(s.tokens_used, lang)}</td></tr>)}</tbody></table>
            )}
            <div className="label">{t.nav.keys}</div>
            {d.keys.length === 0 ? <p className="hint">—</p> : (
              <table className="table"><tbody>{d.keys.map((k) => <tr key={k.id}><td>{k.name}</td><td className="mono small">{k.prefix}</td><td className="r num">{rub(k.total_spent_micro, lang)}</td></tr>)}</tbody></table>
            )}
            <div className="label">{A.payments}</div>
            {d.payments.length === 0 ? <p className="hint">—</p> : (
              <table className="table"><tbody>{d.payments.map((p) => <tr key={p.id}><td className="small muted">{date(p.created_at, lang, true)}</td><td>{p.purpose}</td><td><span className="tag">{p.status}</span></td><td className="r num">{kopecks(p.amount_kopecks, lang)}</td></tr>)}</tbody></table>
            )}
            <div className="label">{t.billing.history}</div>
            <table className="table"><tbody>{d.transactions.map((x) => <tr key={x.id}><td className="small muted">{date(x.created_at, lang, true)}</td><td className="small">{x.description}</td><td className={`r num ${x.amount_micro > 0 ? "ok" : ""}`}>{rub(x.amount_micro, lang)}</td></tr>)}</tbody></table>
          </div>
        )}
      </Drawer>

      <Modal open={!!adj} onClose={() => setAdj(null)} title={A.adjust}
        footer={<><button className="btn btn-ghost" onClick={() => setAdj(null)}>{t.common.cancel}</button>
          <button className="btn" disabled={!adj?.amount || !adj.reason} onClick={() => { act(() => post(`/api/admin/users/${sel}/balance`, { amount_rub: Number(adj!.amount), reason: adj!.reason })); setAdj(null); }}>{t.common.save}</button></>}>
        {adj && (
          <>
            <label className="field"><span>{A.adjustAmount}</span><input className="input num" type="number" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} autoFocus /></label>
            <label className="field"><span>{A.reason}</span><input className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
          </>
        )}
      </Modal>
      {node}
    </>
  );
}
