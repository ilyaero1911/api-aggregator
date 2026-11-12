"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";

/* ---------- тосты ---------- */
type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, bad }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.bad ? " bad" : ""}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- модальное окно на <dialog> ---------- */
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} style={wide ? { width: "min(760px, calc(100vw - 32px))" } : undefined}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="modal-head">
            <h2 className="h3">{title}</h2>
            <button className="x-btn" onClick={onClose} aria-label="close">×</button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/* ---------- подтверждение ---------- */
export function useConfirm() {
  const [state, setState] = useState<{ text: string; resolve: (v: boolean) => void; danger?: boolean } | null>(null);
  const { t } = useI18n();
  const ask = useCallback((text: string, danger = true) => new Promise<boolean>((resolve) => setState({ text, resolve, danger })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const node = (
    <Modal open={!!state} onClose={() => close(false)} title={t.common.confirm}
      footer={<>
        <button className="btn btn-ghost" onClick={() => close(false)}>{t.common.cancel}</button>
        <button className={`btn ${state?.danger ? "btn-danger" : ""}`} onClick={() => close(true)} autoFocus>{t.common.confirm}</button>
      </>}>
      <p>{state?.text}</p>
    </Modal>
  );
  return { ask, node };
}

/* ---------- шторка справа ---------- */
export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer">{children}</aside>
    </>
  );
}

/* ---------- копирование ---------- */
export function CopyButton({ text, className = "btn btn-ghost btn-sm" }: { text: string; className?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button className={className} type="button" onClick={async () => {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    }}>{done ? t.common.copied : t.common.copy}</button>
  );
}

/** Подсветка без библиотек: ключевые слова, строки, комментарии. */
function highlight(code: string): ReactNode[] {
  const re = /(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(import|from|const|await|async|for|in|print|curl|def|return|new|let)\b/g;
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = m[1] ? "c" : m[2] ? "s" : "k";
    out.push(<span key={i++} className={cls}>{m[0]}</span>);
    last = re.lastIndex;
  }
  out.push(code.slice(last));
  return out;
}

export function CodeBlock({ code, lang, tabs }: { code?: string; lang?: string; tabs?: { label: string; code: string }[] }) {
  const [tab, setTab] = useState(0);
  const items = tabs ?? [{ label: lang ?? "", code: code ?? "" }];
  const cur = items[tab] ?? items[0];
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <div className="code">
      <div className="code-bar">
        <div className="row" style={{ gap: 14 }}>
          {items.map((it, i) => (
            <span key={it.label} onClick={() => setTab(i)} style={{ cursor: "pointer", color: i === tab ? "#ece8dd" : undefined }}>{it.label}</span>
          ))}
        </div>
        <button onClick={async () => { await navigator.clipboard.writeText(cur.code); setDone(true); setTimeout(() => setDone(false), 1200); }}>
          {done ? t.common.copied : t.common.copy}
        </button>
      </div>
      <pre>{highlight(cur.code)}</pre>
    </div>
  );
}

/* ---------- мелочи ---------- */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (o: number) => void }) {
  const { t } = useI18n();
  if (total <= limit) return null;
  return (
    <div className="pager">
      <span className="mono">{offset + 1}–{Math.min(offset + limit, total)} {t.common.of} {total}</span>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>← {t.common.prev}</button>
        <button className="btn btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>{t.common.next} →</button>
      </div>
    </div>
  );
}

export function PageHead({ title, lead, actions, index }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; index?: string }) {
  return (
    <header className="page-head">
      <div>
        {index && <div className="label" style={{ marginBottom: 10 }}>{index}</div>}
        <h1 className="h1">{title}</h1>
        {lead && <p className="muted" style={{ marginTop: 8, maxWidth: 640 }}>{lead}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Skeleton({ h = 18, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

/** Хук загрузки с повтором. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1), setData };
}
