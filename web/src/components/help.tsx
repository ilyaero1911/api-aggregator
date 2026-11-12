"use client";

import { useEffect, useRef, useState } from "react";

/** Значок «?» с понятным объяснением. Открывается наведением или нажатием. */
export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span ref={ref} className="help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="help-btn" aria-label="?" onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}>?</button>
      {open && <span className="help-pop" role="tooltip">{text}</span>}
    </span>
  );
}
