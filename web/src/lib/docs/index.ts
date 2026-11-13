import { API_TAB, INTEGRATIONS_TAB } from "./api";
import { ACCOUNT, GATEWAY, GUIDES } from "./guides";
import { START } from "./start";
import type { Page, Tab } from "./types";

export const DOCS_TAB: Tab = { id: "docs", title: "Документация", groups: [START, GATEWAY, GUIDES, ACCOUNT] };
export const TABS: Tab[] = [DOCS_TAB, API_TAB, INTEGRATIONS_TAB];

// Раздел в адресе страницы: /docs/{section}/{slug}
const SECTION = new Map<object, string>([[START, "start"], [GATEWAY, "concepts"], [GUIDES, "guides"], [ACCOUNT, "account"]]);

export type Entry = { tab: Tab; group: string; page: Page; path: string };

export const ENTRIES: Entry[] = TABS.flatMap((tab) =>
  tab.groups.flatMap((g) => g.pages.map((page) => {
    const section = tab.id === "docs" ? SECTION.get(g) ?? "start" : tab.id;
    return { tab, group: g.title, page, path: `${section}/${page.slug}` };
  })));

export function findEntry(slug: string[] | undefined): Entry {
  const key = (slug ?? []).join("/");
  return ENTRIES.find((e) => e.path === key) ?? ENTRIES[0];
}

// Английская версия: те же страницы и адреса, тексты из en.ts, примеры кода берутся из русской версии.
import { EN, EN_GROUPS, EN_TABS } from "./en";
import type { Block } from "./types";

const EN_ENTRIES: Entry[] = (() => {
  const tabs = new Map<string, Tab>(TABS.map((t) => [t.id, { ...t, title: EN_TABS[t.id] ?? t.title, groups: t.groups.map((g) => ({ ...g, title: EN_GROUPS[g.title] ?? g.title })) }]));
  return ENTRIES.map((e) => {
    const tr = EN[e.path];
    const page: Page = tr
      ? { ...e.page, title: tr.title, desc: tr.desc, blocks: tr.blocks.map((b) => (b[0] === "same" ? e.page.blocks[b[1] as number] : b) as Block) }
      : e.page;
    return { tab: tabs.get(e.tab.id) as Tab, group: EN_GROUPS[e.group] ?? e.group, page, path: e.path };
  });
})();

export const entriesFor = (lang: string): Entry[] => (lang === "en" ? EN_ENTRIES : ENTRIES);
export const tabsFor = (lang: string): Tab[] => (lang === "en" ? TABS.map((t) => EN_ENTRIES.find((e) => e.tab.id === t.id)!.tab) : TABS);
