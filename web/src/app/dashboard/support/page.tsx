"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { SupportChat } from "@/components/support-chat";
import { PageHead, useLoad, useToast } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { ago } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type T = { id: string; subject: string; status: "open" | "answered" | "closed"; unread_user: number; last_message_at: string; last_body: string };

export default function Support() {
  const { lang } = useI18n();
  const en = lang === "en";
  const toast = useToast();
  const { data, reload } = useLoad(() => get<{ data: T[] }>("/api/support"));
  const [sel, setSel] = useState<string | "new" | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const list = data?.data ?? [];
  const cur = list.find((t) => t.id === sel);
  const active = sel ?? (list[0]?.id ?? "new");
  const status = { open: en ? "waiting for reply" : "ждёт ответа", answered: en ? "answered" : "есть ответ", closed: en ? "closed" : "закрыто" };

  const create = async () => {
    try {
      const t = await post<{ id: string }>("/api/support", { subject, body });
      setSubject(""); setBody(""); await reload(); setSel(t.id);
      toast(en ? "Message sent, we'll reply here" : "Сообщение отправлено, ответим здесь же");
    } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };

  return (
    <>
      <PageHead title={en ? "Support" : "Поддержка"} lead={en ? "Write to us about anything: payments, keys, models. We usually reply within an hour on business days." : "Напишите нам о чём угодно: оплата, ключи, модели. Обычно отвечаем в течение часа в рабочее время."}
        actions={<button className="btn" onClick={() => setSel("new")}><Icon name="plus" size={16} />{en ? "New request" : "Новое обращение"}</button>} />
      <div className="sup">
        <aside className="sup-list">
          {list.length === 0 && <p className="hint" style={{ padding: 12 }}>{en ? "No requests yet" : "Обращений пока нет"}</p>}
          {list.map((t) => (
            <button key={t.id} className={`sup-item${active === t.id ? " on" : ""}`} onClick={() => setSel(t.id)}>
              <div className="spread"><b className="sup-subj">{t.subject}</b>{t.unread_user > 0 && <span className="stop-badge">{t.unread_user}</span>}</div>
              <div className="hint sup-prev">{t.last_body}</div>
              <div className="spread hint"><span className={`sup-st st-${t.status}`}>{status[t.status]}</span><span>{ago(t.last_message_at, lang)}</span></div>
            </button>
          ))}
        </aside>
        <section className="sup-main">
          {active === "new" ? (
            <div className="sup-new">
              <span className="pg2-empty-ico"><Icon name="chat" size={24} /></span>
              <h2 className="h2">{en ? "How can we help?" : "Чем помочь?"}</h2>
              <label className="field"><span>{en ? "Topic (optional)" : "Тема (необязательно)"}</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} /></label>
              <label className="field"><span>{en ? "Message" : "Сообщение"}</span><textarea className="textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={en ? "Describe the problem. If it's about a request, add its ID from the history." : "Опишите вопрос. Если он про конкретный запрос, укажите его ID из истории запросов."} /></label>
              <div><button className="btn btn-signal" disabled={!body.trim()} onClick={create}><Icon name="send" size={16} />{en ? "Send" : "Отправить"}</button></div>
            </div>
          ) : (
            <>
              <div className="sup-head"><b>{cur?.subject}</b>{cur && <span className={`sup-st st-${cur.status}`}>{status[cur.status]}</span>}
                {cur && cur.status !== "closed" && <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={async () => { await post(`/api/support/${cur.id}/close`); reload(); }}>{en ? "Close" : "Закрыть обращение"}</button>}
              </div>
              <SupportChat key={active} base={`/api/support/${active}`} side="user" closed={cur?.status === "closed"} onSent={reload} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
