"use client";

import { useState } from "react";
import { LangSwitch, ThemeToggle } from "@/components/brand";
import { useSession } from "@/components/session";
import { PageHead, Switch, useLoad, useToast } from "@/components/ui";
import { ApiError, get, patch, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import type { User } from "@/lib/types";

export default function Settings() {
  const { t } = useI18n();
  const S = t.settings;
  const toast = useToast();
  const { user, setUser } = useSession();
  const [name, setName] = useState(user.name);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");

  const save = async (body: Partial<User>) => {
    try { setUser(await patch<User>("/api/me", body)); toast(t.common.saved); } catch (e) { toast((e as Error).message, true); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await post("/api/me/password", { current: cur, new: nw }); setCur(""); setNw(""); toast(t.common.saved); setUser({ ...user, has_password: true }); }
    catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); }
  };

  return (
    <>
      <PageHead title={S.title} />
      <div className="settings">
        <section>
          <h2 className="h3">{S.profile}</h2>
          <div className="stack">
            <label className="field"><span>{t.auth.email}</span><input className="input" value={user.email} disabled /></label>
            <label className="field"><span>{t.auth.name}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div><button className="btn" disabled={name === user.name} onClick={() => save({ name })}>{t.common.save}</button></div>
          </div>
        </section>
        <section>
          <h2 className="h3">{S.privacy}</h2>
          <div className="spread" style={{ alignItems: "flex-start" }}>
            <div><div>{S.logPrompts}</div><p className="hint">{S.logPromptsText}</p></div>
            <Switch checked={user.log_prompts} onChange={(v) => save({ log_prompts: v })} />
          </div>
        </section>
        <section>
          <h2 className="h3">{S.security}</h2>
          <form className="stack" onSubmit={changePw}>
            <div className="h3" style={{ fontWeight: 400 }}>{user.has_password ? S.changePassword : S.setPassword}</div>
            {user.has_password && <label className="field"><span>{S.current}</span><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>}
            <label className="field"><span>{S.new}</span><input className="input" type="password" minLength={8} value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" /></label>
            <div><button className="btn" disabled={nw.length < 8}>{t.common.save}</button></div>
          </form>
        </section>
        <Linked />
        <section>
          <h2 className="h3">{S.interface}</h2>
          <div className="stack">
            <div className="spread"><span>{S.lang}</span><LangSwitch /></div>
            <div className="spread"><span>{t.common.theme}</span><ThemeToggle /></div>
          </div>
        </section>
      </div>
    </>
  );
}

function Linked() {
  const { lang } = useI18n();
  const en = lang === "en";
  const { data } = useLoad(() => get<{ data: { provider: string; email: string; created_at: string }[]; providers: { id: string; enabled: boolean }[] }>("/api/me/identities"));
  const names: Record<string, string> = { github: "GitHub", yandex: "Яндекс ID", vk: "VK ID" };
  return (
    <section>
      <h2 className="h3">{en ? "Sign-in services" : "Вход через сервисы"}</h2>
      <div className="stack" style={{ ["--gap" as string]: "8px" }}>
        {(data?.providers ?? []).map((p) => {
          const link = data?.data.find((x) => x.provider === p.id);
          return (
            <div key={p.id} className="spread small">
              <span>{names[p.id] ?? p.id}</span>
              {link ? <span className="ok">{en ? "linked" : "привязан"}{link.email ? ` · ${link.email}` : ""}</span>
                : p.enabled ? <a className="btn btn-ghost btn-sm" href={`/api/auth/oauth/${p.id}?next=/dashboard/settings`}>{en ? "Link" : "Привязать"}</a>
                : <span className="faint">{en ? "not connected on the server" : "не подключён на сервере"}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
