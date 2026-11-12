"use client";

import { useState } from "react";
import { CopyButton, Modal, PageHead, Skeleton, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, patch, post } from "@/lib/api";
import { ago, date, inputToRub, microToInput, rub } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Key } from "@/lib/types";

type Form = { id?: string; name: string; limit: string; reset: Key["limit_reset"]; rpm: string; expires: string; disabled: boolean };
const empty: Form = { name: "", limit: "", reset: "never", rpm: "", expires: "", disabled: false };

export function KeysPage({ kind }: { kind: "inference" | "management" }) {
  const { t, lang } = useI18n();
  const K = t.keys;
  const toast = useToast();
  const { ask, node } = useConfirm();
  const { data, loading, reload } = useLoad(() => get<{ data: Key[] }>(`/api/keys?kind=${kind}`), [kind]);
  const [form, setForm] = useState<Form | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const body = (f: Form) => ({
    name: f.name, kind, limit_rub: f.limit ? inputToRub(Number(f.limit), lang) : null, limit_reset: f.reset,
    rpm_limit: f.rpm ? Number(f.rpm) : null, expires_at: f.expires ? new Date(f.expires + "T23:59:59").toISOString() : null, disabled: f.disabled,
  });

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      if (form.id) {
        await patch(`/api/keys/${form.id}`, body(form));
        toast(t.common.saved);
      } else {
        const k = await post<Key>("/api/keys", body(form));
        setSecret(k.secret ?? null);
      }
      setForm(null);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t.common.error, true);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(k: Key) {
    await patch(`/api/keys/${k.id}`, { ...body(toForm(k)), disabled: !k.disabled });
    reload();
  }

  async function revoke(k: Key) {
    if (!(await ask(fmt(K.revokeConfirm, { name: k.name })))) return;
    await del(`/api/keys/${k.id}`);
    reload();
  }

  const toForm = (k: Key): Form => ({
    id: k.id, name: k.name, limit: k.limit_micro !== null ? String(microToInput(k.limit_micro, lang)) : "", reset: k.limit_reset,
    rpm: k.rpm_limit ? String(k.rpm_limit) : "", expires: k.expires_at ? k.expires_at.slice(0, 10) : "", disabled: k.disabled,
  });

  const keys = data?.data ?? [];
  return (
    <>
      <PageHead title={kind === "management" ? K.mgmtTitle : K.title} lead={kind === "management" ? K.mgmtLead : K.lead}
        actions={<button className="btn" onClick={() => setForm({ ...empty })}>+ {K.create}</button>} />

      {loading ? <Skeleton h={120} /> : keys.length === 0 ? <div className="empty">{K.empty}</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{K.name}</th><th>{K.key}</th><th className="r">{K.spent}</th><th>{K.lastUsed}</th><th>{K.created}</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => {
                const expired = k.expires_at && new Date(k.expires_at) < new Date();
                return (
                  <tr key={k.id} style={{ opacity: k.disabled || expired ? 0.55 : 1 }}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <b style={{ fontWeight: 500 }}>{k.name}</b>
                        {k.disabled && <span className="tag">{K.disabled}</span>}
                        {expired && <span className="tag tag-bad">{K.expired}</span>}
                      </div>
                      <div className="hint">
                        {k.limit_micro !== null && <>{fmt(K.periodSpent, { spent: rub(k.period_spent_micro, lang), limit: rub(k.limit_micro, lang) })} · {{ never: K.resetNever, daily: K.resetDaily, weekly: K.resetWeekly, monthly: K.resetMonthly }[k.limit_reset]}</>}
                        {k.rpm_limit && <> · {k.rpm_limit} rpm</>}
                        {k.expires_at && <> · {K.expires}: {date(k.expires_at, lang)}</>}
                      </div>
                    </td>
                    <td className="mono small">{k.prefix}</td>
                    <td className="r num">{rub(k.total_spent_micro, lang)}</td>
                    <td className="small muted">{ago(k.last_used_at, lang)}</td>
                    <td className="small muted">{date(k.created_at, lang)}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setForm(toForm(k))}>{t.common.edit}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle(k)}>{k.disabled ? K.enable : K.disable}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => revoke(k)}>{K.revoke}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? t.common.edit : K.create}
        footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>{t.common.cancel}</button><button className="btn" disabled={busy || !form?.name.trim()} onClick={save}>{form?.id ? t.common.save : t.common.create}</button></>}>
        {form && (
          <>
            <label className="field"><span>{K.name}</span><input className="input" autoFocus value={form.name} placeholder={K.namePh} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            {kind === "inference" && (
              <>
                <div className="grid-2" style={{ gap: 12 }}>
                  <label className="field"><span>{K.limit}</span><input className="input" type="number" min="0" step="1" value={form.limit} placeholder={K.limitPh} onChange={(e) => setForm({ ...form, limit: e.target.value })} /></label>
                  <label className="field"><span>{K.reset}</span>
                    <select className="select" value={form.reset} onChange={(e) => setForm({ ...form, reset: e.target.value as Form["reset"] })}>
                      <option value="never">{K.resetNever}</option><option value="daily">{K.resetDaily}</option><option value="weekly">{K.resetWeekly}</option><option value="monthly">{K.resetMonthly}</option>
                    </select>
                  </label>
                </div>
                <div className="grid-2" style={{ gap: 12 }}>
                  <label className="field"><span>{K.rpm}</span><input className="input" type="number" min="1" value={form.rpm} placeholder={K.rpmPh} onChange={(e) => setForm({ ...form, rpm: e.target.value })} /></label>
                  <label className="field"><span>{K.expires}</span><input className="input" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></label>
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret(null)} title={K.secretTitle}
        footer={<button className="btn" onClick={() => setSecret(null)}>{t.common.close}</button>}>
        <p className="note">{K.secretText}</p>
        <div className="row" style={{ gap: 8 }}>
          <code className="input mono" style={{ display: "flex", alignItems: "center", overflowX: "auto", whiteSpace: "nowrap", fontSize: 13 }}>{secret}</code>
          {secret && <CopyButton text={secret} className="btn" />}
        </div>
      </Modal>
      {node}
    </>
  );
}
