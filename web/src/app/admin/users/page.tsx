"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useL } from "@/components/admin-kit";
import { Modal, PageHead, Pager, Skeleton, useLoad, useToast } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { ago, date, kopecks, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Plan, User } from "@/lib/types";
import { Select } from "@/components/select";

type Row = {
  id: string; email: string; name: string; role: string; status: string; created_at: string; last_login_at: string | null; admin_note: string;
  has_password: boolean; has_google: boolean; balance_micro: number; plan_id: string; plan_ends_at: string | null;
  requests_30d: number; spend_30d: number; last_request_at: string | null; paid_kopecks: number; keys: number;
};

function Users() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [sort, setSort] = useState(sp.get("sort") ?? "");
  const [off, setOff] = useState(0);
  useEffect(() => { const id = setTimeout(() => { setQd(q); setOff(0); }, 300); return () => clearTimeout(id); }, [q]);
  const qs = `q=${encodeURIComponent(qd)}&role=${role}&status=${status}&plan=${plan}&sort=${sort}&offset=${off}&limit=50`;
  const { data, loading, reload } = useLoad(() => get<{ data: Row[]; total: number }>(`/api/admin/users?${qs}`), [qs]);
  const plans = useLoad(() => get<{ data: Plan[] }>("/api/admin/plans"));
  const [nu, setNu] = useState<{ email: string; name: string; password: string; role: string; balance: string; plan: string } | null>(null);

  const create = async () => {
    if (!nu) return;
    try {
      const u = await post<User>("/api/admin/users", { email: nu.email, name: nu.name, password: nu.password, role: nu.role, balance_rub: Number(nu.balance || 0), plan_id: nu.plan });
      setNu(null); toast(L("Пользователь создан", "User created")); router.push(`/admin/users/${u.id}`);
    } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };
  const setF = (fn: () => void) => { fn(); setOff(0); };

  return (
    <>
      <PageHead title={L("Пользователи", "Users")} lead={data ? L(`Найдено: ${num(data.total, lang)}`, `Found: ${num(data.total, lang)}`) : undefined}
        actions={<button className="btn" onClick={() => setNu({ email: "", name: "", password: "", role: "user", balance: "", plan: "" })}>+ {L("Добавить пользователя", "Add user")}</button>} />
      <div className="filters">
        <input className="input" style={{ minWidth: 260 }} placeholder={L("Email, имя или ID", "Email, name or ID")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={role} onChange={(e) => setF(() => setRole(e.target.value))}><option value="">{L("Любая роль", "Any role")}</option><option value="user">user</option><option value="admin">admin</option></Select>
        <Select value={status} onChange={(e) => setF(() => setStatus(e.target.value))}><option value="">{L("Любой статус", "Any status")}</option><option value="active">{L("Активные", "Active")}</option><option value="blocked">{L("Заблокированные", "Blocked")}</option></Select>
        <Select value={plan} onChange={(e) => setF(() => setPlan(e.target.value))}>
          <option value="">{L("Любой тариф", "Any plan")}</option><option value="none">{L("Без тарифа", "No plan")}</option>
          {plans.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {p.period_days}d</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setF(() => setSort(e.target.value))}>
          <option value="">{L("Сначала новые", "Newest first")}</option><option value="active">{L("По активности", "Recently active")}</option>
          <option value="spend">{L("Больше потратили (30 дн.)", "Top spend (30d)")}</option><option value="paid">{L("Больше заплатили", "Top paid")}</option>
          <option value="balance">{L("Больший баланс", "Highest balance")}</option><option value="requests">{L("Больше запросов", "Most requests")}</option>
        </Select>
        <button className="btn btn-ghost btn-sm" onClick={reload}>↻</button>
      </div>
      {loading && !data ? <Skeleton h={300} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>{L("Пользователь", "User")}</th><th>{L("Тариф", "Plan")}</th><th className="r">{L("Баланс", "Balance")}</th>
              <th className="r">{L("Потратил 30 дн.", "Spent 30d")}</th><th className="r">{L("Запросов 30 дн.", "Requests 30d")}</th>
              <th className="r">{L("Оплатил всего", "Paid total")}</th><th className="r">{L("Ключей", "Keys")}</th>
              <th>{L("Активность", "Activity")}</th><th>{L("Регистрация", "Joined")}</th>
            </tr></thead>
            <tbody>
              {data?.data.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => router.push(`/admin/users/${u.id}`)} style={{ opacity: u.status === "blocked" ? 0.55 : 1 }}>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <span>{u.email}</span>
                      {u.role === "admin" && <span className="tag tag-ink">admin</span>}
                      {u.status === "blocked" && <span className="tag tag-bad">{L("блок", "blocked")}</span>}
                      
                    </div>
                    <div className="hint">{u.name}{u.admin_note && <> · <span title={u.admin_note} className="signal">{u.admin_note.slice(0, 40)}</span></>}</div>
                  </td>
                  <td className="small">{u.plan_id ? <><span className="mono">{u.plan_id}</span><div className="hint">{L("до", "until")} {date(u.plan_ends_at, lang)}</div></> : <span className="faint">—</span>}</td>
                  <td className={`r num ${u.balance_micro < 0 ? "bad" : ""}`}>{rub(u.balance_micro, lang)}</td>
                  <td className="r num">{rub(u.spend_30d, lang)}</td>
                  <td className="r num">{num(u.requests_30d, lang)}</td>
                  <td className="r num">{kopecks(u.paid_kopecks, lang)}</td>
                  <td className="r num">{u.keys}</td>
                  <td className="small muted">{ago(u.last_request_at ?? u.last_login_at, lang)}</td>
                  <td className="small muted">{date(u.created_at, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager offset={off} limit={50} total={data.total} onChange={setOff} />}

      <Modal open={!!nu} onClose={() => setNu(null)} title={L("Новый пользователь", "New user")}
        footer={<><button className="btn btn-ghost" onClick={() => setNu(null)}>{L("Отмена", "Cancel")}</button><button className="btn" disabled={!nu?.email || (nu?.password.length ?? 0) < 8} onClick={create}>{L("Создать", "Create")}</button></>}>
        {nu && (
          <>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>Email</span><input className="input" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} autoFocus /></label>
              <label className="field"><span>{L("Имя", "Name")}</span><input className="input" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></label>
              <label className="field"><span>{L("Пароль (от 8 символов)", "Password (8+ chars)")}</span><input className="input" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></label>
              <label className="field"><span>{L("Роль", "Role")}</span><Select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="user">user</option><option value="admin">admin</option></Select></label>
              <label className="field"><span>{L("Начислить на баланс, ₽", "Add to balance, ₽")}</span><input className="input" type="number" value={nu.balance} onChange={(e) => setNu({ ...nu, balance: e.target.value })} /></label>
              <label className="field"><span>{L("Выдать тариф", "Grant plan")}</span>
                <Select value={nu.plan} onChange={(e) => setNu({ ...nu, plan: e.target.value })}><option value="">—</option>{plans.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name_ru} · {p.period_days}d</option>)}</Select>
              </label>
            </div>
            <p className="hint">{L("Приветственный бонус из настроек тоже начислится.", "The sign-up bonus from settings is added too.")}</p>
          </>
        )}
      </Modal>
    </>
  );
}

export default function Page() { return <Suspense><Users /></Suspense>; }
