"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { ApiError, get, post } from "@/lib/api";
import { rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { User } from "@/lib/types";

/** Принятие приглашения в команду. Без входа отправляем на вход и возвращаем сюда. */
export default function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { lang } = useI18n();
  const en = lang === "en";
  const router = useRouter();
  const [info, setInfo] = useState<{ owner_email: string; owner_name: string; role: string; budget_micro: number | null } | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    get<{ user: User | null }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null));
    get<typeof info>(`/api/team/join/${token}`).then(setInfo).catch((e) => setErr(e instanceof ApiError ? e.message : "error"));
  }, [token]);
  useEffect(() => { if (user === null) router.replace(`/login?next=${encodeURIComponent(`/join/${token}`)}`); }, [user, router, token]);
  return (
    <div className="pay-page">
      <div className="pay-card">
        <Logo />
        {err ? <p className="error-text">{en ? "The invite is invalid or expired." : "Приглашение недействительно или устарело."}</p> : info && (
          <>
            <h1 className="h2">{en ? "Join the team" : "Вступить в команду"}</h1>
            <p className="muted">{en ? `${info.owner_name || info.owner_email} invites you. Your requests with team keys will be paid from their balance.` : `${info.owner_name || info.owner_email} приглашает вас. Запросы по командным ключам будут оплачиваться с баланса владельца.`}</p>
            {info.budget_micro !== null && <p className="note">{en ? "Your monthly budget" : "Ваш бюджет в месяц"}: {rub(info.budget_micro, lang)}</p>}
            <button className="btn btn-signal btn-lg" style={{ width: "100%" }} onClick={async () => {
              try { await post(`/api/team/join/${token}`); router.push("/dashboard/team"); } catch (e) { setErr(e instanceof ApiError ? e.message : "error"); }
            }}>{en ? "Accept" : "Принять приглашение"}</button>
            <Link href="/dashboard" className="btn btn-ghost" style={{ width: "100%" }}>{en ? "Not now" : "Не сейчас"}</Link>
          </>
        )}
      </div>
    </div>
  );
}
