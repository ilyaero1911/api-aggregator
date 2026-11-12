"use client";

import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Icon } from "./icons";

type Opt = { value: string; label: ReactNode; text: string };

/**
 * Свой выпадающий список вместо системного. Принимает <option> детьми, как обычный <select>,
 * и вызывает onChange с объектом вида { target: { value } } — старые обработчики работают без правок.
 */
export function Select({ value, onChange, children, style, className = "", disabled, id, defaultValue, placeholder }: {
  value?: string | number; defaultValue?: string; onChange?: (e: { target: { value: string } }) => void; children: ReactNode;
  style?: React.CSSProperties; className?: string; disabled?: boolean; id?: string; placeholder?: string;
}) {
  const opts: Opt[] = useMemo(() => {
    const out: Opt[] = [];
    const walk = (nodes: ReactNode) => Children.forEach(nodes, (c) => {
      if (!isValidElement(c)) return;
      const el = c as ReactElement<{ value?: string | number; children?: ReactNode }>;
      if (el.type === "option") {
        const label = el.props.children;
        const text = Children.toArray(label).map((x) => (typeof x === "string" || typeof x === "number" ? String(x) : "")).join("");
        out.push({ value: String(el.props.value ?? text), label, text });
      } else if (el.props.children) walk(el.props.children);
    });
    walk(children);
    return out;
  }, [children]);
  const [inner, setInner] = useState(String(defaultValue ?? opts[0]?.value ?? ""));
  const cur = value !== undefined ? String(value) : inner;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const sel = opts.find((o) => o.value === cur);
  const searchable = opts.length > 8;
  const shown = q ? opts.filter((o) => o.text.toLowerCase().includes(q.toLowerCase())) : opts;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => { if (open) { setQ(""); setHi(Math.max(0, opts.findIndex((o) => o.value === cur))); } }, [open, opts, cur]);

  const pick = (v: string) => {
    setOpen(false);
    if (value === undefined) setInner(v);
    if (v !== cur) onChange?.({ target: { value: v } });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (shown[hi]) pick(shown[hi].value); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={ref} className={`sel ${open ? "open" : ""} ${className}`} style={style} onKeyDown={onKey}>
      <button type="button" id={id} className="sel-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        onClick={() => setOpen((o) => !o)}>
        <span className="sel-val">{sel?.label ?? <span className="faint">{placeholder ?? "—"}</span>}</span>
        <Icon name="chevron" size={16} className="sel-chev" />
      </button>
      {open && (
        <div className="sel-pop" role="listbox" id={listId}>
          {searchable && (
            <div className="sel-search"><Icon name="search" size={15} /><input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="…" autoComplete="off" /></div>
          )}
          <div className="sel-list">
            {shown.map((o, i) => (
              <div key={o.value} role="option" aria-selected={o.value === cur} className={`sel-opt${i === hi ? " hi" : ""}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}>
                <span>{o.label}</span>{o.value === cur && <Icon name="check" size={15} />}
              </div>
            ))}
            {shown.length === 0 && <div className="sel-opt faint">—</div>}
          </div>
        </div>
      )}
    </div>
  );
}
