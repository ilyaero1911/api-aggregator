"use client";

import { useEffect, useState } from "react";
import { UserLink, useL } from "@/components/admin-kit";
import { PageHead, Switch, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, patch } from "@/lib/api";
import { ago, date, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Key } from "@/lib/types";

type Row = Key & { user_id: string; email: string; revoked_at: string | null };

export default function AdminKeys() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const [q, setQ] = useState(""), [qd, setQd] = useState("");
  const [revoked, setRevoked] = useState(false);
  useEffect(() => { const id = setTimeout(() => setQd(q), 300); return () => clearTimeout(id); }, [q]);
  const { data, reload } = useLoad(() => get<{ data: Row[] }>(`/api/admin/keys?q=${encodeURIComponent(qd)}&revoked=${revoked ? 1 : 0}`), [qd, revoked]);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); reload(); } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); } };
  const body = (k: Row, disabled: boolean) => ({ name: k.name, limit_rub: k.limit_micro !== null ? k.limit_micro / 1e6 : null, limit_reset: k.limit_reset, rpm_limit: k.rpm_limit, disabled, expires_at: k.expires_at });
  return (
    <>
      <PageHead title={L("API-ключи всех пользователей", "All API keys")} lead={L("Найдите ключ по владельцу, названию или началу секрета. Его можно выключить или отозвать.", "Find a key by owner, name or prefix. Disable or revoke it.")} />
      <div className="filters">
        <input className="input" style={{ minWidth: 280 }} placeholder={L("Email, название или префикс ключа", "Email, name or key prefix")} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={revoked} onChange={(e) => setRevoked(e.target.checked)} />{L("Показывать отозванные", "Show revoked")}</label>
      </div>
      <table className="table">
        <thead><tr><th>{L("Ключ", "Key")}</th><th>{L("Владелец", "Owner")}</th><th>{L("Лимит", "Limit")}</th><th className="r">{L("Потрачено", "Spent")}</th><th>{L("Последний запрос", "Last used")}</th><th>{L("Создан", "Created")}</th><th>{L("Работает", "Enabled")}</th><th /></tr></thead>
        <tbody>
          {data?.data.map((k) => (
            <tr key={k.id} style={{ opacity: k.revoked_at ? 0.45 : 1 }}>
              <td><div>{k.name} {k.kind === "management" && <span className="tag">mgmt</span>}</div><div className="mono hint">{k.prefix}</div></td>
              <td><UserLink id={k.user_id} email={k.email} /></td>
              <td className="small">{k.limit_micro !== null ? `${rub(k.period_spent_micro, lang)} / ${rub(k.limit_micro, lang)}` : "—"}{k.rpm_limit ? ` · ${k.rpm_limit} rpm` : ""}</td>
              <td className="r num">{rub(k.total_spent_micro, lang)}</td>
              <td className="small muted">{ago(k.last_used_at, lang)}</td>
              <td className="small muted">{date(k.created_at, lang)}</td>
              <td>{k.revoked_at ? <span className="tag">{L("отозван", "revoked")}</span> : <Switch checked={!k.disabled} onChange={(v) => act(() => patch(`/api/admin/keys/${k.id}`, body(k, !v)))} />}</td>
              <td className="r">{!k.revoked_at && <button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(L(`Отозвать «${k.name}» (${k.email})?`, `Revoke “${k.name}” (${k.email})?`))) act(() => del(`/api/admin/keys/${k.id}`)); }}>{L("Отозвать", "Revoke")}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.data.length === 0 && <div className="empty">—</div>}
      {node}
    </>
  );
}
