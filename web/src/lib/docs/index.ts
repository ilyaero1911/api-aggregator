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
