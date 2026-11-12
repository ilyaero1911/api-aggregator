"use client";

import { useMemo, useState } from "react";
import { cur, getUsdRate, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";
import { Select } from "@/components/select";

/** Грубая нарезка на токены для наглядности: так же оценивает шлюз (≈4 латинских символа или ≈2,5 кириллических на токен). */
function chunks(text: string): string[] {
  const out: string[] = [];
  for (const part of text.match(/\s*[^\s]+/g) ?? []) {
    const cyr = /[а-яё]/i.test(part);
    const size = cyr ? 3 : 4;
    const word = part;
    if (word.trim().length <= size + 1) { out.push(word); continue; }
    for (let i = 0; i < word.length; i += size) out.push(word.slice(i, i + size));
  }
  return out;
}

const T = {
  ru: {
    title: "Как считается цена — простыми словами",
    s1t: "Модель считает не слова, а токены",
    s1: "Токен — это кусочек текста. Короткое слово — один токен, длинное режется на несколько кусочков. По-английски один токен — это примерно 4 буквы, по-русски одно слово — это 2–3 токена. Напишите что-нибудь и посмотрите, как текст режется на токены:",
    sample: "Привет! Помоги написать письмо клиенту о переносе встречи на пятницу.",
    count: "{n} токенов",
    s2t: "Ввод — то, что вы отправляете. Вывод — то, что модель отвечает",
    s2a: "Ввод", s2ad: "Ваш вопрос, инструкции, история переписки, приложенный текст. Всё, что модель читает.",
    s2b: "Вывод", s2bd: "Ответ модели. Всё, что она пишет. Писать труднее, чем читать, поэтому вывод обычно в 3–8 раз дороже ввода.",
    s3t: "«Цена за 1 млн токенов» — как цена за килограмм",
    s3: "На рынке пишут цену за килограмм, но вы покупаете 200 грамм и платите только за них. Здесь так же: цена указана за миллион токенов (это около 1500 страниц книжного текста), а списывается только за те токены, что вы реально потратили. Обычный вопрос с ответом — это сотые или тысячные доли от миллиона.",
    calc: "Посчитайте свой случай",
    model: "Модель", q: "Длина вопроса", a: "Длина ответа", perDay: "Запросов в день",
    words: "{n} слов", short: "Коротко", mid: "Средне", long: "Подробно",
    inLine: "Ввод: {t} токенов × {p} за 1 млн", outLine: "Вывод: {t} токенов × {p} за 1 млн",
    one: "Один запрос", day: "В день", month: "В месяц", balance: "На {b} хватит примерно на {n} таких запросов",
    free: "Эта модель бесплатная: платить не нужно, есть только дневной лимит запросов.",
    plan: "Модель входит в подписку: пока есть токены тарифа, с баланса ничего не списывается.",
  },
  en: {
    title: "How pricing works, in plain words",
    s1t: "Models count tokens, not words",
    s1: "A token is a small piece of text. A short word is one token, a long word is cut into several pieces. In English one token is about 4 letters, so 100 words are roughly 130 tokens. Type something and see how it is cut into tokens:",
    sample: "Hi! Help me write a short email to a client moving our meeting to Friday.",
    count: "{n} tokens",
    s2t: "Input is what you send. Output is what the model writes back",
    s2a: "Input", s2ad: "Your question, instructions, chat history, attached text. Everything the model reads.",
    s2b: "Output", s2bd: "The model's answer. Everything it writes. Writing is harder than reading, so output usually costs 3–8× more than input.",
    s3t: "“Price per 1M tokens” works like a price per kilogram",
    s3: "A market lists the price per kilogram, but you buy 200 grams and pay only for those. Same here: the price is per million tokens (about 1,500 book pages), and you are charged only for the tokens you actually used. A typical question and answer is a tiny fraction of a million.",
    calc: "Calculate your case",
    model: "Model", q: "Question length", a: "Answer length", perDay: "Requests per day",
    words: "{n} words", short: "Short", mid: "Medium", long: "Detailed",
    inLine: "Input: {t} tokens × {p} per 1M", outLine: "Output: {t} tokens × {p} per 1M",
    one: "One request", day: "Per day", month: "Per month", balance: "{b} covers about {n} such requests",
    free: "This model is free: nothing is charged, there is only a daily request limit.",
    plan: "This model is included in subscriptions: while you have plan tokens, nothing is taken from the balance.",
  },
};

const f = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export function TokenExplainer({ models, initialModel }: { models: Model[]; initialModel?: string }) {
  const { lang } = useI18n();
  const L = T[lang === "en" ? "en" : "ru"];
  const text = models.filter((m) => m.modality === "text");
  const [sample, setSample] = useState(L.sample);
  const [modelId, setModelId] = useState(initialModel ?? text.find((m) => !m.is_free)?.id ?? text[0]?.id ?? "");
  const [qWords, setQWords] = useState(150);
  const [aWords, setAWords] = useState(400);
  const [perDay, setPerDay] = useState(50);
  const parts = useMemo(() => chunks(sample), [sample]);
  const m = text.find((x) => x.id === modelId);
  const ratio = lang === "en" ? 1.33 : 2.5; // токенов на слово
  const tin = Math.round(qWords * ratio) + 30; // плюс служебные токены сообщения
  const tout = Math.round(aWords * ratio);
  const pin = m?.prices.input_per_m ?? 0, pout = m?.prices.output_per_m ?? 0;
  const costIn = (tin * pin) / 1e6, costOut = (tout * pout) / 1e6; // в микрорублях
  const one = costIn + costOut;
  const balanceMicro = lang === "en" ? 10 * getUsdRate() : 500e6; // $10 или 500 ₽
  const fits = one > 0 ? Math.floor(balanceMicro / one) : 0;

  return (
    <section className="explain" id="how">
      <h2 className="h1">{L.title}</h2>
      <div className="explain-grid">
        <div className="explain-step">
          <h3 className="h3">{L.s1t}</h3>
          <p className="muted">{L.s1}</p>
          <textarea className="textarea" rows={2} value={sample} onChange={(e) => setSample(e.target.value)} />
          <div className="tokens">{parts.map((p, i) => <span key={i} className={`tk tk${i % 4}`}>{p}</span>)}</div>
          <div className="mono small">{f(L.count, { n: parts.length })}</div>
        </div>
        <div className="explain-step">
          <h3 className="h3">{L.s2t}</h3>
          <div className="io">
            <div><div className="label">{L.s2a} →</div><p>{L.s2ad}</p></div>
            <div><div className="label signal">← {L.s2b}</div><p>{L.s2bd}</p></div>
          </div>
          <h3 className="h3" style={{ marginTop: 18 }}>{L.s3t}</h3>
          <p className="muted">{L.s3}</p>
        </div>
      </div>

      <div className="explain-calc">
        <h3 className="h2">{L.calc}</h3>
        <div className="calc-grid">
          <div className="stack">
            <label className="field"><span>{L.model}</span>
              <Select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {text.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </label>
            <label className="field"><span className="spread">{L.q}<b className="mono">{f(L.words, { n: qWords })}</b></span>
              <input type="range" min="10" max="3000" step="10" value={qWords} onChange={(e) => setQWords(Number(e.target.value))} />
            </label>
            <label className="field"><span className="spread">{L.a}<b className="mono">{f(L.words, { n: aWords })}</b></span>
              <input type="range" min="10" max="3000" step="10" value={aWords} onChange={(e) => setAWords(Number(e.target.value))} />
              <div className="row" style={{ gap: 6 }}>
                {[[L.short, 80], [L.mid, 400], [L.long, 1500]].map(([l, v]) => <button key={l} type="button" className={`chip${aWords === v ? " on" : ""}`} onClick={() => setAWords(v as number)}>{l}</button>)}
              </div>
            </label>
            <label className="field"><span className="spread">{L.perDay}<b className="mono">{perDay}</b></span>
              <input type="range" min="1" max="2000" value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} />
            </label>
          </div>
          <div className="calc-out">
            {m?.is_free ? <p className="note">{L.free}</p> : (
              <>
                <div className="calc-line"><span>{f(L.inLine, { t: num(tin, lang), p: rub(pin, lang) })}</span><b className="num">{rub(costIn, lang, { precise: true })}</b></div>
                <div className="calc-line"><span>{f(L.outLine, { t: num(tout, lang), p: rub(pout, lang) })}</span><b className="num">{rub(costOut, lang, { precise: true })}</b></div>
                <div className="calc-total">
                  <div><span className="label">{L.one}</span><span className="num">{rub(one, lang, { precise: true })}</span></div>
                  <div><span className="label">{L.day}</span><span className="num">{rub(one * perDay, lang)}</span></div>
                  <div><span className="label">{L.month}</span><span className="num">{rub(one * perDay * 30, lang)}</span></div>
                </div>
                <p className="muted small">{f(L.balance, { b: lang === "en" ? `$10` : `500 ${cur(lang)}`, n: num(fits, lang) })}</p>
                {m?.in_plans && <p className="note">{L.plan}</p>}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
