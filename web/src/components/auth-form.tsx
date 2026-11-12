"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, get, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { PublicConfig } from "@/lib/types";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t, lang } = useI18n();
  const A = t.auth;
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next")?.startsWith("/") ? sp.get("next")! : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(sp.get("error"));
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => { get<PublicConfig>("/api/config").then(setCfg).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === "login") await post("/api/auth/login", { email, password });
      else await post("/api/auth/register", { email, password, name, locale: lang });
      router.push(next);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h1 className="h1">{mode === "login" ? A.loginTitle : A.registerTitle}</h1>
      {cfg?.google_enabled && (
        <>
          <a className="btn btn-ghost btn-lg" href={`/api/auth/google?next=${encodeURIComponent(next)}`} style={{ width: "100%" }}>
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
            {A.google}
          </a>
          <div className="auth-or"><span>{A.or}</span></div>
        </>
      )}
      {mode === "register" && (
        <label className="field"><span>{A.name}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      )}
      <label className="field"><span>{A.email}</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="field">
        <span>{A.password}</span>
        <input className="input" type="password" required minLength={mode === "register" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "register" && <span className="hint">{A.passwordHint}</span>}
      </label>
      {err && <p className="error-text">{A.errors[err] ?? t.common.error}</p>}
      <button className="btn btn-lg" disabled={busy} style={{ width: "100%" }}>{mode === "login" ? t.common.signIn : A.createAccount}</button>
      <p className="muted small">
        {mode === "login" ? <>{A.noAccount} <Link href="/register" className="signal">{t.common.signUp}</Link></> : <>{A.haveAccount} <Link href="/login" className="signal">{t.common.signIn}</Link></>}
      </p>
    </form>
  );
}
