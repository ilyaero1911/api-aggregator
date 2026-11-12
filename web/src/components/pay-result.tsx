"use client";

/** Анимация итога оплаты: галочка рисуется с разлетающимися точками, крестик — с покачиванием. */
export function PayResult({ status, title, sub }: { status: "succeeded" | "failed" | "canceled"; title: string; sub?: string }) {
  const ok = status === "succeeded";
  return (
    <div className={`payres ${ok ? "is-ok" : status === "failed" ? "is-bad" : "is-cancel"}`}>
      <div className="payres-mark">
        {ok && <div className="payres-burst" aria-hidden>{Array.from({ length: 12 }).map((_, i) => <i key={i} style={{ ["--a" as string]: `${i * 30}deg` }} />)}</div>}
        <svg viewBox="0 0 80 80" width="88" height="88" aria-hidden>
          <circle cx="40" cy="40" r="34" className="payres-ring" />
          {ok ? <path d="M25 41 L36 52 L56 30" className="payres-path" />
            : <path d="M28 28 L52 52 M52 28 L28 52" className="payres-path" />}
        </svg>
      </div>
      <h2 className="h2">{title}</h2>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}
