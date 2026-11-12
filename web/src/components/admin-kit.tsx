"use client";

import Link from "next/link";
import { post } from "@/lib/api";
import { kopecks } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Payment } from "@/lib/types";

/** Короткие подписи админки на двух языках без раздувания словаря. */
export function useL() {
  const { lang } = useI18n();
  return (ru: string, en: string) => (lang === "en" ? en : ru);
}

export function PayTag({ s }: { s: string }) {
  const L = useL();
  const map: Record<string, [string, string, string]> = {
    pending: ["tag-warn", "ожидает", "pending"], succeeded: ["tag-ok", "оплачен", "paid"], failed: ["tag-bad", "ошибка", "failed"],
    canceled: ["", "отменён", "canceled"], refunded: ["tag-signal", "возврат", "refunded"],
  };
  const [cls, ru, en] = map[s] ?? ["", s, s];
  return <span className={`tag ${cls}`}>{L(ru, en)}</span>;
}

export function SubTag({ s }: { s: string }) {
  const L = useL();
  const map: Record<string, [string, string, string]> = { active: ["tag-ok", "активна", "active"], expired: ["", "истекла", "expired"], canceled: ["tag-bad", "отменена", "canceled"] };
  const [cls, ru, en] = map[s] ?? ["", s, s];
  return <span className={`tag ${cls}`}>{L(ru, en)}</span>;
}

export function UserLink({ id, email }: { id: string; email: string }) {
  return <Link href={`/admin/users/${id}`} className="small" onClick={(e) => e.stopPropagation()} style={{ textDecoration: "underline", textDecorationColor: "var(--rule-2)", textUnderlineOffset: 3 }}>{email}</Link>;
}

export function Tabs<T extends string>({ value, items, onChange }: { value: T; items: { value: T; label: string; n?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}>
          {it.label}{it.n !== undefined && <span className="mono faint"> {it.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function PaymentActions({ p, act, ask }: { p: Payment; act: (fn: () => Promise<unknown>, ok?: string) => void; ask: (t: string, danger?: boolean) => Promise<boolean> }) {
  const L = useL();
  const { lang } = useI18n();
  if (p.status === "pending") return (
    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
      <button className="btn btn-ghost btn-sm" onClick={async () => { if (await ask(L(`Зачислить ${kopecks(p.amount_kopecks, lang)} вручную?`, `Mark ${kopecks(p.amount_kopecks, lang)} as paid?`), false)) act(() => post(`/api/admin/payments/${p.id}/complete`)); }}>{L("Зачислить", "Mark paid")}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => act(() => post(`/api/admin/payments/${p.id}/cancel`))}>{L("Отменить", "Cancel")}</button>
    </div>
  );
  if (p.status === "succeeded") return (
    <button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(L(`Оформить возврат ${kopecks(p.amount_kopecks, lang)}? Сумма спишется с баланса пользователя.`, `Refund ${kopecks(p.amount_kopecks, lang)}? The amount is taken from the user's balance.`))) act(() => post(`/api/admin/payments/${p.id}/refund`)); }}>{L("Возврат", "Refund")}</button>
  );
  return null;
}
