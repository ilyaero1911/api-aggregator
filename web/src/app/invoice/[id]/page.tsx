"use client";

import { use, useEffect, useState } from "react";
import { get } from "@/lib/api";
import type { Payment } from "@/lib/types";

type P = Payment & { meta: Record<string, string> };

// Сумма прописью для счёта
function words(n: number): string {
  const ones = [["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"], ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const forms = [["рубль", "рубля", "рублей"], ["тысяча", "тысячи", "тысяч"], ["миллион", "миллиона", "миллионов"]];
  const form = (x: number, f: string[]) => (x % 100 >= 11 && x % 100 <= 19 ? f[2] : x % 10 === 1 ? f[0] : x % 10 >= 2 && x % 10 <= 4 ? f[1] : f[2]);
  const tri = (x: number, fem: number) => [hundreds[Math.floor(x / 100)], x % 100 >= 10 && x % 100 < 20 ? teens[x % 10] : `${tens[Math.floor((x % 100) / 10)]} ${ones[fem][x % 10]}`].join(" ").trim();
  if (n === 0) return "ноль рублей";
  const parts: string[] = [];
  [[Math.floor(n / 1e6) % 1000, 2, 0], [Math.floor(n / 1e3) % 1000, 1, 1], [n % 1000, 0, 0]].forEach(([v, f, fem]) => {
    if (v || f === 0) parts.push(`${v ? tri(v, fem) : ""} ${f === 0 ? form(v, forms[0]) : form(v, forms[f])}`.trim());
  });
  const s = parts.join(" ").replace(/\s+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Печатная форма счёта на оплату. Сохраняется в PDF через печать браузера. */
export default function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<P | null>(null);
  const [site, setSite] = useState<Record<string, string>>({});
  const [err, setErr] = useState(false);
  useEffect(() => {
    get<P>(`/api/payments/${id}`).then(setP).catch(() => setErr(true));
    get<Record<string, string>>("/api/site").then(setSite).catch(() => {});
  }, [id]);
  if (err) return <div className="pay-page"><div className="pay-card">Счёт не найден</div></div>;
  if (!p) return null;
  const m = p.meta ?? {};
  const rub = Math.floor(p.amount_kopecks / 100), kop = p.amount_kopecks % 100;
  const sum = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2 }).format(p.amount_kopecks / 100);
  const d = new Date(p.created_at).toLocaleDateString("ru-RU");
  return (
    <div className="inv-page">
      <div className="inv-actions"><button className="btn" onClick={() => window.print()}>Распечатать или сохранить в PDF</button><a className="btn btn-ghost" href="/dashboard/billing">В кабинет</a></div>
      <article className="inv">
        <table className="inv-bank">
          <tbody>
            <tr><td colSpan={2} rowSpan={2}>{site.company_bank || "Банк получателя"}<br /><small>Банк получателя</small></td><td>БИК</td><td>{site.company_bik}</td></tr>
            <tr><td>Сч. №</td><td>{site.company_corr_account}</td></tr>
            <tr><td>ИНН {site.company_inn}</td><td>КПП {site.company_kpp}</td><td rowSpan={2}>Сч. №</td><td rowSpan={2}>{site.company_account}</td></tr>
            <tr><td colSpan={2}>{site.company_name}<br /><small>Получатель</small></td></tr>
          </tbody>
        </table>
        <h1>Счёт на оплату № {m.number} от {d}</h1>
        <dl className="inv-parties">
          <dt>Поставщик:</dt><dd>{site.company_name}, ИНН {site.company_inn}{site.company_kpp && `, КПП ${site.company_kpp}`}, {site.company_address}</dd>
          <dt>Покупатель:</dt><dd>{m.company}, ИНН {m.inn}{m.kpp && `, КПП ${m.kpp}`}{m.address && `, ${m.address}`}</dd>
        </dl>
        <table className="inv-items">
          <thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th></tr></thead>
          <tbody><tr><td>1</td><td>Пополнение баланса для доступа к API языковых моделей (аванс)</td><td>1</td><td>усл.</td><td>{sum}</td><td>{sum}</td></tr></tbody>
        </table>
        <div className="inv-total"><div>Итого: <b>{sum} ₽</b></div><div>Без НДС</div></div>
        <p>Всего наименований 1, на сумму {sum} руб.<br /><b>{words(rub)} {String(kop).padStart(2, "0")} копеек</b></p>
        <p className="inv-note">Оплата этого счёта означает согласие с условиями публичной оферты. Средства зачисляются на баланс после поступления на расчётный счёт. В назначении платежа укажите номер счёта {p.external_id}.</p>
        <div className="inv-sign"><span>Руководитель ____________________</span><span>Бухгалтер ____________________</span></div>
      </article>
    </div>
  );
}
