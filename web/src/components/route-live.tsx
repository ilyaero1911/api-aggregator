"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/**
 * Живая схема маршрута: запросы бегут от приложения через шлюз к провайдерам.
 * Клик по провайдеру «роняет» его — запросы начинают уходить на запасной маршрут.
 */
type Packet = { id: number; stage: 0 | 1 | 2; target: number; t: number; failedAt?: number; hops: number };
type Log = { id: number; text: string; bad?: boolean };

const W = 560, H = 320, GX = 250, GY = H / 2, PX = 400;

export function RouteLive({ providers, compact = false }: { providers: string[]; compact?: boolean }) {
  const { lang } = useI18n();
  const ru = lang !== "en";
  const list = providers.slice(0, 6);
  const rowH = H / list.length;
  const py = (i: number) => rowH * i + rowH / 2;
  const [down, setDown] = useState<boolean[]>(() => list.map(() => false));
  const [hover, setHover] = useState<number | null>(null);
  const [, force] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState({ sent: 0, ok: 0, rerouted: 0 });
  const packets = useRef<Packet[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const inRef = useRef<SVGPathElement | null>(null);
  const downRef = useRef(down);
  downRef.current = down;
  const seq = useRef(0);
  const rr = useRef(0);

  const log = useCallback((text: string, bad?: boolean) => {
    setLogs((l) => [{ id: ++seq.current, text, bad }, ...l].slice(0, compact ? 3 : 4));
  }, [compact]);

  const pickTarget = (skip?: number) => {
    // round robin между провайдерами, начиная со следующего
    for (let k = 0; k < list.length; k++) {
      const i = (rr.current + k) % list.length;
      if (i !== skip) { rr.current = i + 1; return i; }
    }
    return 0;
  };
  const nextHealthy = (from: number) => {
    for (let k = 1; k <= list.length; k++) {
      const i = (from + k) % list.length;
      if (!downRef.current[i]) return i;
    }
    return -1;
  };

  const send = useCallback(() => {
    packets.current.push({ id: ++seq.current, stage: 0, target: pickTarget(), t: 0, hops: 0 });
    setStats((s) => ({ ...s, sent: s.sent + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now(), acc = 0;
    const speed = reduce ? 0.35 : 1;
    const loop = (now: number) => {
      const dt = Math.min(64, now - last) * speed;
      last = now;
      acc += dt;
      if (acc > 1100) { acc = 0; if (!document.hidden) send(); }
      const keep: Packet[] = [];
      for (const p of packets.current) {
        p.t += dt / (p.stage === 0 ? 650 : p.stage === 1 ? 750 : 420);
        if (p.t >= 1) {
          if (p.stage === 0) { p.stage = 1; p.t = 0; }
          else if (p.stage === 1) {
            if (downRef.current[p.target]) {
              const nx = nextHealthy(p.target);
              log(`→ ${list[p.target]} · 503${nx >= 0 ? ` · ${ru ? "уходим на" : "retry"} ${list[nx]}` : ""}`, true);
              if (nx < 0) continue;
              p.stage = 2; p.t = 0; p.failedAt = p.target; p.target = nx; p.hops++;
              setStats((s) => ({ ...s, rerouted: s.rerouted + 1 }));
            } else {
              const ms = 180 + Math.round(Math.random() * 420) + p.hops * 120;
              log(`→ ${list[p.target]} · 200 · ${ms} ms`);
              setStats((s) => ({ ...s, ok: s.ok + 1 }));
              continue;
            }
          } else { p.stage = 1; p.t = 0; }
        }
        keep.push(p);
      }
      packets.current = keep;
      force((x) => x + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, log]);

  const point = (p: Packet) => {
    if (p.stage === 0) {
      const el = inRef.current;
      if (!el) return { x: 0, y: GY };
      return el.getPointAtLength(el.getTotalLength() * p.t);
    }
    if (p.stage === 2) {
      // возврат от упавшего провайдера к шлюзу
      const el = pathRefs.current[p.failedAt!];
      if (!el) return { x: GX, y: GY };
      return el.getPointAtLength(el.getTotalLength() * (1 - p.t));
    }
    const el = pathRefs.current[p.target];
    if (!el) return { x: GX, y: GY };
    return el.getPointAtLength(el.getTotalLength() * p.t);
  };

  const toggle = (i: number) => {
    setDown((d) => {
      const n = [...d];
      n[i] = !n[i];
      if (n.every(Boolean)) n[(i + 1) % n.length] = false; // хотя бы один маршрут живой
      return n;
    });
  };

  return (
    <div className={`route-live${compact ? " compact" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="live route">
        <g fontFamily="var(--font-mono)" fontSize="11" letterSpacing=".06em">
          <text x="0" y={GY - 18} fill="var(--ink-3)">{ru ? "ВАШЕ ПРИЛОЖЕНИЕ" : "YOUR APP"}</text>
          <g className="rl-app" onClick={send} style={{ cursor: "pointer" }}>
            <rect x="0" y={GY - 9} width="104" height="18" fill="var(--ink)" />
            <text x="8" y={GY + 4} fill="var(--paper)">POST /v1 ▸</text>
          </g>
          <path ref={inRef} d={`M104 ${GY} L${GX - 22} ${GY}`} stroke="var(--ink)" strokeWidth="1.5" fill="none" />
          <circle cx={GX} cy={GY} r="22" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
          <circle cx={GX} cy={GY} r="7" fill="var(--signal)" className="rl-core" />
          <text x={GX - 30} y={GY + 42} fill="var(--ink-3)">{ru ? "ШЛЮЗ" : "GATEWAY"}</text>
          {list.map((p, i) => {
            const y = py(i);
            const isDown = down[i];
            const hot = hover === i;
            return (
              <g key={p} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => toggle(i)} style={{ cursor: "pointer" }}>
                <path ref={(el) => { pathRefs.current[i] = el; }} d={`M${GX + 22} ${GY} C ${GX + 90} ${GY}, ${PX - 70} ${y}, ${PX - 6} ${y}`}
                  fill="none" stroke={isDown ? "var(--bad)" : hot ? "var(--signal)" : "var(--rule-2)"}
                  strokeWidth={hot ? 2 : 1.2} strokeDasharray={isDown ? "3 5" : undefined} />
                <rect x={PX - 8} y={y - 14} width={W - PX + 8} height="28" fill="transparent" />
                <circle cx={PX} cy={y} r="5" fill={isDown ? "var(--paper)" : hot ? "var(--signal)" : "var(--paper)"} stroke={isDown ? "var(--bad)" : "var(--ink-2)"} />
                {isDown && <path d={`M${PX - 3} ${y - 3} L${PX + 3} ${y + 3} M${PX + 3} ${y - 3} L${PX - 3} ${y + 3}`} stroke="var(--bad)" />}
                <text x={PX + 14} y={y + 4} fill={isDown ? "var(--bad)" : hot ? "var(--ink)" : "var(--ink-2)"}>{p.toUpperCase()}</text>
                {(hot || isDown) && <text x={PX + 14} y={y + 17} fontSize="9.5" fill="var(--ink-3)">{isDown ? (ru ? "НЕДОСТУПЕН · КЛИК — ВЕРНУТЬ" : "DOWN · CLICK TO RESTORE") : (ru ? "КЛИК — УРОНИТЬ" : "CLICK TO TAKE DOWN")}</text>}
              </g>
            );
          })}
          {packets.current.map((p) => {
            const pt = point(p);
            return <circle key={p.id} cx={pt.x} cy={pt.y} r={p.stage === 2 ? 4 : 3.5} fill={p.stage === 2 ? "var(--bad)" : "var(--signal)"} />;
          })}
        </g>
      </svg>
      <div className="rl-foot">
        <div className="rl-log mono">
          {logs.map((l) => <div key={l.id} className={l.bad ? "bad" : undefined}>{l.text}</div>)}
          {logs.length === 0 && <div className="faint">{ru ? "ждём первый запрос…" : "waiting for the first request…"}</div>}
        </div>
        {!compact && (
          <div className="rl-stats mono">
            <span>{ru ? "отправлено" : "sent"} <b>{stats.sent}</b></span>
            <span className="ok">200 <b>{stats.ok}</b></span>
            <span className="signal">{ru ? "обход" : "rerouted"} <b>{stats.rerouted}</b></span>
          </div>
        )}
      </div>
      {!compact && <p className="hint">{ru ? "Нажмите на провайдера, чтобы «уронить» его, и посмотрите, как запросы уходят на запасной маршрут." : "Click a provider to take it down and watch requests switch to a backup route."}</p>}
    </div>
  );
}
