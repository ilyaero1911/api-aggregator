"use client";

import { useEffect, useState } from "react";
import { PageHead, Pager, useLoad } from "@/components/ui";
import { get } from "@/lib/api";
import { dateTime, ms, num, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { RequestLog } from "@/lib/types";

export default function Requests() {
  const { t, lang } = useI18n();
  const L = t.logs;
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [off, setOff] = useState(0);
  useEffect(() => { const id = setTimeout(() => { setQd(q); setOff(0); }, 300); return () => clearTimeout(id); }, [q]);
  const { data } = useLoad(() => get<{ data: RequestLog[] }>(`/api/admin/requests?q=${encodeURIComponent(qd)}&offset=${off}&limit=100`), [qd, off]);
  return (
    <>
      <PageHead title={t.adm.requests} actions={<input className="input" style={{ width: 300 }} placeholder={`${t.adm.email}, ${L.search.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{L.time}</th><th>{t.adm.user}</th><th>{L.model}</th><th>{L.provider}</th><th className="r">{L.tokens}</th><th className="r">{L.cost}</th><th className="r">{L.latency}</th><th>{L.status}</th></tr></thead>
          <tbody>
            {data?.data.map((r) => (
              <tr key={r.id} title={r.error}>
                <td className="small muted">{dateTime(r.created_at, lang)}</td>
                <td className="small">{r.email}</td>
                <td className="mono small">{r.model_id}</td>
                <td className="mono small faint">{r.provider_id || "—"}</td>
                <td className="r num">{num(r.prompt_tokens + r.completion_tokens, lang)}</td>
                <td className="r num">{r.paid_by === "balance" ? rub(r.cost_micro, lang) : L.paid[r.paid_by]}</td>
                <td className="r num">{ms(r.latency_ms)}</td>
                <td><span className={`tag ${r.status < 400 ? "tag-ok" : "tag-bad"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.data.length === 100 && <Pager offset={off} limit={100} total={off + 101} onChange={setOff} />}
    </>
  );
}
