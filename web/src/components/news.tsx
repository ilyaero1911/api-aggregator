"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { date } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "./icons";

export type News = { id: string; title_ru: string; title_en: string; body_ru: string; body_en: string; kind: "info" | "success" | "warning"; pinned: boolean; created_at: string; read: boolean };

/** Плашка с самой свежей непрочитанной новостью для обзора кабинета. */
export function NewsBanner() {
  const { lang } = useI18n();
  const [n, setN] = useState<News | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { get<{ data: News[] }>("/api/news").then((r) => setN(r.data.find((x) => !x.read) ?? null)).catch(() => {}); }, []);
  if (!n || hidden) return null;
  const en = lang === "en";
  return (
    <div className={`news-banner k-${n.kind}`}>
      <span className="news-ico"><Icon name="sparkle" size={18} /></span>
      <div className="grow">
        <b>{en && n.title_en ? n.title_en : n.title_ru}</b>
        <p className="small">{(en && n.body_en ? n.body_en : n.body_ru).slice(0, 220)}</p>
      </div>
      <Link href="/dashboard/news" className="btn btn-ghost btn-sm">{en ? "All news" : "Все новости"}</Link>
      <button className="x-btn" onClick={() => setHidden(true)} aria-label="close"><Icon name="close" size={16} /></button>
    </div>
  );
}

export function NewsDate({ s }: { s: string }) {
  const { lang } = useI18n();
  return <span className="hint">{date(s, lang)}</span>;
}
