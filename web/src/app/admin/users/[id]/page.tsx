"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { PaymentActions, PayTag, SubTag, Tabs, useL } from "@/components/admin-kit";
import { Bars, Shares } from "@/components/charts";
import { Modal, Skeleton, Switch, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, patch, post } from "@/lib/api";
import { ago, compact, date, dateTime, kopecks, ms, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Key, Payment, Plan, Preset, RequestLog, Transaction, User, Wallet } from "@/lib/types";
import { Select } from "@/components/select";

type Sub = { id: string; plan_id: string; status: string; tokens_used: number; started_at: string; ends_at: string; name_ru: string; name_en: string };
type Usage = { prompt_tokens: number; completion_tokens: number; requests: number; cost_micro: number; errors: number };
type D = {
  user: User; admin_note: string; wallet: Wallet; transactions: Transaction[]; subscriptions: Sub[]; keys: (Key & { revoked_at: string | null })[];
  payments: Payment[]; usage: Usage; usage_30d: Usage; series: { bucket: string; prompt_tokens: number; completion_tokens: number; requests: number; cost_micro: number }[];
  models: { model_id: string; requests: number; tokens: number; cost_micro: number }[]; requests: RequestLog[];
  sessions: { user_agent: string; ip: string; created_at: string; expires_at: string }[]; presets: Preset[];
};
type Tab = "overview" | "balance" | "plan" | "keys" | "payments" | "requests" | "access";

export default function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const router = useRouter();
  const { ask, node } = useConfirm();
  const { data: d, reload } = useLoad(() => get<D>(`/api/admin/users/${id}`), [id]);
  const plans = useLoad(() => get<{ data: Plan[] }>("/api/admin/plans"));
  const [tab, setTab] = useState<Tab>("overview");
  const [prof, setProf] = useState({ name: "", email: "", note: "", locale: "ru" });
  const [adj, setAdj] = useState({ amount: "", reason: "" });
  const [pw, setPw] = useState("");
  const [grant, setGrant] = useState("");
  const [editKey, setEditKey] = useState<(Key & { limitRub: string; rpm: string; exp: string }) | null>(null);
  const [editSub, setEditSub] = useState<{ id: string; plan_id: string; ends: string; tokens: string } | null>(null);
  useEffect(() => { if (d) setProf({ name: d.user.name, email: d.user.email, note: d.admin_note, locale: d.user.locale }); }, [d]);

  const act = async (fn: () => Promise<unknown>, okText = L("Сохранено", "Saved")) => {
    try { await fn(); toast(okText); reload(); } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };
  if (!d) return <Skeleton h={400} />;
  const u = d.user;
  const active = d.subscriptions.find((s) => s.status === "active");

  return (
    <>
      <Link href="/admin/users" className="small muted">← {L("Все пользователи", "All users")}</Link>
      <header className="page-head" style={{ marginTop: 12 }}>
        <div className="stack" style={{ ["--gap" as string]: "8px" }}>
          <div className="row-wrap">
            <h1 className="h1">{u.email}</h1>
            {u.role === "admin" && <span className="tag tag-ink">admin</span>}
            {u.status === "blocked" ? <span className="tag tag-bad">{L("заблокирован", "blocked")}</span> : <span className="tag tag-ok">{L("активен", "active")}</span>}
            
          </div>
          <p className="muted small">{u.name} · <span className="mono">{u.id}</span> · {L("с", "since")} {date(u.created_at, lang)} · {L("вход", "login")} {ago(u.last_login_at, lang)}</p>
        </div>
        <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => act(() => patch(`/api/admin/users/${id}`, { status: u.status === "active" ? "blocked" : "active" }))}>{u.status === "active" ? L("Заблокировать", "Block") : L("Разблокировать", "Unblock")}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => act(() => patch(`/api/admin/users/${id}`, { role: u.role === "admin" ? "user" : "admin" }))}>{u.role === "admin" ? L("Снять админа", "Revoke admin") : L("Сделать админом", "Make admin")}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => act(() => post(`/api/admin/users/${id}/logout`), L("Все сессии закрыты", "Signed out everywhere"))}>{L("Выкинуть из сессий", "Sign out everywhere")}</button>
          <button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(L(`Удалить ${u.email} вместе с ключами, логами и историей? Это необратимо.`, `Delete ${u.email} with keys, logs and history? This cannot be undone.`))) { try { await del(`/api/admin/users/${id}`); toast(L("Удалён", "Deleted")); router.push("/admin/users"); } catch (e) { toast((e as Error).message, true); } } }}>{L("Удалить", "Delete")}</button>
        </div>
      </header>

      <div className="board board-sm" style={{ marginBottom: 28 }}>
        <div><span className="label">{L("Баланс", "Balance")}</span><span className={`v ${d.wallet.balance_micro < 0 ? "bad" : ""}`}>{rub(d.wallet.balance_micro, lang)}</span></div>
        <div><span className="label">{L("Тариф", "Plan")}</span><span className="v" style={{ fontSize: 18 }}>{active ? active.name_ru : "—"}</span>{active && <span className="hint">{L("до", "until")} {date(active.ends_at, lang)}</span>}</div>
        <div><span className="label">{L("Потрачено за 30 дн.", "Spent, 30d")}</span><span className="v">{rub(d.usage_30d.cost_micro, lang)}</span></div>
        <div><span className="label">{L("Потрачено всего", "Spent total")}</span><span className="v">{rub(d.usage.cost_micro, lang)}</span></div>
        <div><span className="label">{L("Запросов всего", "Requests total")}</span><span className="v">{num(d.usage.requests, lang)}</span><span className="hint">{L("ошибок", "errors")} {d.usage.errors}</span></div>
        <div><span className="label">{L("Токенов всего", "Tokens total")}</span><span className="v">{compact(d.usage.prompt_tokens + d.usage.completion_tokens, lang)}</span></div>
        <div><span className="label">{L("Оплатил", "Paid")}</span><span className="v">{kopecks(d.payments.filter((p) => p.status === "succeeded").reduce((a, p) => a + p.amount_kopecks, 0), lang)}</span></div>
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { value: "overview", label: L("Обзор и профиль", "Overview & profile") },
        { value: "balance", label: L("Баланс", "Balance"), n: d.transactions.length },
        { value: "plan", label: L("Тариф", "Plan"), n: d.subscriptions.length },
        { value: "keys", label: L("Ключи", "Keys"), n: d.keys.filter((k) => !k.revoked_at).length },
        { value: "payments", label: L("Платежи", "Payments"), n: d.payments.length },
        { value: "requests", label: L("Запросы", "Requests"), n: d.requests.length },
        { value: "access", label: L("Доступ и сессии", "Access & sessions"), n: d.sessions.length },
      ]} />

      {tab === "overview" && (
        <div className="dash-grid" style={{ marginTop: 0 }}>
          <section className="panel">
            <h2 className="h3" style={{ marginBottom: 14 }}>{L("Расходы за 30 дней", "Spend, 30 days")}</h2>
            {d.series.length ? <Bars data={d.series} xLabel={(r) => date(r.bucket, lang)} format={(v) => rub(v, lang)} series={[{ key: "cost_micro", color: "var(--ink)", label: L("Расход", "Spend") }]} /> : <p className="hint">{L("Запросов не было", "No requests")}</p>}
            <h2 className="h3" style={{ margin: "28px 0 14px" }}>{L("Модели за 30 дней", "Models, 30 days")}</h2>
            <Shares rows={d.models.map((m) => ({ label: m.model_id, value: m.cost_micro || m.tokens, sub: `${num(m.requests, lang)} · ${compact(m.tokens, lang)} tok` }))} format={(v) => (d.models.some((m) => m.cost_micro) ? rub(v, lang) : compact(v, lang))} />
          </section>
          <section className="panel stack">
            <h2 className="h3">{L("Профиль", "Profile")}</h2>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>Email</span><input className="input" value={prof.email} onChange={(e) => setProf({ ...prof, email: e.target.value })} /></label>
              <label className="field"><span>{L("Имя", "Name")}</span><input className="input" value={prof.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} /></label>
            </div>
            <label className="field"><span>{L("Язык", "Language")}</span><Select value={prof.locale} onChange={(e) => setProf({ ...prof, locale: e.target.value })}><option value="ru">ru</option><option value="en">en</option></Select></label>
            <label className="field"><span>{L("Заметка администратора (видна только админам)", "Admin note (admins only)")}</span><textarea className="textarea" rows={4} value={prof.note} onChange={(e) => setProf({ ...prof, note: e.target.value })} /></label>
            <div><button className="btn" onClick={() => act(() => patch(`/api/admin/users/${id}`, { name: prof.name, email: prof.email, locale: prof.locale, admin_note: prof.note }))}>{L("Сохранить профиль", "Save profile")}</button></div>
            <div className="spread small"><span>{L("Сохраняет текст запросов", "Logs prompts")}</span><span>{u.log_prompts ? L("да", "yes") : L("нет", "no")}</span></div>
            {d.presets.length > 0 && <div className="small muted">{L("Пресеты", "Presets")}: {d.presets.map((p) => `@preset/${p.slug}`).join(", ")}</div>}
          </section>
        </div>
      )}

      {tab === "balance" && (
        <div className="stack" style={{ ["--gap" as string]: "24px" }}>
          <div className="box box-tint">
            <div className="row-wrap" style={{ alignItems: "flex-end" }}>
              <label className="field"><span>{L("Сумма, ₽ (минус — списать)", "Amount, ₽ (negative charges)")}</span><input className="input num" type="number" style={{ width: 180 }} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></label>
              <label className="field grow"><span>{L("Причина (видна пользователю в истории)", "Reason (shown to the user)")}</span><input className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
              <button className="btn" disabled={!adj.amount || !adj.reason} onClick={() => act(async () => { await post(`/api/admin/users/${id}/balance`, { amount_rub: Number(adj.amount), reason: adj.reason }); setAdj({ amount: "", reason: "" }); })}>{L("Применить", "Apply")}</button>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              {[100, 500, 1000, -100].map((v) => <button key={v} className="chip" onClick={() => setAdj({ ...adj, amount: String(v), reason: adj.reason || (v > 0 ? L("Бонус от администрации", "Bonus from admin") : L("Корректировка", "Correction")) })}>{v > 0 ? "+" : ""}{v} ₽</button>)}
            </div>
          </div>
          <table className="table">
            <thead><tr><th>{L("Дата", "Date")}</th><th>{L("Тип", "Type")}</th><th>{L("Описание", "Description")}</th><th className="r">{L("Сумма", "Amount")}</th><th className="r">{L("Баланс после", "Balance after")}</th></tr></thead>
            <tbody>{d.transactions.map((x) => <tr key={x.id}><td className="small muted">{dateTime(x.created_at, lang)}</td><td><span className="tag">{x.kind}</span></td><td className="small">{x.description}</td><td className={`r num ${x.amount_micro > 0 ? "ok" : ""}`}>{rub(x.amount_micro, lang)}</td><td className="r num muted">{rub(x.balance_after_micro, lang)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === "plan" && (
        <div className="stack" style={{ ["--gap" as string]: "24px" }}>
          <div className="box box-tint row-wrap" style={{ alignItems: "flex-end" }}>
            <label className="field"><span>{L("Выдать тариф бесплатно (заменит текущий)", "Grant a plan for free (replaces current)")}</span>
              <Select style={{ minWidth: 260 }} value={grant} onChange={(e) => setGrant(e.target.value)}><option value="">—</option>{plans.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {p.period_days} {L("дн.", "d")} · {kopecks(p.price_kopecks, "ru")}</option>)}</Select>
            </label>
            <button className="btn" disabled={!grant} onClick={() => act(() => post(`/api/admin/users/${id}/plan`, { plan_id: grant }))}>{L("Выдать", "Grant")}</button>
            {active && <button className="btn btn-danger" onClick={() => act(() => post(`/api/admin/users/${id}/plan`, { plan_id: "" }))}>{L("Отключить текущий", "Cancel current")}</button>}
          </div>
          <table className="table">
            <thead><tr><th>{L("Тариф", "Plan")}</th><th>{L("Статус", "Status")}</th><th>{L("Период", "Period")}</th><th className="r">{L("Токенов израсходовано", "Tokens used")}</th><th /></tr></thead>
            <tbody>{d.subscriptions.map((s) => (
              <tr key={s.id}>
                <td>{s.name_ru} <span className="mono faint small">{s.plan_id}</span></td><td><SubTag s={s.status} /></td>
                <td className="small muted">{date(s.started_at, lang)} → {date(s.ends_at, lang)}</td><td className="r num">{num(s.tokens_used, lang)}</td>
                <td className="r"><div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => act(() => patch(`/api/admin/subscriptions/${s.id}`, { extend_days: 7, status: "active" }))}>+7 {L("дн.", "d")}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => act(() => patch(`/api/admin/subscriptions/${s.id}`, { extend_days: 30, status: "active" }))}>+30 {L("дн.", "d")}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditSub({ id: s.id, plan_id: s.plan_id, ends: s.ends_at.slice(0, 10), tokens: String(s.tokens_used) })}>{L("Изменить", "Edit")}</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === "keys" && (
        <table className="table">
          <thead><tr><th>{L("Ключ", "Key")}</th><th>{L("Лимит", "Limit")}</th><th className="r">{L("Потрачено", "Spent")}</th><th>{L("Последний запрос", "Last used")}</th><th>{L("Статус", "Status")}</th><th /></tr></thead>
          <tbody>{d.keys.map((k) => (
            <tr key={k.id} style={{ opacity: k.revoked_at ? 0.45 : 1 }}>
              <td><div>{k.name} <span className="tag">{k.kind}</span></div><div className="mono hint">{k.prefix}</div></td>
              <td className="small">{k.limit_micro !== null ? `${rub(k.period_spent_micro, lang)} / ${rub(k.limit_micro, lang)} · ${k.limit_reset}` : "—"}{k.rpm_limit ? ` · ${k.rpm_limit} rpm` : ""}</td>
              <td className="r num">{rub(k.total_spent_micro, lang)}</td>
              <td className="small muted">{ago(k.last_used_at, lang)}</td>
              <td>{k.revoked_at ? <span className="tag">{L("отозван", "revoked")}</span> : k.disabled ? <span className="tag tag-warn">{L("выключен", "disabled")}</span> : <span className="tag tag-ok">on</span>}</td>
              <td className="r">{!k.revoked_at && <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditKey({ ...k, limitRub: k.limit_micro !== null ? String(k.limit_micro / 1e6) : "", rpm: k.rpm_limit ? String(k.rpm_limit) : "", exp: k.expires_at?.slice(0, 10) ?? "" })}>{L("Изменить", "Edit")}</button>
                <button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(L(`Отозвать ключ «${k.name}»?`, `Revoke key “${k.name}”?`))) act(() => del(`/api/admin/keys/${k.id}`)); }}>{L("Отозвать", "Revoke")}</button>
              </div>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === "payments" && (
        <table className="table">
          <thead><tr><th>{L("Дата", "Date")}</th><th>ID</th><th>{L("Назначение", "Purpose")}</th><th>{L("Статус", "Status")}</th><th className="r">{L("Сумма", "Amount")}</th><th /></tr></thead>
          <tbody>{d.payments.map((p) => (
            <tr key={p.id}>
              <td className="small muted">{dateTime(p.created_at, lang)}</td><td className="mono small">{p.external_id}</td>
              <td className="small">{p.purpose === "plan" ? `${L("тариф", "plan")} ${p.plan_id}` : L("пополнение", "top-up")}</td><td><PayTag s={p.status} /></td>
              <td className="r num">{kopecks(p.amount_kopecks, lang)}</td>
              <td className="r"><PaymentActions p={p} act={act} ask={ask} /></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === "requests" && (
        <table className="table">
          <thead><tr><th>{L("Время", "Time")}</th><th>{L("Модель", "Model")}</th><th>{L("Ключ", "Key")}</th><th className="r">{L("Токены", "Tokens")}</th><th className="r">{L("Стоимость", "Cost")}</th><th className="r">{L("Время", "Latency")}</th><th>{L("Статус", "Status")}</th></tr></thead>
          <tbody>{d.requests.map((r) => (
            <tr key={r.id} title={r.error || r.prompt_preview}>
              <td className="small muted">{dateTime(r.created_at, lang)}</td><td className="mono small">{r.model_id}</td><td className="small">{r.key_name || r.app || "—"}</td>
              <td className="r num">{num(r.prompt_tokens, lang)} → {num(r.completion_tokens, lang)}</td>
              <td className="r num">{r.paid_by === "balance" ? rub(r.cost_micro, lang) : r.paid_by}</td><td className="r num">{ms(r.latency_ms)}</td>
              <td><span className={`tag ${r.status < 400 ? "tag-ok" : "tag-bad"}`}>{r.status}</span></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === "access" && (
        <div className="grid-2" style={{ alignItems: "start", gap: 40 }}>
          <section className="panel stack">
            <h2 className="h3">{L("Задать новый пароль", "Set a new password")}</h2>
            <p className="hint">{L("Пользователя выкинет из всех сессий. Сообщите ему новый пароль сами.", "The user is signed out everywhere. Tell them the new password yourself.")}</p>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={L("от 8 символов", "8+ characters")} />
              <button className="btn btn-ghost" onClick={() => setPw(Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8))}>{L("Сгенерировать", "Generate")}</button>
              <button className="btn" disabled={pw.length < 8} onClick={() => act(async () => { await post(`/api/admin/users/${id}/password`, { password: pw }); })}>{L("Сохранить", "Save")}</button>
            </div>
            <div className="small muted">{L("Вход по паролю", "Password sign-in")}: {u.has_password ? L("есть", "yes") : L("нет", "no")}</div>
          </section>
          <section className="panel">
            <h2 className="h3" style={{ marginBottom: 12 }}>{L("Активные сессии", "Active sessions")}</h2>
            {d.sessions.length === 0 ? <p className="hint">—</p> : (
              <table className="table"><tbody>{d.sessions.map((s, i) => <tr key={i}><td className="small">{s.user_agent.slice(0, 70)}</td><td className="mono small">{s.ip}</td><td className="small muted">{ago(s.created_at, lang)}</td></tr>)}</tbody></table>
            )}
          </section>
        </div>
      )}

      <Modal open={!!editKey} onClose={() => setEditKey(null)} title={editKey?.name}
        footer={<><button className="btn btn-ghost" onClick={() => setEditKey(null)}>{L("Отмена", "Cancel")}</button><button className="btn" onClick={() => editKey && act(async () => {
          await patch(`/api/admin/keys/${editKey.id}`, { name: editKey.name, limit_rub: editKey.limitRub ? Number(editKey.limitRub) : null, limit_reset: editKey.limit_reset, rpm_limit: editKey.rpm ? Number(editKey.rpm) : null, disabled: editKey.disabled, expires_at: editKey.exp ? new Date(editKey.exp + "T23:59:59").toISOString() : null });
          setEditKey(null);
        })}>{L("Сохранить", "Save")}</button></>}>
        {editKey && (
          <>
            <label className="field"><span>{L("Название", "Name")}</span><input className="input" value={editKey.name} onChange={(e) => setEditKey({ ...editKey, name: e.target.value })} /></label>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{L("Лимит, ₽", "Limit, ₽")}</span><input className="input" type="number" value={editKey.limitRub} onChange={(e) => setEditKey({ ...editKey, limitRub: e.target.value })} /></label>
              <label className="field"><span>{L("Сброс", "Reset")}</span><Select value={editKey.limit_reset} onChange={(e) => setEditKey({ ...editKey, limit_reset: e.target.value as Key["limit_reset"] })}>{["never", "daily", "weekly", "monthly"].map((x) => <option key={x}>{x}</option>)}</Select></label>
              <label className="field"><span>RPM</span><input className="input" type="number" value={editKey.rpm} onChange={(e) => setEditKey({ ...editKey, rpm: e.target.value })} /></label>
              <label className="field"><span>{L("Действует до", "Expires")}</span><input className="input" type="date" value={editKey.exp} onChange={(e) => setEditKey({ ...editKey, exp: e.target.value })} /></label>
            </div>
            <label className="row small"><Switch checked={!editKey.disabled} onChange={(v) => setEditKey({ ...editKey, disabled: !v })} />{L("Ключ работает", "Key enabled")}</label>
          </>
        )}
      </Modal>

      <Modal open={!!editSub} onClose={() => setEditSub(null)} title={L("Подписка", "Subscription")}
        footer={<>
          <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => editSub && act(async () => { await patch(`/api/admin/subscriptions/${editSub.id}`, { status: "canceled" }); setEditSub(null); })}>{L("Отменить подписку", "Cancel subscription")}</button>
          <button className="btn btn-ghost" onClick={() => setEditSub(null)}>{L("Закрыть", "Close")}</button>
          <button className="btn" onClick={() => editSub && act(async () => { await patch(`/api/admin/subscriptions/${editSub.id}`, { plan_id: editSub.plan_id, ends_at: new Date(editSub.ends + "T23:59:59").toISOString(), tokens_used: Number(editSub.tokens), status: "active" }); setEditSub(null); })}>{L("Сохранить и активировать", "Save and activate")}</button>
        </>}>
        {editSub && (
          <div className="grid-2" style={{ gap: 12 }}>
            <label className="field"><span>{L("Тариф", "Plan")}</span><Select value={editSub.plan_id} onChange={(e) => setEditSub({ ...editSub, plan_id: e.target.value })}>{plans.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {p.period_days}d</option>)}</Select></label>
            <label className="field"><span>{L("Действует до", "Ends at")}</span><input className="input" type="date" value={editSub.ends} onChange={(e) => setEditSub({ ...editSub, ends: e.target.value })} /></label>
            <label className="field"><span>{L("Израсходовано токенов", "Tokens used")}</span><input className="input" type="number" value={editSub.tokens} onChange={(e) => setEditSub({ ...editSub, tokens: e.target.value })} /></label>
            <div className="field"><span>&nbsp;</span><button className="btn btn-ghost" onClick={() => setEditSub({ ...editSub, tokens: "0" })}>{L("Обнулить расход", "Reset usage")}</button></div>
          </div>
        )}
      </Modal>
      {node}
    </>
  );
}

