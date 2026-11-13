"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { entriesFor, tabsFor, type Entry } from "@/lib/docs";
import type { Block } from "@/lib/docs/types";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "./icons";
import { CodeBlock } from "./ui";

/** Документация в духе современных docs-сайтов: вкладки, разделы, оглавление страницы, поиск, «назад/далее». */
export function DocsApp({ slug, base, apiBase, inShell }: { slug?: string[]; base: string; apiBase: string; inShell?: boolean }) {
  const { lang } = useI18n();
  const en = lang === "en";
  const ENTRIES = entriesFor(lang), TABS = tabsFor(lang);
  const key = (slug ?? []).join("/");
  const cur = ENTRIES.find((e) => e.path === key) ?? ENTRIES[0];
  const sub = (s: string) => s.replaceAll("{BASE}", apiBase);
  const href = (path: string) => `${base}/${path}`;
  const fixLink = (h: string) => (h.startsWith("/docs/") ? base + h.slice(5) : h);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [active, setActive] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setMenu(false); window.scrollTo({ top: 0 }); }, [cur.path]);

  const toc = cur.page.blocks.flatMap((b, i) => (b[0] === "h2" || b[0] === "h3" ? [{ id: `s${i}`, text: b[1] as string, level: b[0] }] : []));
  useEffect(() => {
    const obs = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-90px 0px -65% 0px" });
    document.querySelectorAll(".dx-anchor").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [cur.path]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return ENTRIES.filter((e) => `${e.page.title} ${e.page.desc} ${JSON.stringify(e.page.blocks)}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, ENTRIES]);

  const tabEntries = ENTRIES.filter((e) => e.tab.id === cur.tab.id);
  const idx = tabEntries.findIndex((e) => e.path === cur.path);
  const prev = tabEntries[idx - 1], next = tabEntries[idx + 1];

  const inline = (text: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0, m: RegExpExecArray | null, k = 0;
    const t = sub(text);
    while ((m = re.exec(t))) {
      if (m.index > last) out.push(t.slice(last, m.index));
      if (m[1]) out.push(<code key={k++} className="dx-code">{m[1]}</code>);
      else if (m[2]) out.push(<b key={k++}>{m[2]}</b>);
      else out.push(<Link key={k++} href={fixLink(m[4])} className="dx-link">{m[3]}</Link>);
      last = re.lastIndex;
    }
    out.push(t.slice(last));
    return out;
  };

  const render = (b: Block, i: number): ReactNode => {
    switch (b[0]) {
      case "p": return <p key={i}>{inline(b[1])}</p>;
      case "h2": return <h2 key={i} id={`s${i}`} className="dx-anchor dx-h2"><a href={`#s${i}`}>{b[1]}</a></h2>;
      case "h3": return <h3 key={i} id={`s${i}`} className="dx-anchor dx-h3">{b[1]}</h3>;
      case "ul": return <ul key={i} className="dx-list">{b[1].map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>;
      case "ol": return <ol key={i} className="dx-list">{b[1].map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>;
      case "code": return <div key={i} className="dx-codeblock"><CodeBlock tabs={b[1].map((c) => ({ label: c.label, code: sub(c.code) }))} /></div>;
      case "note": case "tip": case "warn": {
        const icon = b[0] === "warn" ? "warn" : b[0] === "tip" ? "sparkle" : "info";
        return <div key={i} className={`dx-callout dx-${b[0]}`}><Icon name={icon} size={18} /><div>{inline(b[1])}</div></div>;
      }
      case "params": return (
        <div key={i} className="dx-params">
          {b[1].map(([n, t, req, d]) => (
            <div key={n} className="dx-param">
              <div className="dx-param-head"><code>{n}</code><span className="dx-type">{t}</span>{req && <span className="dx-req">{en ? "required" : "обязательно"}</span>}</div>
              <p>{inline(d)}</p>
            </div>
          ))}
        </div>
      );
      case "table": return (
        <div key={i} className="dx-table"><table>
          {b[1].some(Boolean) && <thead><tr>{b[1].map((h) => <th key={h}>{h}</th>)}</tr></thead>}
          <tbody>{b[2].map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>
      );
      case "cards": return (
        <div key={i} className="dx-cards">{b[1].map(([t, d, h]) => <Link key={t} href={fixLink(h)} className="dx-card"><b>{t}</b><span>{d}</span><Icon name="arrow" size={15} /></Link>)}</div>
      );
      case "steps": return (
        <ol key={i} className="dx-steps">{b[1].map(([t, d], j) => <li key={j}><span className="dx-step-n">{j + 1}</span><div><b>{t}</b><p>{inline(d)}</p></div></li>)}</ol>
      );
      case "endpoint": return <div key={i} className="dx-endpoint"><span className={`dx-method m-${b[1].toLowerCase()}`}>{b[1]}</span><code>{sub("{BASE}")}{b[2]}</code></div>;
    }
  };

  const copyPage = async () => {
    const md = [`# ${cur.page.title}`, cur.page.desc, ...cur.page.blocks.map((b) => {
      if (b[0] === "h2") return `## ${b[1]}`; if (b[0] === "h3") return `### ${b[1]}`;
      if (b[0] === "p" || b[0] === "note" || b[0] === "tip" || b[0] === "warn") return b[1];
      if (b[0] === "ul" || b[0] === "ol") return b[1].map((x) => `- ${x}`).join("\n");
      if (b[0] === "code") return b[1].map((c) => "```\n" + c.code + "\n```").join("\n");
      if (b[0] === "params") return b[1].map(([n, t, , d]) => `- \`${n}\` (${t}): ${d}`).join("\n");
      if (b[0] === "endpoint") return `${b[1]} ${b[2]}`;
      return "";
    })].join("\n\n");
    await navigator.clipboard.writeText(sub(md));
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };

  const sidebar = (
    <nav className="dx-nav">
      <div className="dx-search">
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={en ? "Search docs" : "Поиск по документации"} />
        {results.length > 0 && (
          <div className="dx-results">{results.map((r) => <Link key={r.path} href={href(r.path)} onClick={() => setQ("")}><b>{r.page.title}</b><span>{r.tab.title} · {r.group}</span></Link>)}</div>
        )}
      </div>
      {cur.tab.groups.map((g) => (
        <div key={g.title} className="dx-group">
          <div className="label">{g.title}</div>
          {ENTRIES.filter((e) => e.tab.id === cur.tab.id && e.group === g.title).map((e) => (
            <Link key={e.path} href={href(e.path)} aria-current={e.path === cur.path ? "page" : undefined}>{e.page.title}</Link>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className={`dx${inShell ? " in-shell" : " wrap"}`}>
      <div className="dx-tabs">
        {TABS.map((t) => {
          const first = ENTRIES.find((e) => e.tab.id === t.id) as Entry;
          return <Link key={t.id} href={href(first.path)} aria-current={t.id === cur.tab.id ? "page" : undefined}>{t.title}</Link>;
        })}
        <button className="btn btn-ghost btn-sm dx-menu-btn" onClick={() => setMenu((m) => !m)}><Icon name="menu" size={16} />{en ? "Sections" : "Разделы"}</button>
      </div>
      <div className="dx-grid">
        <aside className={`dx-side${menu ? " open" : ""}`}>{sidebar}</aside>
        <article className="dx-main">
          <div className="dx-crumbs">{cur.tab.title} <Icon name="chevron" size={12} style={{ transform: "rotate(-90deg)" }} /> {cur.group}</div>
          <div className="dx-head">
            <h1 className="h1">{cur.page.title}</h1>
            <button className="btn btn-ghost btn-sm" onClick={copyPage}><Icon name={copied ? "check" : "copy"} size={15} />{copied ? (en ? "Copied" : "Скопировано") : (en ? "Copy page" : "Копировать страницу")}</button>
          </div>
          <p className="dx-desc">{cur.page.desc}</p>
          <div className="dx-body">{cur.page.blocks.map(render)}</div>
          <div className="dx-pager">
            {prev ? <Link href={href(prev.path)} className="dx-pg"><span className="hint">← {en ? "Previous" : "Назад"}</span><b>{prev.page.title}</b></Link> : <span />}
            {next ? <Link href={href(next.path)} className="dx-pg dx-pg-next"><span className="hint">{en ? "Next" : "Далее"} →</span><b>{next.page.title}</b></Link> : <span />}
          </div>
        </article>
        <aside className="dx-toc">
          {toc.length > 0 && (
            <>
              <div className="label">{en ? "On this page" : "На этой странице"}</div>
              {toc.map((t) => <a key={t.id} href={`#${t.id}`} className={`${t.level === "h3" ? "lvl3" : ""}${active === t.id ? " on" : ""}`}>{t.text}</a>)}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
