import Link from "next/link";
import { ProviderLogo } from "@/components/provider-logo";
import { api } from "@/lib/api";
import { compact, num } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import { loadModels } from "@/lib/server-data";

export const metadata = { title: "Рейтинг" };

export default async function Rankings() {
  const { t, lang } = await getDict();
  const [rank, { data: models }] = await Promise.all([
    api<{ data: { model_id: string; tokens: number; requests: number }[] }>("/api/rankings?range=30d", { cache: "no-store" }).catch(() => ({ data: [] })),
    loadModels(),
  ]);
  const byId = new Map(models.map((m) => [m.id, m]));
  const max = Math.max(1, ...rank.data.map((r) => r.tokens));
  return (
    <div className="wrap" style={{ paddingTop: 48 }}>
      <header className="page-head"><div><h1 className="h1">{t.rankings.title}</h1><p className="muted" style={{ marginTop: 8 }}>{t.rankings.lead}</p></div></header>
      {rank.data.length === 0 ? <div className="empty">{t.dash.noData}</div> : (
        <table className="table">
          <thead><tr><th style={{ width: 48 }}>#</th><th>{t.models.title}</th><th style={{ width: "40%" }} /><th className="r">{t.rankings.tokens}</th><th className="r">{t.rankings.requests}</th></tr></thead>
          <tbody>
            {rank.data.map((r, i) => (
              <tr key={r.model_id}>
                <td className="mono faint">{i + 1}</td>
                <td><div className="row" style={{ gap: 10 }}><ProviderLogo author={byId.get(r.model_id)?.author ?? "?"} size={28} /><Link href={`/models/${r.model_id}`}>{byId.get(r.model_id)?.name ?? r.model_id}</Link> <span className="faint small mono">{byId.get(r.model_id)?.author}</span></div></td>
                <td><div className="share-track"><div className="share-bar" style={{ width: `${(r.tokens / max) * 100}%`, background: i === 0 ? "var(--signal)" : undefined }} /></div></td>
                <td className="r num">{compact(r.tokens, lang)}</td>
                <td className="r num">{num(r.requests, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
