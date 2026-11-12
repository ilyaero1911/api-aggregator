/** Схема маршрута для главной: приложение → шлюз → провайдеры, один путь подсвечен. */
export function RouteDiagram({ providers }: { providers: string[] }) {
  const list = providers.slice(0, 6);
  const H = 300, rowH = H / list.length;
  return (
    <svg viewBox={`0 0 520 ${H}`} width="100%" role="img" aria-label="route" style={{ maxWidth: 560 }}>
      <g fontFamily="var(--font-mono)" fontSize="11" letterSpacing=".06em">
        <text x="0" y={H / 2 - 18} fill="var(--ink-3)">YOUR APP</text>
        <rect x="0" y={H / 2 - 8} width="96" height="16" fill="var(--ink)" />
        <text x="8" y={H / 2 + 4} fill="var(--paper)">POST /v1</text>
        <line x1="96" y1={H / 2} x2="210" y2={H / 2} stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx="230" cy={H / 2} r="20" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx="230" cy={H / 2} r="6" fill="var(--signal)" />
        <text x="200" y={H / 2 + 40} fill="var(--ink-3)">GATEWAY</text>
        {list.map((p, i) => {
          const y = rowH * i + rowH / 2;
          const hot = i === 1;
          return (
            <g key={p}>
              <path d={`M250 ${H / 2} C 320 ${H / 2}, 330 ${y}, 380 ${y}`} fill="none"
                stroke={hot ? "var(--signal)" : "var(--rule-2)"} strokeWidth={hot ? 2 : 1} strokeDasharray={i === 0 ? "3 4" : undefined} />
              <circle cx="386" cy={y} r="4" fill={hot ? "var(--signal)" : "var(--paper)"} stroke={hot ? "var(--signal)" : "var(--ink-3)"} />
              <text x="398" y={y + 4} fill={hot ? "var(--ink)" : "var(--ink-2)"}>{p.toUpperCase()}</text>
              {i === 0 && <text x="398" y={y + 18} fill="var(--bad)" fontSize="10">503 → NEXT</text>}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
