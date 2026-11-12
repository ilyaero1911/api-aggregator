"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { DEMO_EN, DEMO_RU, type Demo } from "@/lib/demo-prompts";
import { Icon } from "./icons";

/**
 * Интерактивная сцена шлюза для главной.
 * Можно написать вопрос и отправить его, выбрать стратегию маршрута, «уронить» провайдера кликом.
 * Фоновые запросы идут сами, чтобы сцена жила и без участия.
 */
type Prov = { id: string; name: string; color: string; base: number; price: number };
const PROVS: Prov[] = [
  { id: "anthropic", name: "Anthropic", color: "#d97757", base: 420, price: 1.5 },
  { id: "openai", name: "OpenAI", color: "#10a37f", base: 360, price: 1.0 },
  { id: "google", name: "Google", color: "#4285f4", base: 300, price: 0.8 },
  { id: "deepseek", name: "DeepSeek", color: "#4d6bfe", base: 520, price: 0.15 },
  { id: "qwen", name: "Qwen", color: "#7c5cff", base: 460, price: 0.2 },
];
type Strategy = "price" | "speed" | "rr";
type Packet = { id: number; stage: "in" | "out" | "back" | "reply"; to: number; from?: number; t: number; user?: boolean; hops: number };
type Reply = { text: string; shown: number; meta: string; done: boolean };

const W = 600, H = 360, GX = 270, GY = H / 2, PX = 430;

export function GatewayScene() {
  const { lang } = useI18n();
  const ru = lang !== "en";
  const rowH = H / PROVS.length;
  const py = (i: number) => rowH * i + rowH / 2;
  const [down, setDown] = useState<boolean[]>(PROVS.map(() => false));
  const [lat, setLat] = useState<number[]>(PROVS.map((p) => p.base));
  const strategy = "rr" as Strategy;
  const auto = true;
  const bank: Demo[] = ru ? DEMO_RU : DEMO_EN;
  const pick3 = (exclude: number[] = []) => {
    const pool = bank.map((_, i) => i).filter((i) => !exclude.includes(i));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  };
  const [shown, setShown] = useState<number[]>(() => [0, 1, 2]);
  const [taps, setTaps] = useState<number[]>([]);
  useEffect(() => { setShown(pick3()); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ru]);
  // одна из подсказок сама меняется раз в несколько секунд
  useEffect(() => {
    const id = setInterval(() => setShown((s) => { const n = [...s]; const k = Math.floor(Math.random() * 3); n[k] = pick3(s)[0]; return n; }), 7000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ru]);
  const [hover, setHover] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [stats, setStats] = useState({ sent: 0, ok: 0, rerouted: 0 });
  const [flash, setFlash] = useState<{ i: number; ok: boolean; k: number } | null>(null);
  const [, tick] = useState(0);
  const packets = useRef<Packet[]>([]);
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const inPath = useRef<SVGPathElement | null>(null);
  const st = useRef({ down, lat, strategy, auto });
  st.current = { down, lat, strategy, auto };
  const seq = useRef(0), rr = useRef(0), askIdx = useRef(-1);

  // живые задержки провайдеров
  useEffect(() => {
    const id = setInterval(() => setLat(PROVS.map((p) => Math.round(p.base * (0.75 + Math.random() * 0.5)))), 1400);
    return () => clearInterval(id);
  }, []);

  const ranking = useCallback((): number[] => {
    const idx = PROVS.map((_, i) => i);
    const { strategy: s, lat: l } = st.current;
    if (s === "price") return idx.sort((a, b) => PROVS[a].price - PROVS[b].price);
    if (s === "speed") return idx.sort((a, b) => l[a] - l[b]);
    const start = rr.current++ % PROVS.length;
    return idx.map((_, k) => (start + k) % PROVS.length);
  }, []);

  const fire = useCallback((user = false) => {
    const order = ranking();
    packets.current.push({ id: ++seq.current, stage: "in", to: order[0], t: 0, user, hops: 0 });
    setStats((x) => ({ ...x, sent: x.sent + 1 }));
  }, [ranking]);

  const send = (text?: string) => {
    const q = (text ?? prompt).trim() || bank[shown[0]].q;
    askIdx.current = bank.findIndex((d) => d.q === q);
    setPrompt(q);
    setReply({ text: "", shown: 0, meta: "", done: false });
    fire(true);
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      acc += dt;
      if (st.current.auto && acc > 1300 && !document.hidden) { acc = 0; fire(false); }
      const keep: Packet[] = [];
      for (const p of packets.current) {
        const dur = p.stage === "in" ? 600 : p.stage === "out" ? 700 : p.stage === "back" ? 380 : 650;
        p.t += dt / dur;
        if (p.t < 1) { keep.push(p); continue; }
        if (p.stage === "in") { p.stage = "out"; p.t = 0; keep.push(p); continue; }
        if (p.stage === "out") {
          if (st.current.down[p.to]) {
            setFlash({ i: p.to, ok: false, k: p.id });
            const order = ranking().filter((i) => !st.current.down[i] && i !== p.to);
            if (!order.length) continue;
            p.from = p.to; p.to = order[0]; p.stage = "back"; p.t = 0; p.hops++;
            setStats((x) => ({ ...x, rerouted: x.rerouted + 1 }));
            keep.push(p);
          } else {
            setFlash({ i: p.to, ok: true, k: p.id });
            setStats((x) => ({ ...x, ok: x.ok + 1 }));
            if (p.user) {
              const d = bank[askIdx.current] ?? bank[Math.floor(Math.random() * bank.length)];
              const ans = askIdx.current >= 0 ? d.a[Math.floor(Math.random() * 4)] : (ru ? "Ответ на ваш вопрос пришёл через шлюз. Здесь тестовый режим: подключите API-ключ, чтобы получить настоящий ответ модели." : "The answer came back through the gateway. This is a demo: connect an API key to get a real model answer.");
              const ms = st.current.lat[p.to] + p.hops * 140;
              const cost = (0.002 + PROVS[p.to].price * 0.03).toFixed(3);
              setReply({ text: ans, shown: 0, done: false, meta: `${PROVS[p.to].name} · ${ms} ms · ${ru ? cost.replace(".", ",") + " ₽" : "$" + (Number(cost) / 83).toFixed(4)}${p.hops ? (ru ? " · через запасной маршрут" : " · via backup route") : ""}` });
            }
            p.stage = "reply"; p.from = p.to; p.t = 0; keep.push(p);
          }
          continue;
        }
        if (p.stage === "back") { p.stage = "out"; p.t = 0; keep.push(p); continue; }
        // reply закончился у шлюза
      }
      packets.current = keep;
      tick((x) => (x + 1) % 1e6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fire, ranking, ru]);

  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 450); return () => clearTimeout(id); }, [flash]);

  // печать ответа
  useEffect(() => {
    if (!reply || reply.done || !reply.text) return;
    if (reply.shown >= reply.text.length) { setReply({ ...reply, done: true }); return; }
    const id = setTimeout(() => setReply({ ...reply, shown: reply.shown + 2 }), 22);
    return () => clearTimeout(id);
  }, [reply]);

  const at = (p: Packet) => {
    const el = p.stage === "in" ? inPath.current : paths.current[p.stage === "back" || p.stage === "reply" ? p.from! : p.to];
    if (!el) return { x: GX, y: GY };
    const L = el.getTotalLength();
    const f = p.stage === "in" ? p.t : p.stage === "out" ? p.t : 1 - p.t;
    return el.getPointAtLength(L * f);
  };
  const toggle = (i: number) => setDown((d) => {
    const n = [...d]; n[i] = !n[i];
    if (n.every(Boolean)) n[(i + 1) % n.length] = false;
    return n;
  });

  return (
    <div className="gw">
      <div className="gw-stage">
        <svg viewBox={`0 0 ${W} ${H}`} className="gw-svg" aria-hidden>
          <defs>
            <filter id="gwGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <radialGradient id="gwCore"><stop offset="0" stopColor="var(--signal)" stopOpacity=".55" /><stop offset="1" stopColor="var(--signal)" stopOpacity="0" /></radialGradient>
          </defs>
          <path ref={inPath} d={`M120 ${GY} L${GX - 30} ${GY}`} className="gw-line gw-line-in" />
          {PROVS.map((p, i) => (
            <path key={p.id} ref={(el) => { paths.current[i] = el; }} d={`M${GX + 30} ${GY} C ${GX + 100} ${GY}, ${PX - 90} ${py(i)}, ${PX - 4} ${py(i)}`}
              className={`gw-line${down[i] ? " is-down" : ""}${hover === i ? " is-hover" : ""}`} />
          ))}
          <circle cx={GX} cy={GY} r="54" fill="url(#gwCore)" className="gw-halo" />
          <circle cx={GX} cy={GY} r="30" className="gw-core" />
          <path d={`M${GX - 9} ${GY + 8} L${GX - 2} ${GY} M${GX - 2} ${GY} C${GX + 2} ${GY - 5} ${GX + 5} ${GY - 8} ${GX + 10} ${GY - 10} M${GX - 2} ${GY} C${GX + 3} ${GY} ${GX + 6} ${GY + 2} ${GX + 10} ${GY + 5}`} className="gw-core-mark" />
          {packets.current.map((p) => {
            const pt = at(p);
            const cls = p.stage === "back" ? "gw-pk bad" : p.stage === "reply" ? "gw-pk ok" : p.user ? "gw-pk user" : "gw-pk";
            return <circle key={p.id} cx={pt.x} cy={pt.y} r={p.user ? 6 : 4} className={cls} filter="url(#gwGlow)" />;
          })}
        </svg>

        <button className="gw-app" style={{ top: `${(GY / H) * 100}%` }} title={ru ? "Нажмите, чтобы отправить запрос" : "Click to send a request"}
          onClick={() => { fire(false); const k = Date.now(); setTaps((t) => [...t.slice(-6), k]); setTimeout(() => setTaps((t) => t.filter((x) => x !== k)), 600); }}>
          <Icon name="bolt" size={16} />
          <span>{ru ? "Ваше приложение" : "Your app"}</span>
          {taps.map((k) => <i key={k} className="gw-tap" />)}
        </button>
        <div className="gw-hint" style={{ top: `${((GY + 34) / H) * 100}%` }}>{ru ? "жмите — полетят запросы" : "click to send requests"}</div>
        <div className="gw-label" style={{ left: `${(GX / W) * 100}%`, top: `${((GY + 46) / H) * 100}%` }}>{ru ? "шлюз" : "gateway"}</div>

        {PROVS.map((p, i) => (
          <button key={p.id} className={`gw-node${down[i] ? " down" : ""}${flash?.i === i ? (flash.ok ? " hit" : " miss") : ""}`}
            style={{ left: `${(PX / W) * 100}%`, top: `${(py(i) / H) * 100}%` }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => toggle(i)}
            title={down[i] ? (ru ? "Вернуть провайдера" : "Restore provider") : (ru ? "Уронить провайдера" : "Take provider down")}>
            <span className="gw-ava" style={{ background: p.color }}>{p.name[0]}</span>
            <span className="gw-name">{p.name}</span>
            <span className="gw-ms">{down[i] ? (ru ? "лежит" : "down") : `${lat[i]} ms`}</span>
          </button>
        ))}
      </div>

      <form className="gw-ask" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={ru ? "Спросите что-нибудь — запрос пройдёт через шлюз" : "Ask something — the request goes through the gateway"} autoComplete="off" />
        <button className="btn btn-signal" aria-label="send"><Icon name="send" size={16} /></button>
      </form>
      <div className="gw-ex">
        {shown.map((i, slot) => <button key={bank[i].q} className="chip gw-chip" onClick={() => { setPrompt(bank[i].q); send(bank[i].q); setShown((s) => { const n = [...s]; n[slot] = pick3(s)[0]; return n; }); }}>{bank[i].q}</button>)}
      </div>
      {reply && (
        <div className="gw-reply">
          <p>{reply.text.slice(0, reply.shown)}{!reply.done && <span className="caret" />}</p>
          {reply.meta && reply.done && <div className="hint">{reply.meta}</div>}
          {!reply.text && <div className="hint">{ru ? "Ищем свободного провайдера…" : "Finding an available provider…"}</div>}
        </div>
      )}
      <div className="gw-stats">
        <span>{ru ? "Запросов" : "Requests"} <b>{stats.sent}</b></span>
        <span>{ru ? "Успешно" : "Succeeded"} <b className="ok">{stats.ok}</b></span>
        <span>{ru ? "Спасено обходом" : "Saved by failover"} <b className="signal">{stats.rerouted}</b></span>
        <span className="faint">{ru ? "Кликните по провайдеру, чтобы его «уронить»" : "Click a provider to take it down"}</span>
      </div>
    </div>
  );
}
