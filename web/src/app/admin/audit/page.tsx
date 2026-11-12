"use client";

import { PageHead, useLoad } from "@/components/ui";
import { get } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Row = { id: number; actor_email: string; action: string; target: string; details: unknown; created_at: string };

export default function Audit() {
  const { t, lang } = useI18n();
  const A = t.adm;
  const { data } = useLoad(() => get<{ data: Row[] }>("/api/admin/audit?limit=200"));
  return (
    <>
      <PageHead title={A.audit} />
      {data && data.data.length === 0 ? <div className="empty">—</div> : (
        <table className="table">
          <thead><tr><th>{A.when}</th><th>{A.actor}</th><th>{A.action}</th><th>{A.target}</th><th>{t.common.details}</th></tr></thead>
          <tbody>
            {data?.data.map((r) => (
              <tr key={r.id}>
                <td className="small muted">{dateTime(r.created_at, lang)}</td>
                <td className="small">{r.actor_email}</td>
                <td><span className="tag">{r.action}</span></td>
                <td className="mono small">{r.target}</td>
                <td className="mono small faint" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.details ? JSON.stringify(r.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
