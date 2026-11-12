"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, post } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "./icons";
import { useToast } from "./ui";

export type Msg = { id: number; author: "user" | "admin"; body: string; created_at: string; author_name: string };

/** Переписка по обращению. side — кто смотрит: пользователь или админ. Новые сообщения подтягиваются раз в 4 секунды. */
export function SupportChat({ base, side, closed, onSent }: { base: string; side: "user" | "admin"; closed?: boolean; onSent?: () => void }) {
  const { lang } = useI18n();
  const en = lang === "en";
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (reset = false) => {
    if (reset) { last.current = 0; setMsgs([]); }
    const r = await get<{ messages: Msg[] }>(`${base}?after=${last.current}`);
    if (r.messages.length) {
      last.current = r.messages[r.messages.length - 1].id;
      setMsgs((m) => (reset ? r.messages : [...m, ...r.messages]));
    }
  }, [base]);
  useEffect(() => { load(true).catch(() => {}); const id = setInterval(() => load().catch(() => {}), 4000); return () => clearInterval(id); }, [load]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [msgs.length]);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "0px"; el.style.height = Math.min(180, el.scrollHeight) + "px"; } }, [text]);

  const send = async () => {
    const b = text.trim();
    if (!b || busy) return;
    setBusy(true);
    try { await post(`${base}/messages`, { body: b }); setText(""); await load(); onSent?.(); }
    catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  };

  return (
    <div className="sup-chat">
      <div className="sup-log" ref={log}>
        {msgs.map((m) => {
          const mine = m.author === side;
          return (
            <div key={m.id} className={`sup-msg${mine ? " mine" : ""}`}>
              {!mine && <span className="sup-ava">{m.author === "admin" ? <Icon name="admin" size={15} /> : (m.author_name || "U")[0].toUpperCase()}</span>}
              <div>
                <div className="sup-bubble">{m.body}</div>
                <div className="hint">{m.author === "admin" ? (en ? "Support" : "Поддержка") : m.author_name || (en ? "User" : "Пользователь")} · {dateTime(m.created_at, lang)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {closed ? <div className="sup-closed hint">{en ? "This conversation is closed. Write a new message to reopen it." : "Обращение закрыто. Напишите сообщение, чтобы открыть его снова."}</div> : null}
      <form className="pg2-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea ref={ta} rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={en ? "Write a message…" : "Напишите сообщение…"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn btn-signal" disabled={busy || !text.trim()}><Icon name="send" size={16} />{en ? "Send" : "Отправить"}</button>
      </form>
    </div>
  );
}
