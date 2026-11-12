"use client";

import { useState } from "react";
import { Modal, PageHead, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, post } from "@/lib/api";
import { date, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Promo = { code: string; amount_micro: number; max_uses: number; used: number; expires_at: string | null; created_at: string };

export default function Promos() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const toast = useToast();
  const { ask, node } = useConfirm();
  const { data, reload } = useLoad(() => get<{ data: Promo[] }>("/api/admin/promos"));
  const [f, setF] = useState<{ code: string; amount: string; uses: string; expires: string } | null>(null);
  const save = async () => {
    if (!f) return;
    try {
      await post("/api/admin/promos", { code: f.code, amount_rub: Number(f.amount), max_uses: Number(f.uses), expires_at: f.expires ? new Date(f.expires + "T23:59:59").toISOString() : null });
      setF(null); reload(); toast(t.common.saved);
    } catch (e) { toast(e instanceof ApiError ? e.message : t.common.error, true); }
  };
  return (
    <>
      <PageHead title={A.promos} actions={<button className="btn" onClick={() => setF({ code: "", amount: "100", uses: "100", expires: "" })}>+ {A.newPromo}</button>} />
      {data && data.data.length === 0 ? <div className="empty">—</div> : (
        <table className="table">
          <thead><tr><th>{A.code}</th><th className="r">{A.amountRub}</th><th className="r">{A.used}</th><th>{A.expiresAt}</th><th>{t.keys.created}</th><th /></tr></thead>
          <tbody>
            {data?.data.map((p) => (
              <tr key={p.code}>
                <td className="mono">{p.code}</td>
                <td className="r num">{rub(p.amount_micro, lang)}</td>
                <td className="r num">{p.used} / {p.max_uses}</td>
                <td className="small muted">{p.expires_at ? date(p.expires_at, lang) : "∞"}</td>
                <td className="small muted">{date(p.created_at, lang)}</td>
                <td className="r"><button className="btn btn-danger btn-sm" onClick={async () => { if (await ask(`${t.common.delete} ${p.code}?`)) { await del(`/api/admin/promos/${p.code}`); reload(); } }}>{t.common.delete}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={!!f} onClose={() => setF(null)} title={A.newPromo}
        footer={<><button className="btn btn-ghost" onClick={() => setF(null)}>{t.common.cancel}</button><button className="btn" disabled={!f?.code} onClick={save}>{t.common.create}</button></>}>
        {f && (
          <>
            <label className="field"><span>{A.code}</span><input className="input mono" style={{ textTransform: "uppercase" }} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoFocus /></label>
            <div className="grid-3" style={{ gap: 12 }}>
              <label className="field"><span>{A.amountRub}</span><input className="input" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
              <label className="field"><span>{A.maxUses}</span><input className="input" type="number" value={f.uses} onChange={(e) => setF({ ...f, uses: e.target.value })} /></label>
              <label className="field"><span>{A.expiresAt}</span><input className="input" type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} /></label>
            </div>
          </>
        )}
      </Modal>
      {node}
    </>
  );
}
