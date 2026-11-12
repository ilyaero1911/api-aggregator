"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, get, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { PublicConfig } from "@/lib/types";
import { Icon } from "./icons";
import { useToast } from "./ui";

// Та же проверка, что на сервере.
const EMAIL_RE = /^[a-z0-9._%+\-]{1,64}@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,24}$/;
const COMMON = ["password", "qwerty", "12345678", "11111111", "пароль", "admin123", "letmein"];

function passwordChecks(p: string, email: string) {
  const local = email.toLowerCase().split("@")[0];
  return {
    length: [...p].length >= 8,
    cases: /[a-zа-яё]/.test(p) && /[A-ZА-ЯЁ]/.test(p),
    digit: /\d/.test(p),
    common: p.length > 0 && !COMMON.some((c) => p.toLowerCase().includes(c)) && !(local.length >= 4 && p.toLowerCase().includes(local)),
  };
}

const T = {
  ru: {
    login: "Вход", register: "Создать аккаунт", email: "Почта", password: "Пароль", repeat: "Повторите пароль", name: "Как к вам обращаться",
    or: "или по почте", noAcc: "Нет аккаунта?", haveAcc: "Уже есть аккаунт?", signUp: "Зарегистрироваться", signIn: "Войти",
    via: "Войти через", badEmail: "Похоже, в адресе ошибка. Пример: name@mail.ru", taken: "Этот адрес уже зарегистрирован",
    mismatch: "Пароли не совпадают", show: "Показать пароль",
    rules: { length: "Не меньше 8 символов", cases: "Строчные и заглавные буквы", digit: "Хотя бы одна цифра", common: "Не простой и без вашей почты" },
    strength: ["Слабый", "Средний", "Хороший", "Надёжный"],
    consent: <>Я принимаю <Link href="/legal/terms" target="_blank">условия оферты</Link> и даю <Link href="/legal/consent" target="_blank">согласие на обработку персональных данных</Link> в соответствии с <Link href="/legal/privacy" target="_blank">политикой</Link></>,
    oauthNote: <>Входя через сервис, вы принимаете <Link href="/legal/terms" target="_blank">оферту</Link> и <Link href="/legal/consent" target="_blank">согласие на обработку данных</Link>.</>,
    notConfigured: "Вход через {p} пока не подключён: администратор должен добавить ключи приложения.",
    errors: {
      bad_credentials: "Неверная почта или пароль", email_taken: "Этот адрес уже зарегистрирован", bad_email: "Проверьте адрес почты",
      password_too_short: "Пароль короче 8 символов", password_weak: "Нужны строчные и заглавные буквы и цифра", password_common: "Слишком простой пароль",
      password_contains_email: "Пароль не должен содержать вашу почту", consent_required: "Нужно согласие на обработку данных",
      too_many_attempts: "Слишком много попыток, попробуйте через 15 минут", account_blocked: "Аккаунт заблокирован",
      oauth_disabled: "Этот способ входа пока не подключён", oauth_failed: "Не удалось войти через сервис, попробуйте ещё раз",
      registration_closed: "Регистрация временно закрыта", bad_state: "Сессия входа устарела, попробуйте ещё раз",
    } as Record<string, string>,
  },
  en: {
    login: "Sign in", register: "Create account", email: "Email", password: "Password", repeat: "Repeat password", name: "Your name",
    or: "or with email", noAcc: "No account?", haveAcc: "Already have an account?", signUp: "Sign up", signIn: "Sign in",
    via: "Continue with", badEmail: "This address looks wrong. Example: name@mail.com", taken: "This email is already registered",
    mismatch: "Passwords do not match", show: "Show password",
    rules: { length: "At least 8 characters", cases: "Lower and upper case letters", digit: "At least one digit", common: "Not common, no email inside" },
    strength: ["Weak", "Fair", "Good", "Strong"],
    consent: <>I accept the <Link href="/legal/terms" target="_blank">terms</Link> and give <Link href="/legal/consent" target="_blank">consent to personal data processing</Link> under the <Link href="/legal/privacy" target="_blank">privacy policy</Link></>,
    oauthNote: <>By continuing with a service you accept the <Link href="/legal/terms" target="_blank">terms</Link> and <Link href="/legal/consent" target="_blank">data processing consent</Link>.</>,
    notConfigured: "Sign-in with {p} is not connected yet: the administrator has to add app keys.",
    errors: {
      bad_credentials: "Wrong email or password", email_taken: "This email is already registered", bad_email: "Check the email address",
      password_too_short: "Password is shorter than 8 characters", password_weak: "Use lower and upper case letters and a digit", password_common: "Password is too common",
      password_contains_email: "Password must not contain your email", consent_required: "Consent is required",
      too_many_attempts: "Too many attempts, try again in 15 minutes", account_blocked: "Account is blocked",
      oauth_disabled: "This sign-in method is not connected yet", oauth_failed: "Sign-in failed, please try again",
      registration_closed: "Registration is closed", bad_state: "Sign-in session expired, try again",
    } as Record<string, string>,
  },
};

const PROVIDERS: Record<string, { name: string; icon: React.ReactNode }> = {
  github: { name: "GitHub", icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" /></svg> },
  yandex: { name: "Яндекс ID", icon: <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="12" fill="#fc3f1d" /><path d="M13.3 6.2h-1.1c-2 0-3.1 1-3.1 2.6 0 1.8.8 2.6 2.3 3.6l1.3.8-3.6 5.6H6.7l3.3-5c-1.9-1.4-3-2.7-3-4.9 0-2.8 2-4.7 5.2-4.7h3.2v14.6h-2.1z" fill="#fff" /></svg> },
  vk: { name: "VK ID", icon: <svg viewBox="0 0 24 24" width="18" height="18"><rect width="24" height="24" rx="7" fill="#0077ff" /><path d="M12.8 17c-5 0-7.9-3.4-8-9.1h2.5c.1 4.2 1.9 5.9 3.4 6.3V7.9h2.4v3.6c1.4-.2 2.9-1.8 3.4-3.6h2.3c-.4 2.2-2 3.8-3.1 4.5 1.1.5 2.9 1.9 3.6 4.6h-2.5c-.5-1.7-1.9-3-3.7-3.2V17z" fill="#fff" /></svg> },
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { lang } = useI18n();
  const L = T[lang === "en" ? "en" : "ru"];
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next")?.startsWith("/") ? sp.get("next")! : "/dashboard";
  const reg = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [taken, setTaken] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(sp.get("error"));
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => { get<PublicConfig>("/api/config").then(setCfg).catch(() => {}); }, []);

  const e = email.trim().toLowerCase();
  const emailOk = EMAIL_RE.test(e) && !e.includes("..");
  useEffect(() => {
    setTaken(null);
    if (!reg || !emailOk) return;
    const id = setTimeout(() => get<{ taken: boolean }>(`/api/auth/check-email?email=${encodeURIComponent(e)}`).then((r) => setTaken(r.taken)).catch(() => {}), 450);
    return () => clearTimeout(id);
  }, [e, emailOk, reg]);
  const checks = useMemo(() => passwordChecks(password, e), [password, e]);
  const score = Object.values(checks).filter(Boolean).length;
  const pwOk = score === 4;
  const repeatOk = repeat === password;
  const canSubmit = reg ? emailOk && taken !== true && pwOk && repeatOk && consent : emailOk && password.length > 0;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched({ email: true, password: true, repeat: true });
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      if (reg) await post("/api/auth/register", { email: e, password, name, locale: lang, consent });
      else await post("/api/auth/login", { email: e, password });
      router.push(next);
      router.refresh();
    } catch (x) {
      setErr(x instanceof ApiError ? x.code : "error");
    } finally {
      setBusy(false);
    }
  }

  const oauth = cfg?.oauth ?? Object.keys(PROVIDERS).map((id) => ({ id, enabled: false }));

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h1 className="h1">{reg ? L.register : L.login}</h1>
      <div className="oauth">
        {oauth.map((o) => {
          const p = PROVIDERS[o.id];
          if (!p) return null;
          return (
            <a key={o.id} className="oauth-btn" href={o.enabled ? `/api/auth/oauth/${o.id}?next=${encodeURIComponent(next)}` : "#"}
              onClick={(ev) => { if (!o.enabled) { ev.preventDefault(); toast(L.notConfigured.replace("{p}", p.name), true); } }}
              title={`${L.via} ${p.name}`}>
              <span className="oauth-ico">{p.icon}</span><span>{p.name}</span>
            </a>
          );
        })}
      </div>
      <p className="hint">{L.oauthNote}</p>
      <div className="auth-or"><span>{L.or}</span></div>

      {reg && (
        <label className="field"><span>{L.name}</span><input className="input" value={name} onChange={(x) => setName(x.target.value)} autoComplete="name" maxLength={100} /></label>
      )}
      <label className={`field${touched.email && !emailOk ? " invalid" : ""}`}>
        <span>{L.email}</span>
        <div className="input-wrap">
          <input className="input" type="email" inputMode="email" value={email} onChange={(x) => setEmail(x.target.value)} onBlur={() => setTouched((t) => ({ ...t, email: true }))} autoComplete="email" />
          {emailOk && reg && taken === false && <Icon name="check" size={16} className="input-ok" />}
        </div>
        {touched.email && !emailOk && <span className="error-text">{L.badEmail}</span>}
        {reg && emailOk && taken === true && <span className="error-text">{L.taken} · <Link href="/login" className="signal">{L.signIn}</Link></span>}
      </label>
      <label className={`field${reg && touched.password && !pwOk ? " invalid" : ""}`}>
        <span>{L.password}</span>
        <div className="input-wrap">
          <input className="input" type={show ? "text" : "password"} value={password} onChange={(x) => setPassword(x.target.value)} onBlur={() => setTouched((t) => ({ ...t, password: true }))} autoComplete={reg ? "new-password" : "current-password"} />
          <button type="button" className="input-eye" onClick={() => setShow((s) => !s)} aria-label={L.show}><Icon name={show ? "lock" : "search"} size={16} /></button>
        </div>
        {reg && (password || touched.password) && (
          <div className="pw">
            <div className="pw-head"><div className="pw-bar">{[0, 1, 2, 3].map((i) => <i key={i} className={i < score ? `on s${score}` : ""} />)}</div><span className="hint">{L.strength[Math.max(0, score - 1)]}</span></div>
            <ul className="pw-rules">
              {(Object.keys(checks) as (keyof typeof checks)[]).map((k) => <li key={k} className={checks[k] ? "ok" : ""}><Icon name={checks[k] ? "check" : "close"} size={13} />{L.rules[k]}</li>)}
            </ul>
          </div>
        )}
      </label>
      {reg && (
        <label className={`field${touched.repeat && !repeatOk ? " invalid" : ""}`}>
          <span>{L.repeat}</span>
          <input className="input" type={show ? "text" : "password"} value={repeat} onChange={(x) => setRepeat(x.target.value)} onBlur={() => setTouched((t) => ({ ...t, repeat: true }))} autoComplete="new-password" />
          {touched.repeat && !repeatOk && <span className="error-text">{L.mismatch}</span>}
        </label>
      )}
      {reg && (
        <label className="consent"><input type="checkbox" checked={consent} onChange={(x) => setConsent(x.target.checked)} /><span>{L.consent}</span></label>
      )}
      {err && <p className="error-text">{L.errors[err] ?? err}</p>}
      <button className="btn btn-lg btn-signal" disabled={busy} style={{ width: "100%" }}>{reg ? L.signUp : L.signIn}</button>
      <p className="muted small">
        {reg ? <>{L.haveAcc} <Link href="/login" className="signal">{L.signIn}</Link></> : <>{L.noAcc} <Link href="/register" className="signal">{L.signUp}</Link></>}
      </p>
    </form>
  );
}
