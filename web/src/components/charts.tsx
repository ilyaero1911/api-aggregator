"use client";

import { useState } from "react";

type Series = { key: string; color: string; label: string };

/**
 * Столбики по времени, стек из нескольких серий. Без библиотек: SVG и подсказка на hover.
 * Для одиночных значений тоже подходит (одна серия).
 */
export function Bars<T extends Record<string, number | string>>({ data, series, xLabel, format, height = 180 }: {
  data: T[]; series: Series[]; xLabel: (row: T) => string; format: (v: number) => string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, pad = 2;
  const totals = data.map((d) => series.reduce((s, x) => s + Number(d[x.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const n = Math.max(data.length, 1);
  const bw = W / n;
  const gap = Math.min(6, bw * 0.25);
  const barW = Math.min(Math.max(1, bw - gap), W / 14);
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <div className="chart-plot" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} onMouseLeave={() => setHover(null)}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--rule)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          ))}
          {data.map((d, i) => {
            let y = H;
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
                {series.map((s) => {
                  const v = Number(d[s.key] || 0);
                  const bh = (v / max) * (H - pad);
                  y -= bh;
                  return <rect key={s.key} x={i * bw + (bw - barW) / 2} y={y} width={barW} height={bh}
                    fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
                })}
              </g>
            );
          })}
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--ink)" vectorEffect="non-scaling-stroke" />
        </svg>
        {h && hover !== null && (
          <div className="chart-tip" style={{ left: `${((hover + 0.5) / n) * 100}%` }}>
            <div className="label">{xLabel(h)}</div>
            {series.map((s) => (
              <div key={s.key} className="row small" style={{ gap: 6 }}>
                <span className="dot" style={{ color: s.color }} />
                <span className="muted">{s.label}</span>
                <span className="num" style={{ marginLeft: "auto" }}>{format(Number(h[s.key] || 0))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="chart-x">
        {data.length > 0 && <span>{xLabel(data[0])}</span>}
        {data.length > 2 && <span>{xLabel(data[Math.floor(data.length / 2)])}</span>}
        {data.length > 1 && <span>{xLabel(data[data.length - 1])}</span>}
      </div>
      {series.length > 1 && (
        <div className="row small" style={{ gap: 16, marginTop: 8 }}>
          {series.map((s) => (
            <span key={s.key} className="row muted" style={{ gap: 6 }}><span className="dot" style={{ color: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Горизонтальные доли: модель — полоса — значение. */
export function Shares({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="shares">
      {rows.map((r) => (
        <div key={r.label} className="share-row">
          <div className="spread small">
            <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span className="num">{format(r.value)}</span>
          </div>
          <div className="share-track"><div className="share-bar" style={{ width: `${(r.value / max) * 100}%` }} /></div>
          {r.sub && <div className="hint">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}
