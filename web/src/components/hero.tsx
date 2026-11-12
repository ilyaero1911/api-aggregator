"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "./icons";

const WORDS = ["Claude", "GPT-5", "Gemini", "DeepSeek", "Qwen", "Llama", "Grok"];

/** Заголовок главной: имя модели меняется само, под ним светится акцент. */
export function HeroText({ models, rate }: { models: number; rate: string }) {
  const { lang } = useI18n();
  const ru = lang !== "en";
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((x) => (x + 1) % WORDS.length), 2200); return () => clearInterval(id); }, []);
  return (
    <div className="hero-text">
      <div className="hero-pill"><span className="live-dot" />{ru ? `${models} моделей онлайн · курс ЦБ ${rate} ₽` : `${models} models online · CBR rate ${rate} ₽`}</div>
      <h1 className="h-display hero-h">
        <span className="hero-line">{ru ? "Один ключ" : "One key"}</span>
        <span className="hero-line">{ru ? "ко всем" : "for every"}</span>
        <span className="hero-line">
          <span className="rot" aria-live="polite">
            {WORDS.map((w, k) => <span key={w} className={`rot-w${k === i ? " on" : k === (i + WORDS.length - 1) % WORDS.length ? " off" : ""}`}>{w}</span>)}
            <span className="rot-line" key={i} /><span className="rot-sizer">{WORDS.reduce((a, b) => (a.length > b.length ? a : b))}</span>
          </span>
        </span>
      </h1>
      <p className="hero-lead">
        {ru
          ? "Подключайте любые нейросети через один API, совместимый с OpenAI. Платите в рублях и только за то, что использовали. Если провайдер не отвечает, запрос сам уходит к запасному."
          : "Use any AI model through one OpenAI-compatible API. Pay only for what you use. If a provider fails, the request moves to a backup on its own."}
      </p>
      <div className="row-wrap">
        <Link href="/register" className="btn btn-lg btn-signal">{ru ? "Начать бесплатно" : "Start for free"} <Icon name="arrow" size={18} /></Link>
        <Link href="/models" className="btn btn-lg btn-ghost"><Icon name="cube" size={18} />{ru ? "Смотреть модели" : "Browse models"}</Link>
      </div>
      <div className="hero-trust">
        <span><Icon name="coins" size={16} />{ru ? "Оплата в рублях" : "Ruble billing"}</span>
        <span><Icon name="route" size={16} />{ru ? "Резервные маршруты" : "Automatic failover"}</span>
        <span><Icon name="lock" size={16} />{ru ? "Запросы не храним" : "Prompts not stored"}</span>
      </div>
    </div>
  );
}
