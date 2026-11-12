"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ctx, perM } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";
import { ProviderLogo } from "./provider-logo";
import { Seg } from "./ui";
import { Select } from "@/components/select";

type Sort = "new" | "cheap" | "context" | "name";
const CTX = [
  { id: "lt32", test: (n: number) => n < 32768, label: "< 32K" },
  { id: "32-128", test: (n: number) => n >= 32768 && n <= 131072, label: "32K–128K" },
  { id: "128-256", test: (n: number) => n > 131072 && n <= 262144, label: "128K–256K" },
  { id: "256-1m", test: (n: number) => n > 262144 && n < 1_000_000, label: "256K–1M" },
  { id: "1m", test: (n: number) => n >= 1_000_000, label: "≥ 1M" },
];

export function Catalog({ models }: { models: Model[] }) {
  const { t, lang } = useI18n();
  const M = t.models;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [cat, setCat] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [caps, setCaps] = useState<string[]>([]);
  const [ctxF, setCtxF] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [author, setAuthor] = useState<string>("");
  const [view, setView] = useState<"list" | "grid">("list");

  const count = (pred: (m: Model) => boolean) => models.filter(pred).length;
  const authors = Array.from(new Set(models.map((m) => m.author))).sort();
  const cats = ["coding", "reasoning", "math", "long-context", "cheap", "open-source", "daily", "free", "images"];

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let r = models.filter((m) =>
      (!s || `${m.name} ${m.id} ${m.author} ${m.description} ${m.categories.join(" ")}`.toLowerCase().includes(s)) &&
      (!cat || m.categories.includes(cat)) &&
      (!type || m.modality === type) &&
      caps.every((c) => m.capabilities.includes(c)) &&
      (!ctxF || CTX.find((x) => x.id === ctxF)!.test(m.context_length)) &&
      (!author || m.author === author) &&
      (!price || (price === "free" ? m.is_free : price === "plan" ? m.in_plans : !m.is_free)));
    r = [...r].sort((a, b) => {
      if (sort === "cheap") return a.prices.input_per_m + a.prices.output_per_m + a.prices.image - (b.prices.input_per_m + b.prices.output_per_m + b.prices.image);
      if (sort === "context") return b.context_length - a.context_length;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.released_at.localeCompare(a.released_at);
    });
    return r;
  }, [models, q, cat, type, caps, ctxF, price, author, sort]);

  const reset = () => { setQ(""); setCat(""); setType(""); setCaps([]); setCtxF(""); setPrice(""); setAuthor(""); };
  const Opt = ({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) => (
    <button className={`facet${on ? " on" : ""}`} onClick={onClick}><span>{label}</span><span className="mono">{n}</span></button>
  );

  return (
    <div className="wrap catalog">
      <aside className="facets">
        <div className="label">{M.type}</div>
        <Opt on={type === "text"} onClick={() => setType(type === "text" ? "" : "text")} label={M.typeChat} n={count((m) => m.modality === "text")} />
        <Opt on={type === "image"} onClick={() => setType(type === "image" ? "" : "image")} label={M.typeImage} n={count((m) => m.modality === "image")} />
        <div className="label">{M.capabilities}</div>
        {["vision", "tools", "reasoning", "image-to-image"].map((c) => (
          <Opt key={c} on={caps.includes(c)} onClick={() => setCaps(caps.includes(c) ? caps.filter((x) => x !== c) : [...caps, c])} label={M.cap[c]} n={count((m) => m.capabilities.includes(c))} />
        ))}
        <div className="label">{M.context}</div>
        {CTX.map((c) => <Opt key={c.id} on={ctxF === c.id} onClick={() => setCtxF(ctxF === c.id ? "" : c.id)} label={c.label} n={count((m) => c.test(m.context_length))} />)}
        <div className="label">{M.price}</div>
        <Opt on={price === "free"} onClick={() => setPrice(price === "free" ? "" : "free")} label={M.priceFree} n={count((m) => m.is_free)} />
        <Opt on={price === "plan"} onClick={() => setPrice(price === "plan" ? "" : "plan")} label={M.pricePlan} n={count((m) => m.in_plans)} />
        <Opt on={price === "paid"} onClick={() => setPrice(price === "paid" ? "" : "paid")} label={M.pricePaid} n={count((m) => !m.is_free)} />
        <div className="label">{M.author}</div>
        {authors.map((a) => <Opt key={a} on={author === a} onClick={() => setAuthor(author === a ? "" : a)} label={a} n={count((m) => m.author === a)} />)}
      </aside>

      <section className="grow">
        <div className="page-head" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="h1">{M.title}</h1>
            <p className="muted" style={{ marginTop: 8 }}>{fmt(M.lead, { n: models.length })}</p>
          </div>
          <Link href="/pricing#how" className="btn btn-ghost btn-sm">{lang === "en" ? "How is the price calculated?" : "Как считается цена?"}</Link>
        </div>
        <div className="row-wrap" style={{ marginBottom: 14 }}>
          <input className="input grow" style={{ maxWidth: 360 }} placeholder={M.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <Select style={{ width: 190 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="new">{M.sortNew}</option><option value="cheap">{M.sortCheap}</option>
            <option value="context">{M.sortContext}</option><option value="name">{M.sortName}</option>
          </Select>
          <div style={{ marginLeft: "auto" }}>
            <Seg value={view} onChange={setView} options={[{ value: "list", label: M.list }, { value: "grid", label: M.grid }]} />
          </div>
        </div>
        <div className="chips">
          <button className={`chip${cat === "" ? " on" : ""}`} onClick={() => setCat("")}>{t.common.all}</button>
          {cats.map((c) => <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(cat === c ? "" : c)}>{M.cat[c]}</button>)}
        </div>

        {list.length === 0 ? (
          <div className="empty">{M.nothing}. <button className="link-btn" onClick={reset}>{M.reset}</button></div>
        ) : view === "list" ? (
          <div className="mrows">
            {list.map((m) => <ModelRow key={m.id} m={m} />)}
          </div>
        ) : (
          <div className="mgrid">
            {list.map((m) => (
              <Link key={m.id} href={`/models/${m.id}`} className="mtile">
                <div className="row" style={{ gap: 10 }}><ProviderLogo author={m.author} size={36} /><span className="label">{m.author}</span></div>
                <div className="h3">{m.name}</div>
                <p className="muted small mclamp">{m.description}</p>
                <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
                  {m.capabilities.map((c) => <span key={c} className="tag">{M.cap[c] ?? c}</span>)}
                  {m.in_plans && <span className="tag tag-signal">{M.inPlan}</span>}
                </div>
                <div className="spread small mono" style={{ marginTop: "auto" }}>
                  <span>{ctx(m.context_length)}</span>
                  <span>{m.modality === "image" ? `${perM(m.prices.image, lang)} / img` : m.is_free ? t.common.free : `${perM(m.prices.input_per_m, lang)} / ${perM(m.prices.output_per_m, lang)}`}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ModelRow({ m }: { m: Model }) {
  const { t, lang } = useI18n();
  const M = t.models;
  return (
    <Link href={`/models/${m.id}`} className="mrow">
      <ProviderLogo author={m.author} size={48} />
      <div className="grow" style={{ display: "grid", gap: 6 }}>
        <div className="row-wrap" style={{ ["--gap" as string]: "10px" }}>
          <span className="h3">{m.name}</span>
          <span className="mono faint small">{m.id}</span>
          {m.is_free && <span className="tag tag-ok">{t.common.free}</span>}
          {m.in_plans && !m.is_free && <span className="tag tag-signal">{M.inPlan}</span>}
          {m.open_weights && <span className="tag">{M.openWeights}</span>}
        </div>
        <p className="muted small">{m.description}</p>
        <div className="row-wrap small faint" style={{ ["--gap" as string]: "14px" }}>
          <span>{m.author}</span>
          {m.capabilities.map((c) => <span key={c}>· {M.cap[c] ?? c}</span>)}
        </div>
      </div>
      <dl className="mrow-nums">
        <div><dt className="label">{M.context}</dt><dd className="num">{ctx(m.context_length)}</dd></div>
        {m.modality === "image" ? (
          <div><dt className="label">{M.perImage}</dt><dd className="num">{perM(m.prices.image, lang)}</dd></div>
        ) : (
          <>
            <div><dt className="label">{M.input}</dt><dd className="num">{perM(m.prices.input_per_m, lang)}</dd></div>
            <div><dt className="label">{M.output}</dt><dd className="num">{perM(m.prices.output_per_m, lang)}</dd></div>
          </>
        )}
      </dl>
    </Link>
  );
}
