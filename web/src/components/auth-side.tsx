"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Logo } from "./brand";
import { RouteLive } from "./route-live";

const DEMO = {
  ru: [
    ["Объясни, что такое токен, в одном предложении", "Токен — это кусочек текста: короткое слово или часть длинного, за них и считается цена."],
    ["Сколько стоит ответ на 500 слов?", "Около 700–1000 токенов вывода: на недорогих моделях это меньше рубля."],
    ["Что будет, если провайдер упадёт?", "Шлюз сам переправит запрос на запасного провайдера, вы получите ответ как обычно."],
  ],
  en: [
    ["Explain what a token is in one sentence", "A token is a small piece of text — a short word or part of a long one — and that is what you pay for."],
    ["How much does a 500-word answer cost?", "Roughly 700–1000 output tokens: on budget models that is a fraction of a cent."],
    ["What happens if a provider goes down?", "The gateway retries on a backup provider and you get your answer as usual."],
  ],
};

/** Левая половина страницы входа: живая схема и печатающийся пример диалога. */
export function AuthSide() {
  const { lang } = useI18n();
  const items = DEMO[lang === "en" ? "en" : "ru"];
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [q, a] = items[i % items.length];
  useEffect(() => {
    if (n < a.length) {
      const id = setTimeout(() => setN((x) => x + 1 + Math.floor(Math.random() * 3)), 28);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => { setI((x) => x + 1); setN(0); }, 2600);
    return () => clearTimeout(id);
  }, [n, a.length]);
  return (
    <div className="auth-side">
      <Logo />
      <div className="stack" style={{ ["--gap" as string]: "28px" }}>
        <h2 className="auth-claim">{lang === "en" ? "One key. Every model. Billed in rubles." : "Один ключ. Все модели. Оплата в рублях."}</h2>
        <RouteLive compact providers={["Anthropic", "OpenAI", "Google", "DeepSeek", "Qwen", "Meta"]} />
        <div className="auth-chat">
          <div className="label">{lang === "en" ? "you" : "вы"}</div>
          <p>{q}</p>
          <div className="label">deepseek/deepseek-v3.2</div>
          <p className="mono small">{a.slice(0, n)}<span className="caret" /></p>
        </div>
      </div>
      <div className="hint">© Strelka</div>
    </div>
  );
}
