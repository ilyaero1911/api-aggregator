"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";
import { Md } from "@/components/md";
import { type News } from "@/components/news";
import { PageHead, Skeleton, useLoad } from "@/components/ui";
import { get, post } from "@/lib/api";
import { date } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

export default function NewsPage() {
  const { lang } = useI18n();
  const en = lang === "en";
  const { data, loading } = useLoad(() => get<{ data: News[] }>("/api/news"));
  useEffect(() => { if (data) post("/api/news/read").catch(() => {}); }, [data]);
  return (
    <>
      <PageHead title={en ? "News" : "Новости"} lead={en ? "Updates from the team: new models, price changes and maintenance." : "Сообщения от команды: новые модели, изменения цен и технические работы."} />
      {loading ? <Skeleton h={160} /> : data?.data.length === 0 ? <div className="empty">{en ? "No news yet" : "Пока новостей нет"}</div> : (
        <div className="news-list">
          {data?.data.map((n) => (
            <article key={n.id} className={`news-item k-${n.kind}${n.read ? "" : " unread"}`}>
              <div className="row" style={{ gap: 10 }}>
                <span className="news-ico"><Icon name={n.kind === "warning" ? "bolt" : n.kind === "success" ? "check" : "sparkle"} size={18} /></span>
                <h2 className="h3 grow">{en && n.title_en ? n.title_en : n.title_ru}</h2>
                {n.pinned && <span className="tag">{en ? "pinned" : "закреплено"}</span>}
                {!n.read && <span className="tag tag-signal">{en ? "new" : "новое"}</span>}
                <span className="hint">{date(n.created_at, lang)}</span>
              </div>
              <Md text={en && n.body_en ? n.body_en : n.body_ru} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
