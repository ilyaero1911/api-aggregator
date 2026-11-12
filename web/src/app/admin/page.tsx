"use client";

import Link from "next/link";
import { useState } from "react";
import { useL } from "@/components/admin-kit";
import { Bars, Shares } from "@/components/charts";
import { PageHead, Seg, Skeleton, useLoad, useToast } from "@/components/ui";
import { get, post } from "@/lib/api";
import { compact, date, kopecks, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { FxRate } from "@/lib/types";

type Day = { bucket: string; signups: number; requests: number; errors: number; spend_micro: number; tokens: number; paid_kopecks: number; active_users: number };
type S = {
  stats: { users: number; users_today: number; requests_today: number; revenue_today_micro: number; revenue_month_micro: number; payments_month_kopecks: number; active_subscriptions: number; errors_today: number };
  totals: { balances_micro: number; blocked: number; keys: number; pending_payments: number; active_7d: number };
  daily: Day[];
  top_models: { model_id: string; tokens: number; requests: number }[];
  top_users: { id: string; email: string; requests: number; spend_micro: number; tokens: number }[];
  plans: { id: string; name_ru: string; active: number; total: number }[];
  payment_totals: { status: string; n: number; kopecks: number }[];
  fx: FxRate[];
};

export default function AdminOverview() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const [days, setDays] = useState("30");
  const { data, reload } = useLoad(() => get<S>(`/api/admin/stats?days=${days}`), [days]);
  const s = data?.stats, tt = data?.totals;
  const d = data?.daily ?? [];
  const sum = (k: keyof Day) => d.reduce((a, x) => a + Number(x[k]), 0);
  const refresh = async () => {
    const r = await post<{ error?: string }>("/api/admin/fx/refresh");
    toast(r.error ?? L("Курс обновлён", "Rates refreshed"), !!r.error);
    reload();
  };
  const dl = (r: Day) => date(r.bucket, lang);

  const cells: [string, string | null | undefined, (string | null | undefined)?][] = [
    [L("Пользователей", "Users"), s && num(s.users, lang), s && L(`+${s.users_today} за сутки`, `+${s.users_today} today`)],
    [L("Активны за 7 дней", "Active in 7 days"), tt && num(tt.active_7d, lang)],
    [L("Активных подписок", "Active subscriptions"), s && num(s.active_subscriptions, lang)],
    [L(`Оплачено за ${days} дн.`, `Paid in ${days} days`), data && kopecks(sum("paid_kopecks"), lang)],
    [L(`Списано за ${days} дн.`, `Spent in ${days} days`), data && rub(sum("spend_micro"), lang)],
    [L("Деньги на балансах", "Money on balances"), tt && rub(tt.balances_micro, lang)],
    [L("Запросов сегодня", "Requests today"), s && num(s.requests_today, lang), s && L(`ошибок ${s.errors_today}`, `${s.errors_today} errors`)],
    [L("Ждут оплаты", "Pending payments"), tt && num(tt.pending_payments, lang)],
    [L("Активных ключей", "Active keys"), tt && num(tt.keys, lang)],
    [L("Заблокировано", "Blocked"), tt && num(tt.blocked, lang)],
  ];

  return (
    <>
      <PageHead title={L("Обзор площадки", "Platform overview")} lead={L("Пользователи, деньги и нагрузка. Нажмите на пользователя, чтобы открыть его карточку.", "Users, money and load. Click a user to open their card.")}
        actions={<Seg value={days} onChange={setDays} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "90", label: "90d" }]} />} />
      <div className="board">
        {cells.map(([l, v, sub]) => (
          <div key={l}><span className="label">{l}</span>{v == null ? <Skeleton h={28} /> : <span className="v">{v}</span>}{sub && <span className="hint">{sub}</span>}</div>
        ))}
      </div>

      <div className="dash-grid">
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 16 }}>{L("Запросы и ошибки", "Requests and errors")}</h2>
          {data ? <Bars data={d} xLabel={dl} format={(v) => num(v, lang)} series={[{ key: "requests", color: "var(--ink)", label: L("Все запросы", "All requests") }, { key: "errors", color: "var(--bad)", label: L("Ошибки", "Errors") }]} /> : <Skeleton h={180} />}
        </section>
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 16 }}>{L("Деньги: оплачено и списано", "Money: paid and spent")}</h2>
          {data ? <Bars data={d.map((x) => ({ ...x, paid_micro: x.paid_kopecks * 10_000 }))} xLabel={dl} format={(v) => rub(v, lang)}
            series={[{ key: "paid_micro", color: "var(--ok)", label: L("Оплачено", "Paid") }, { key: "spend_micro", color: "var(--signal)", label: L("Списано за запросы", "Spent on requests") }]} /> : <Skeleton h={180} />}
        </section>
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 16 }}>{L("Регистрации и активные", "Sign-ups and active users")}</h2>
          {data ? <Bars data={d} xLabel={dl} format={(v) => num(v, lang)} series={[{ key: "active_users", color: "var(--ink)", label: L("Активные", "Active") }, { key: "signups", color: "var(--signal)", label: L("Новые", "New") }]} /> : <Skeleton h={180} />}
        </section>
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 16 }}>{L("Токены по дням", "Tokens per day")}</h2>
          {data ? <Bars data={d} xLabel={dl} format={(v) => num(v, lang)} series={[{ key: "tokens", color: "var(--ink)", label: L("Токены", "Tokens") }]} /> : <Skeleton h={180} />}
        </section>

        <section className="panel">
          <div className="spread" style={{ marginBottom: 12 }}><h2 className="h3">{L("Кто больше всех тратит", "Top spenders")}</h2><Link href="/admin/users?sort=spend" className="small muted">{L("Все", "All")} →</Link></div>
          {data && data.top_users.length === 0 ? <p className="hint">—</p> : (
            <table className="table"><tbody>
              {data?.top_users.map((u) => (
                <tr key={u.id}><td><Link href={`/admin/users/${u.id}`}>{u.email}</Link></td><td className="r num small">{num(u.requests, lang)}</td><td className="r num small">{compact(u.tokens, lang)}</td><td className="r num">{rub(u.spend_micro, lang)}</td></tr>
              ))}
            </tbody></table>
          )}
        </section>
        <section className="panel">
          <h2 className="h3" style={{ marginBottom: 12 }}>{L("Модели по токенам", "Models by tokens")}</h2>
          {data && <Shares rows={data.top_models.slice(0, 8).map((m) => ({ label: m.model_id, value: m.tokens, sub: `${num(m.requests, lang)} ${L("запросов", "requests")}` }))} format={(v) => compact(v, lang)} />}
        </section>
        <section className="panel">
          <div className="spread" style={{ marginBottom: 12 }}><h2 className="h3">{L("Тарифы", "Plans")}</h2><Link href="/admin/subscriptions" className="small muted">{L("Подписки", "Subscriptions")} →</Link></div>
          <table className="table">
            <thead><tr><th>{L("Тариф", "Plan")}</th><th className="r">{L("Активных", "Active")}</th><th className="r">{L("Всего было", "Ever")}</th></tr></thead>
            <tbody>{data?.plans.map((p) => <tr key={p.id}><td>{p.name_ru} <span className="mono faint small">{p.id}</span></td><td className="r num">{p.active}</td><td className="r num">{p.total}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="panel">
          <div className="spread" style={{ marginBottom: 12 }}><h2 className="h3">{L("Платежи по статусам", "Payments by status")}</h2><Link href="/admin/payments" className="small muted">{L("Все", "All")} →</Link></div>
          <table className="table"><tbody>
            {data?.payment_totals.map((p) => <tr key={p.status}><td>{p.status}</td><td className="r num">{p.n}</td><td className="r num">{kopecks(p.kopecks, lang)}</td></tr>)}
          </tbody></table>
          <div className="spread" style={{ margin: "24px 0 12px" }}><h2 className="h3">{L("Курсы ЦБ", "CBR rates")}</h2><button className="btn btn-ghost btn-sm" onClick={refresh}>{L("Обновить", "Refresh")}</button></div>
          <table className="table"><tbody>
            {data?.fx.map((r) => <tr key={r.currency}><td className="mono">{r.currency}</td><td className="r num">{(r.rub_micro / 1e6).toFixed(4)} ₽</td><td className="small muted">{r.source}</td><td className="small muted">{date(r.fetched_at, lang, true)}</td><td>{r.stale && <span className="tag tag-warn">stale</span>}</td></tr>)}
          </tbody></table>
        </section>
      </div>
    </>
  );
}
