/**
 * Документация хранится как данные: страницы из блоков. Текст поддерживает `код`, **жирный** и [ссылки](/docs/...).
 * {BASE} в тексте и коде заменяется на адрес API.
 */
export type Code = { label: string; code: string };
export type Block =
  | ["p", string]
  | ["h2", string]
  | ["h3", string]
  | ["ul", string[]]
  | ["ol", string[]]
  | ["code", Code[]]
  | ["note" | "tip" | "warn", string]
  | ["params", [name: string, type: string, required: boolean, desc: string][]]
  | ["table", string[], string[][]]
  | ["cards", [title: string, desc: string, href: string][]]
  | ["steps", [title: string, text: string][]]
  | ["endpoint", method: string, path: string];

export type Page = { slug: string; title: string; desc: string; blocks: Block[] };
export type Group = { title: string; pages: Page[] };
export type Tab = { id: string; title: string; groups: Group[] };
