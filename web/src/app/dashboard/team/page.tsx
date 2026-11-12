"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Select } from "@/components/select";
import { useSession } from "@/components/session";
import { CopyButton, Modal, PageHead, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, patch, post } from "@/lib/api";
import { date, inputToRub, microToInput, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Member = { owner_id: string; member_id: string; role: "admin" | "member"; budget_micro: number | null; created_at: string; email: string; name: string; spent_month: number };
type Team = { owner_id: string; member_id: string; role: string; budget_micro: number | null; owner_email: string; owner_name: string; spent_month: number };
type Invite = { id: string; email: string; role: string; budget_micro: number | null; created_at: string };

export default function TeamPage() {
  const { lang } = useI18n();
  const en = lang === "en";
  const L = (ru: string, e: string) => (en ? e : ru);
  const toast = useToast();
  const { ask, node } = useConfirm();
  const { user } = useSession();
  const { data, reload } = useLoad(() => get<{ members: Member[]; invites: Invite[]; teams: Team[] }>("/api/team"));
  const [inv, setInv] = useState<{ email: string; role: string; budget: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; role: string; budget: string } | null>(null);
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : "error", true);
  const cur = en ? "$" : "₽";

  return (
    <>
      <PageHead title={L("Команда", "Team")} lead={L("Пригласите коллег: они создают свои ключи, а расходы списываются с вашего баланса. Каждому можно задать месячный бюджет.", "Invite colleagues: they create their own keys and usage is charged to your balance. Give each a monthly budget.")}
        actions={<button className="btn" onClick={() => setInv({ email: "", role: "member", budget: "" })}><Icon name="plus" size={16} />{L("Пригласить", "Invite")}</button>} />

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="spread" style={{ marginBottom: 10 }}><h2 className="h3">{L("Участники вашей команды", "Your team members")}</h2><span className="hint">{L("Владелец", "Owner")}: {user.email}</span></div>
        {data && data.members.length === 0 && data.invites.length === 0 ? <p className="hint">{L("Пока никого. Пригласите первого участника.", "Nobody yet. Invite the first member.")}</p> : (
          <div className="table-wrap" style={{ boxShadow: "none", padding: 0 }}>
            <table className="table">
              <thead><tr><th>{L("Участник", "Member")}</th><th>{L("Роль", "Role")}</th><th>{L("Бюджет в месяц", "Monthly budget")}</th><th className="r">{L("Потрачено в этом месяце", "Spent this month")}</th><th /></tr></thead>
              <tbody>
                {data?.members.map((m) => {
                  const pct = m.budget_micro ? Math.min(100, (m.spent_month / m.budget_micro) * 100) : 0;
                  return (
                    <tr key={m.member_id}>
                      <td><div>{m.email}</div><div className="hint">{m.name} · {L("с", "since")} {date(m.created_at, lang)}</div></td>
                      <td><span className="tag">{m.role === "admin" ? L("админ", "admin") : L("участник", "member")}</span></td>
                      <td style={{ minWidth: 180 }}>{m.budget_micro !== null ? <><div className="share-track"><div className="share-bar" style={{ width: `${pct}%`, background: pct > 90 ? "var(--bad)" : "var(--signal)" }} /></div><div className="hint mono">{rub(m.spent_month, lang)} / {rub(m.budget_micro, lang)}</div></> : <span className="faint">{L("без лимита", "unlimited")}</span>}</td>
                      <td className="r num">{rub(m.spent_month, lang)}</td>
                      <td className="r"><div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ id: m.member_id, role: m.role, budget: m.budget_micro !== null ? String(microToInput(m.budget_micro, lang)) : "" })}>{L("Изменить", "Edit")}</button>
                        <button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(L(`Убрать ${m.email} из команды? Его командные ключи будут отозваны.`, `Remove ${m.email}? Their team keys will be revoked.`))) { await del(`/api/team/members/${m.member_id}`); reload(); } }}>{L("Убрать", "Remove")}</button>
                      </div></td>
                    </tr>
                  );
                })}
                {data?.invites.map((i) => (
                  <tr key={i.id} style={{ opacity: .7 }}>
                    <td><div>{i.email}</div><div className="hint">{L("приглашение отправлено", "invite pending")} · {date(i.created_at, lang)}</div></td>
                    <td><span className="tag tag-warn">{L("ждём", "pending")}</span></td>
                    <td className="hint">{i.budget_micro !== null ? rub(i.budget_micro, lang) : L("без лимита", "unlimited")}</td>
                    <td />
                    <td className="r"><button className="btn btn-ghost btn-sm" onClick={async () => { await del(`/api/team/invites/${i.id}`); reload(); }}>{L("Отменить", "Cancel")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="h3" style={{ marginBottom: 10 }}>{L("Команды, в которых вы участник", "Teams you belong to")}</h2>
        {data && data.teams.length === 0 ? <p className="hint">{L("Вы не состоите в чужих командах. Попросите владельца прислать ссылку-приглашение.", "You are not in anyone's team. Ask the owner for an invite link.")}</p> : (
          <div className="stack" style={{ ["--gap" as string]: "8px" }}>
            {data?.teams.map((t) => (
              <div key={t.owner_id} className="spread team-row">
                <div><b>{t.owner_name || t.owner_email}</b><div className="hint">{t.owner_email} · {t.role === "admin" ? L("админ", "admin") : L("участник", "member")} · {L("потрачено в месяце", "spent this month")} {rub(t.spent_month, lang)}{t.budget_micro !== null && ` / ${rub(t.budget_micro, lang)}`}</div></div>
                <div className="row" style={{ gap: 6 }}>
                  <a className="btn btn-ghost btn-sm" href="/dashboard/keys">{L("Создать командный ключ", "Create team key")}</a>
                  <button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(L("Выйти из команды? Командные ключи перестанут работать.", "Leave the team? Team keys will stop working."))) { await post(`/api/team/leave/${t.owner_id}`); reload(); } }}>{L("Выйти", "Leave")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={!!inv} onClose={() => setInv(null)} title={L("Пригласить в команду", "Invite to team")}
        footer={<><button className="btn btn-ghost" onClick={() => setInv(null)}>{L("Отмена", "Cancel")}</button><button className="btn" disabled={!inv?.email} onClick={async () => {
          try { const r = await post<{ link: string }>("/api/team/invites", { email: inv!.email, role: inv!.role, budget_rub: inv!.budget ? inputToRub(Number(inv!.budget), lang) : null }); setInv(null); setLink(r.link); reload(); } catch (e) { fail(e); }
        }}>{L("Создать приглашение", "Create invite")}</button></>}>
        {inv && (
          <>
            <label className="field"><span>Email</span><input className="input" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} autoFocus /></label>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{L("Роль", "Role")}</span><Select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="member">{L("Участник", "Member")}</option><option value="admin">{L("Админ", "Admin")}</option></Select></label>
              <label className="field"><span>{L(`Бюджет в месяц, ${cur}`, `Monthly budget, ${cur}`)}</span><input className="input" type="number" min="0" placeholder={L("без лимита", "unlimited")} value={inv.budget} onChange={(e) => setInv({ ...inv, budget: e.target.value })} /></label>
            </div>
          </>
        )}
      </Modal>
      <Modal open={!!link} onClose={() => setLink(null)} title={L("Приглашение создано", "Invite created")} footer={<button className="btn" onClick={() => setLink(null)}>{L("Готово", "Done")}</button>}>
        <p className="muted">{L("Отправьте ссылку коллеге. Она действует 14 дней, открыть её нужно под аккаунтом с этой почтой или любым другим.", "Send this link to your colleague. It is valid for 14 days.")}</p>
        <code className="secret">{link}</code>
        {link && <div><CopyButton text={link} className="btn" /></div>}
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={L("Участник", "Member")}
        footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>{L("Отмена", "Cancel")}</button><button className="btn" onClick={async () => {
          try { await patch(`/api/team/members/${edit!.id}`, { role: edit!.role, budget_rub: edit!.budget ? inputToRub(Number(edit!.budget), lang) : null }); setEdit(null); reload(); } catch (e) { fail(e); }
        }}>{L("Сохранить", "Save")}</button></>}>
        {edit && (
          <div className="grid-2" style={{ gap: 12 }}>
            <label className="field"><span>{L("Роль", "Role")}</span><Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="member">{L("Участник", "Member")}</option><option value="admin">{L("Админ", "Admin")}</option></Select></label>
            <label className="field"><span>{L(`Бюджет в месяц, ${cur}`, `Monthly budget, ${cur}`)}</span><input className="input" type="number" min="0" placeholder={L("без лимита", "unlimited")} value={edit.budget} onChange={(e) => setEdit({ ...edit, budget: e.target.value })} /></label>
          </div>
        )}
      </Modal>
      {node}
    </>
  );
}
