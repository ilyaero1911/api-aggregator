"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ctx, perM } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";
import { Icon } from "./icons";
import { ProviderLogo } from "./provider-logo";
import { Select } from "./select";
import { Seg } from "./ui";

type Sort = "new" | "cheap" | "context" | "name";
const CTX = [
  { id: "lt32", test: (n: number) => n < 32768, label: "< 32K" },
  { id: "32-128", test: (n: number) => n >= 32768 && n <= 131072, label: "32K–128K" },
  { id: "128-256", test: (n: number) => n > 131072 && n <= 262144, label: "128K–256K" },
  { id: "256-1m", test: (n: number) => n > 262144 && n < 1_000_000, label: "256K–1M" },
  { id: "1m", test: (n: number) => n >= 1_000_000, label: "≥ 1M" },
];

/** Каталог моделей. base — путь страниц моделей: /models на сайте, /dashboard/models в кабинете. */
export function Catalog({ models, base = "/models", inShell }: { models: Model[]; base?: string; inShell?: boolean }) {
  const { t, lang } = useI18n();
  const M = t.models;
  const en = lang === "en";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [cat, setCat] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [caps, setCaps] = useState<string[]>([]);
  const [ctxs, setCtxs] = useState<string[]>([]);
  const [prices, setPrices] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "grid">("list");
  const [showFilters, setShowFilters] = useState(false);

  const allAuthors = Array.from(new Set(models.map((m) => m.author))).sort();
  const cats = ["coding", "reasoning", "math", "long-context", "cheap", "open-source", "daily", "free", "images"];
  const priceTest: Record<string, (m: Model) => boolean> = { free: (m) => m.is_free, plan: (m) => m.in_plans, paid: (m) => !m.is_free };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = models.filter((m) =>
      (!s || `${m.name} ${m.id} ${m.author} ${m.description} ${m.categories.join(" ")}`.toLowerCase().includes(s)) &&
      (!cat || m.categories.includes(cat)) &&
      (types.length === 0 || types.includes(m.modality)) &&
      caps.every((c) => m.capabilities.includes(c)) &&
      (ctxs.length === 0 || ctxs.some((id) => CTX.find((x) => x.id === id)!.test(m.context_length))) &&
      (authors.length === 0 || authors.includes(m.author)) &&
      (prices.length === 0 || prices.some((p) => priceTest[p](m))));
    return [...r].sort((a, b) => {
      if (sort === "cheap") return a.prices.input_per_m + a.prices.output_per_m + a.prices.image - (b.prices.input_per_m + b.prices.output_per_m + b.prices.image);
      if (sort === "context") return b.context_length - a.context_length;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.released_at.localeCompare(a.released_at);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, q, cat, types, caps, ctxs, prices, authors, sort]);

  const active = types.length + caps.length + ctxs.length + prices.length + authors.length + (cat ? 1 : 0) + (q ? 1 : 0);
  const reset = () => { setQ(""); setCat(""); setTypes([]); setCaps([]); setCtxs([]); setPrices([]); setAuthors([]); };
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const Check = ({ on, onClick, label, n, logo }: { on: boolean; onClick: () => void; label: string; n: number; logo?: string }) => (
    <button className={`facet${on ? " on" : ""}`} onClick={onClick} aria-pressed={on} disabled={n === 0 && !on}>
      <span className="facet-box">{on && <Icon name="check" size={12} />}</span>
      {logo && <ProviderLogo author={logo} size={22} />}
      <span className="grow">{label}</span>
      <span className="mono">{n}</span>
    </button>
  );
  const count = (pred: (m: Model) => boolean) => models.filter(pred).length;
  const chipsOn: { label: string; off: () => void }[] = [
    ...types.map((v) => ({ label: v === "text" ? M.typeChat : M.typeImage, off: () => toggle(types, setTypes, v) })),
    ...caps.map((v) => ({ label: M.cap[v] ?? v, off: () => toggle(caps, setCaps, v) })),
    ...ctxs.map((v) => ({ label: CTX.find((c) => c.id === v)!.label, off: () => toggle(ctxs, setCtxs, v) })),
    ...prices.map((v) => ({ label: v === "free" ? M.priceFree : v === "plan" ? M.pricePlan : M.pricePaid, off: () => toggle(prices, setPrices, v) })),
    ...authors.map((v) => ({ label: v, off: () => toggle(authors, setAuthors, v) })),
  ];

  return (
    <div className={`${inShell ? "" : "wrap "}catalog${inShell ? " in-shell" : ""}`}>
      <aside className={`facets${showFilters ? " open" : ""}`}>
        <div className="facets-head">
          <b>{en ? "Filters" : "Фильтры"}</b>
          {active > 0 && <button className="link-btn small" onClick={reset}>{en ? "Reset all" : "Сбросить всё"}</button>}
          <button className="x-btn facets-close" onClick={() => setShowFilters(false)} aria-label="close"><Icon name="close" size={18} /></button>
        </div>
        <p className="hint">{en ? "You can tick several options in each group." : "В каждой группе можно отметить несколько пунктов."}</p>
        <div className="label">{M.type}</div>
        <Check on={types.includes("text")} onClick={() => toggle(types, setTypes, "text")} label={M.typeChat} n={count((m) => m.modality === "text")} />
        <Check on={types.includes("image")} onClick={() => toggle(types, setTypes, "image")} label={M.typeImage} n={count((m) => m.modality === "image")} />
        <div className="label">{M.capabilities} <span className="faint">· {en ? "all selected" : "все выбранные сразу"}</span></div>
        {["vision", "tools", "reasoning", "image-to-image"].map((c) => (
          <Check key={c} on={caps.includes(c)} onClick={() => toggle(caps, setCaps, c)} label={M.cap[c]} n={count((m) => m.capabilities.includes(c))} />
        ))}
        <div className="label">{M.context}</div>
        {CTX.map((c) => <Check key={c.id} on={ctxs.includes(c.id)} onClick={() => toggle(ctxs, setCtxs, c.id)} label={c.label} n={count((m) => c.test(m.context_length))} />)}
        <div className="label">{M.price}</div>
        <Check on={prices.includes("free")} onClick={() => toggle(prices, setPrices, "free")} label={M.priceFree} n={count((m) => m.is_free)} />
        <Check on={prices.includes("plan")} onClick={() => toggle(prices, setPrices, "plan")} label={M.pricePlan} n={count((m) => m.in_plans)} />
        <Check on={prices.includes("paid")} onClick={() => toggle(prices, setPrices, "paid")} label={M.pricePaid} n={count((m) => !m.is_free)} />
        <div className="label">{M.author}</div>
        {allAuthors.map((a) => <Check key={a} on={authors.includes(a)} onClick={() => toggle(authors, setAuthors, a)} label={a} n={count((m) => m.author === a)} logo={a} />)}
        <button className="btn facets-apply" onClick={() => setShowFilters(false)}>{en ? `Show ${list.length}` : `Показать ${list.length}`}</button>
      </aside>
      {showFilters && <div className="drawer-back facets-back" onClick={() => setShowFilters(false)} />}

      <section className="grow" style={{ minWidth: 0 }}>
        <div className="page-head" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="h1">{M.title}</h1>
            <p className="muted" style={{ marginTop: 8 }}>{fmt(M.lead, { n: models.length })}</p>
          </div>
          <Link href="/pricing#how" className="btn btn-ghost btn-sm">{en ? "How is the price calculated?" : "Как считается цена?"}</Link>
        </div>
        <div className="cat-tools">
          <div className="cat-search"><Icon name="search" size={16} /><input placeholder={M.search} value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="x-btn" onClick={() => setQ("")}><Icon name="close" size={14} /></button>}</div>
          <button className="btn btn-ghost facets-toggle" onClick={() => setShowFilters(true)}><Icon name="preset" size={16} />{en ? "Filters" : "Фильтры"}{active > 0 && <span className="stop-badge">{active}</span>}</button>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: 190 }}>
            <option value="new">{M.sortNew}</option><option value="cheap">{M.sortCheap}</option>
            <option value="context">{M.sortContext}</option><option value="name">{M.sortName}</option>
          </Select>
          <div className="cat-view"><Seg value={view} onChange={setView} options={[{ value: "list", label: M.list }, { value: "grid", label: M.grid }]} /></div>
        </div>
        <div className="chips">
          <button className={`chip${cat === "" ? " on" : ""}`} onClick={() => setCat("")}>{t.common.all}</button>
          {cats.map((c) => <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(cat === c ? "" : c)}>{M.cat[c]}</button>)}
        </div>
        {chipsOn.length > 0 && (
          <div className="active-filters">
            <span className="hint">{en ? `Found ${list.length}` : `Найдено: ${list.length}`}</span>
            {chipsOn.map((c) => <button key={c.label} className="af" onClick={c.off}>{c.label}<Icon name="close" size={12} /></button>)}
            <button className="link-btn small" onClick={reset}>{en ? "Reset filters" : "Сбросить фильтры"}</button>
          </div>
        )}

        {list.length === 0 ? (
          <div className="empty">{M.nothing}. <button className="link-btn" onClick={reset}>{M.reset}</button></div>
        ) : view === "list" ? (
          <div className="mrows">{list.map((m) => <ModelRow key={m.id} m={m} base={base} />)}</div>
        ) : (
          <div className="mgrid">
            {list.map((m) => (
              <Link key={m.id} href={`${base}/${m.id}`} className="mtile">
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

function ModelRow({ m, base }: { m: Model; base: string }) {
  const { t, lang } = useI18n();
  const M = t.models;
  return (
    <Link href={`${base}/${m.id}`} className="mrow">
      <ProviderLogo author={m.author} size={48} />
      <div className="grow" style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <div className="row-wrap" style={{ ["--gap" as string]: "10px" }}>
          <span className="h3">{m.name}</span>
          <span className="mono faint small mrow-id">{m.id}</span>
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
