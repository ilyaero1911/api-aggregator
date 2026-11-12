"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "./icons";

/** Кнопка «скопировать ID модели». Работает и внутри ссылки: клик не открывает карточку. */
export function CopyId({ id, label }: { id: string; label?: boolean }) {
  const { lang } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`copy-id${done ? " done" : ""}${label ? " with-label" : ""}`} title={lang === "en" ? "Copy model ID" : "Скопировать название модели"}
      onClick={async (e) => { e.preventDefault(); e.stopPropagation(); await navigator.clipboard.writeText(id); setDone(true); setTimeout(() => setDone(false), 1300); }}>
      <span className="mono">{id}</span>
      <Icon name={done ? "check" : "copy"} size={14} />
      {label && <span>{done ? (lang === "en" ? "Copied" : "Скопировано") : (lang === "en" ? "Copy" : "Копировать")}</span>}
    </button>
  );
}
