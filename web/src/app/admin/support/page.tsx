"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useL } from "@/components/admin-kit";
import { Icon } from "@/components/icons";
import { SupportChat } from "@/components/support-chat";
import { Modal, PageHead, Seg, Switch, useLoad, useToast } from "@/components/ui";
import { ApiError, get, post, put } from "@/lib/api";
import { ago, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type T = { id: string; user_id: string; subject: string; status: "open" | "answered" | "closed"; unread_admin: number; last_message_at: string; email: string; user_name: string; last_body: string; last_author: string };
type Detail = { ticket: T; balance_micro: number; plan: string | null };
type TG = { enabled: boolean; env_chat: boolean; recent: { id: number; title: string; type: string }[] | null; error?: string };

function AdminSupport() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const sp = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data, reload } = useLoad(() => get<{ data: T[]; counters: { unread_admin: number; open: number } }>(`/api/admin/support?status=${status}&q=${encodeURIComponent(q)}`), [status, q]);
  const [sel, setSel] = useState<string | null>(sp.get("t"));
  useEffect(() => { const id = setInterval(reload, 6000); return () => clearInterval(id); }, [reload]);
  const list = data?.data ?? [];
  const active = sel ?? list[0]?.id ?? null;
  const det = useLoad(() => (active ? get<Detail>(`/api/admin/support/${active}?after=999999999`) : Promise.resolve(null)), [active]);
  const [tgOpen, setTgOpen] = useState(false);
  const st = { open: L("ждёт ответа", "waiting"), answered: L("отвечено", "answered"), closed: L("закрыто", "closed") };

  const setStatusFor = async (s: string) => {
    if (!active) return;
    await post(`/api/admin/support/${active}/status`, { status: s });
    reload(); det.reload();
  };

  return (
    <>
      <PageHead title={L("Поддержка", "Support")}
        lead={data ? L(`Ждут ответа: ${data.counters.open} · непрочитанных сообщений: ${data.counters.unread_admin}`, `Waiting: ${data.counters.open} · unread: ${data.counters.unread_admin}`) : undefined}
        actions={<button className="btn btn-ghost" onClick={() => setTgOpen(true)}><Icon name="send" size={16} />{L("Уведомления в Telegram", "Telegram alerts")}</button>} />
      <div className="filters">
        <input className="input" style={{ minWidth: 260 }} placeholder={L("Почта или тема", "Email or subject")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg value={status} onChange={setStatus} options={[{ value: "", label: L("Все", "All") }, { value: "open", label: st.open }, { value: "answered", label: st.answered }, { value: "closed", label: st.closed }]} />
      </div>
      <div className="sup sup-admin">
        <aside className="sup-list">
          {list.length === 0 && <p className="hint" style={{ padding: 12 }}>{L("Обращений нет", "No tickets")}</p>}
          {list.map((t) => (
            <button key={t.id} className={`sup-item${active === t.id ? " on" : ""}`} onClick={() => setSel(t.id)}>
              <div className="spread"><b className="sup-subj">{t.email}</b>{t.unread_admin > 0 && <span className="stop-badge">{t.unread_admin}</span>}</div>
              <div className="small sup-prev">{t.subject}</div>
              <div className="hint sup-prev">{t.last_author === "admin" ? L("Вы: ", "You: ") : ""}{t.last_body}</div>
              <div className="spread hint"><span className={`sup-st st-${t.status}`}>{st[t.status]}</span><span>{ago(t.last_message_at, lang)}</span></div>
            </button>
          ))}
        </aside>
        <section className="sup-main">
          {active && det.data ? (
            <>
              <div className="sup-head">
                <div className="grow" style={{ minWidth: 0 }}>
                  <b>{det.data.ticket.subject}</b>
                  <div className="hint">
                    <Link href={`/admin/users/${det.data.ticket.user_id}`} className="link-u">{det.data.ticket.email}</Link>
                    {" · "}{L("баланс", "balance")} {rub(det.data.balance_micro, lang)}{" · "}{det.data.plan ?? L("без тарифа", "no plan")}
                  </div>
                </div>
                <Seg value={det.data.ticket.status} onChange={setStatusFor} options={[{ value: "open", label: st.open }, { value: "answered", label: st.answered }, { value: "closed", label: st.closed }]} />
              </div>
              <SupportChat key={active} base={`/api/admin/support/${active}`} side="admin" onSent={() => { reload(); det.reload(); }} />
            </>
          ) : <div className="empty" style={{ margin: "auto" }}>{L("Выберите обращение слева", "Pick a ticket")}</div>}
        </section>
      </div>
      <TelegramModal open={tgOpen} onClose={() => setTgOpen(false)} toast={toast} />
    </>
  );
}

function TelegramModal({ open, onClose, toast }: { open: boolean; onClose: () => void; toast: (t: string, bad?: boolean) => void }) {
  const L = useL();
  const tg = useLoad(() => (open ? get<TG>("/api/admin/telegram") : Promise.resolve(null)), [open]);
  const settings = useLoad(() => (open ? get<{ data: Record<string, unknown> }>("/api/admin/settings") : Promise.resolve(null)), [open]);
  const [chats, setChats] = useState("");
  const [onSupport, setOnSupport] = useState(true);
  const [onPay, setOnPay] = useState(false);
  useEffect(() => {
    const d = settings.data?.data;
    if (!d) return;
    setChats(String(d.tg_chat_ids ?? ""));
    setOnSupport(d.tg_notify_support !== false);
    setOnPay(d.tg_notify_payments === true);
  }, [settings.data]);
  const save = async () => {
    try { await put("/api/admin/settings", { tg_chat_ids: chats, tg_notify_support: onSupport, tg_notify_payments: onPay }); toast(L("Сохранено", "Saved")); }
    catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };
  const test = async () => {
    await save();
    try { await post("/api/admin/telegram/test"); toast(L("Тестовое сообщение отправлено", "Test message sent")); }
    catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };
  const t = tg.data;
  return (
    <Modal open={open} onClose={onClose} title={L("Уведомления в Telegram", "Telegram alerts")}
      footer={<><button className="btn btn-ghost" onClick={test}>{L("Сохранить и проверить", "Save and test")}</button><button className="btn" onClick={async () => { await save(); onClose(); }}>{L("Сохранить", "Save")}</button></>}>
      {t && !t.enabled && <p className="note">{L("Бот не подключён: добавьте TELEGRAM_BOT_TOKEN в .env на сервере и перезапустите его.", "Bot is not connected: add TELEGRAM_BOT_TOKEN to the server .env and restart.")}</p>}
      {t?.enabled && <p className="hint">{L("Бот подключён. Напишите ему /start из нужного чата (или добавьте в группу), затем выберите чат ниже.", "Bot connected. Send /start to it from the target chat (or add it to a group), then pick the chat below.")}</p>}
      <label className="field"><span>{L("ID чатов через запятую", "Chat IDs, comma separated")}</span><input className="input mono" value={chats} onChange={(e) => setChats(e.target.value)} placeholder="123456789, -100…" /></label>
      {t?.recent && t.recent.length > 0 && (
        <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
          {t.recent.map((c) => <button key={c.id} className="chip" onClick={() => setChats((x) => (x.split(",").map((s) => s.trim()).includes(String(c.id)) ? x : [x, String(c.id)].filter(Boolean).join(", ")))}>{c.title} · {c.id}</button>)}
        </div>
      )}
      <label className="spread small"><span>{L("Новые обращения и сообщения в поддержку", "New support tickets and messages")}</span><Switch checked={onSupport} onChange={setOnSupport} /></label>
      <label className="spread small"><span>{L("Успешные оплаты", "Successful payments")}</span><Switch checked={onPay} onChange={setOnPay} /></label>
    </Modal>
  );
}

export default function Page() { return <Suspense><AdminSupport /></Suspense>; }
