/**
 * Набор иконок в одном стиле: сетка 24, линия 1.6, скруглённые концы, акцентная деталь цветом currentColor.
 * Рисованы вручную, чтобы не тянуть библиотеку и держать единый характер.
 */
import type { SVGProps } from "react";

export type IconName =
  | "overview" | "chat" | "image" | "preset" | "key" | "shieldKey" | "wallet" | "logs" | "settings" | "cube" | "book"
  | "users" | "repeat" | "card" | "receipt" | "pulse" | "server" | "tag" | "ticket" | "history" | "coins" | "trophy"
  | "logout" | "search" | "plus" | "copy" | "check" | "arrow" | "chevron" | "sparkle" | "bolt" | "route" | "globe"
  | "lock" | "send" | "stop" | "trash" | "edit" | "download" | "refresh" | "menu" | "close" | "home" | "admin" | "sun" | "moon" | "contrast" | "eye" | "eyeOff" | "info" | "warn";

const P: Record<IconName, React.ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="9" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="15.5" width="7" height="5" rx="2" /></>,
  chat: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" /><path d="M8.5 9.2h7M8.5 12.2h4" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 4.6-4.2a1.5 1.5 0 0 1 2 0L15 16.5l1.6-1.5a1.5 1.5 0 0 1 2 0L20 16.3" /></>,
  preset: <><path d="M5 7h6M15 7h4M5 17h3M12 17h7M5 12h10M19 12h0" /><circle cx="13" cy="7" r="2" /><circle cx="10" cy="17" r="2" /><circle cx="17" cy="12" r="2" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.9 12.1 7.6-7.6M15.5 7.5l2.5 2.5M13.5 9.5l1.8 1.8" /></>,
  shieldKey: <><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" /><circle cx="12" cy="10.5" r="2" /><path d="M12 12.5v3.5M12 14.5h1.5" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M16 13.5h1.5" /></>,
  logs: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m7.5 9 2.5 2.5L7.5 14M12 14.5h4.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>,
  cube: <><path d="m12 3.5 7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z" /><path d="m4.8 7.9 7.2 4.1 7.2-4.1M12 12v8.3" /></>,
  book: <><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5z" /><path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19M9 8h6" /></>,
  users: <><circle cx="9" cy="9" r="3.2" /><path d="M3.8 19c.6-3 2.7-4.6 5.2-4.6s4.6 1.6 5.2 4.6" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.4 14.6c1.6.6 2.6 2 2.9 4.4" /></>,
  repeat: <><path d="M17 4.5 19.5 7 17 9.5" /><path d="M4.5 11.5V10A3 3 0 0 1 7.5 7h12" /><path d="M7 19.5 4.5 17 7 14.5" /><path d="M19.5 12.5V14a3 3 0 0 1-3 3h-12" /></>,
  card: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M3.5 10h17M7 14.5h3" /></>,
  receipt: <><path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" /><path d="M9 8h6M9 11.5h6M9 15h3" /></>,
  pulse: <path d="M3.5 12.5h3.8l2.2-5 4 10 2.4-5h4.6" />,
  server: <><rect x="4" y="4.5" width="16" height="6" rx="2" /><rect x="4" y="13.5" width="16" height="6" rx="2" /><path d="M7.5 7.5h.01M7.5 16.5h.01M11 7.5h5M11 16.5h5" /></>,
  tag: <><path d="M4 12.2V5.5A1.5 1.5 0 0 1 5.5 4h6.7l8 8a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8.5" cy="8.5" r="1.4" /></>,
  ticket: <><path d="M4 8a2 2 0 0 0 0 4v0a2 2 0 0 0 0 4v1.5h16V16a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6.5H4z" /><path d="M14 7v2M14 11v2M14 15v2" /></>,
  history: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4 4.5v3.8h3.8M12 8v4.3l2.8 1.7" /></>,
  coins: <><ellipse cx="9" cy="7.5" rx="5" ry="2.5" /><path d="M4 7.5v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4" /><path d="M10 16.2c.9.2 1.9.3 3 .3 2.8 0 5-1.1 5-2.5v-4c0-1.2-1.6-2.2-3.8-2.5" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5M12 13v3.5M8.5 20h7M10 16.5h4V20h-4z" /></>,
  logout: <><path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7" /><path d="m16 8.5 3.5 3.5-3.5 3.5M19.5 12H10" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m19.5 19.5-4-4" /></>,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  sparkle: <><path d="M12 3.5c.6 4.3 2.4 6.3 7 7-4.6.7-6.4 2.7-7 7-.6-4.3-2.4-6.3-7-7 4.6-.7 6.4-2.7 7-7z" /><path d="M18.5 3.5v3M17 5h3" /></>,
  bolt: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z" />,
  route: <><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M6 15.8V12a4 4 0 0 1 4-4h5.8M15 11l3 3-3 3M8.2 14H18" /></>,
  globe: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8s1-5.7 3.2-8z" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" /></>,
  send: <path d="M4.5 12 19.5 4.5 15 19.5l-3.2-6.3zM11.8 13.2 19.5 4.5" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />,
  trash: <><path d="M5 7h14M10 4h4M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" /><path d="M10.5 11v5M13.5 11v5" /></>,
  edit: <><path d="M14.5 5.5 18.5 9.5 9 19H5v-4z" /><path d="m12.5 7.5 4 4" /></>,
  download: <path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v3.8h-3.8" /></>,
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  home: <><path d="m4 11 8-6.5 8 6.5" /><path d="M6 9.5V19h12V9.5M10 19v-5h4v5" /></>,
  admin: <><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  sun: <><circle cx="12" cy="12" r="3.8" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-3.2 4M6.5 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1" /><path d="M10 10.2a2.8 2.8 0 0 0 3.8 3.8" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8h.01" /></>,
  warn: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17h.01" /></>,
  contrast: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></>,
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="icon" {...rest}>
      {P[name]}
    </svg>
  );
}
