"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Select } from "@/components/select";
import { PageHead, Seg, useLoad, useToast } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { perM, rub } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { Model } from "@/lib/types";

type Shot = { url: string; prompt: string; model: string; at: number };
const KEY = "img-history";

const COPY = {
  ru: {
    title: "Картинки", lead: "Опишите, что нарисовать, и выберите модель. Сейчас работает тестовый провайдер, поэтому картинки получаются абстрактными, но цена и списание настоящие.",
    prompt: "Что нарисовать", ph: "Например: маяк на скале в тумане, гравюра", style: "Стиль", none: "Без стиля", model: "Модель", count: "Сколько", size: "Формат",
    square: "Квадрат", portrait: "Портрет", landscape: "Альбом", go: "Нарисовать", history: "Ваши картинки", clear: "Очистить историю",
    empty: "Здесь появятся ваши картинки. Попробуйте один из примеров:", examples: ["Уютная кофейня в дождливый вечер", "Космонавт верхом на лошади, акварель", "Логотип для пекарни в минималистичном стиле", "Неоновый город будущего ночью"],
    styles: [["Фото", "фотография, реалистично"], ["Акварель", "акварель"], ["3D", "3D-рендер"], ["Пиксель-арт", "пиксель-арт"], ["Гравюра", "гравюра"]],
    price: "{p} за картинку", saved: "История хранится только в этом браузере.",
  },
  en: {
    title: "Images", lead: "Describe what to draw and pick a model. A test provider is active, so images are abstract, but pricing and billing are real.",
    prompt: "What to draw", ph: "For example: a lighthouse on a cliff in fog, engraving", style: "Style", none: "No style", model: "Model", count: "How many", size: "Format",
    square: "Square", portrait: "Portrait", landscape: "Landscape", go: "Generate", history: "Your images", clear: "Clear history",
    empty: "Your images will appear here. Try an example:", examples: ["A cozy coffee shop on a rainy evening", "An astronaut riding a horse, watercolor", "A minimalist bakery logo", "A neon city of the future at night"],
    styles: [["Photo", "photo, realistic"], ["Watercolor", "watercolor"], ["3D", "3D render"], ["Pixel art", "pixel art"], ["Engraving", "engraving"]],
    price: "{p} per image", saved: "History is stored only in this browser.",
  },
};

function Images() {
  const { lang } = useI18n();
  const C = COPY[lang === "en" ? "en" : "ru"];
  const toast = useToast();
  const sp = useSearchParams();
  const { data } = useLoad(() => get<{ data: Model[] }>("/api/models"));
  const models = data?.data.filter((m) => m.modality === "image") ?? [];
  const [model, setModel] = useState(sp.get("model") ?? "");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [n, setN] = useState("1");
  const [size, setSize] = useState("1024x1024");
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  useEffect(() => { if (!model && models.length) setModel(models[0].id); }, [models, model]);
  useEffect(() => { try { setShots(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch {} }, []);
  const save = (s: Shot[]) => { setShots(s); try { localStorage.setItem(KEY, JSON.stringify(s.slice(0, 24))); } catch {} };
  const cur = models.find((m) => m.id === model);

  async function go(text = prompt) {
    if (!text.trim()) return;
    setPrompt(text);
    setBusy(true);
    const full = style ? `${text}, ${style}` : text;
    try {
      const r = await post<{ data: { url: string }[]; usage: { cost: number } }>("/api/playground/image", { model, prompt: full, n: Number(n), size });
      save([...r.data.map((d) => ({ url: d.url, prompt: full, model, at: Date.now() })), ...shots]);
      toast(rub(r.usage.cost * 1e6, lang));
    } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title={C.title} lead={C.lead} />
      <form className="img2-form" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <div className="img2-prompt">
          <Icon name="sparkle" size={20} />
          <input value={prompt} placeholder={C.ph} onChange={(e) => setPrompt(e.target.value)} autoComplete="off" />
          <button className="btn btn-signal" disabled={busy || !prompt.trim() || !model}>{busy ? "…" : C.go}</button>
        </div>
        <div className="img2-opts">
          <div className="field"><span>{C.style}</span>
            <div className="row-wrap" style={{ ["--gap" as string]: "6px" }}>
              <button type="button" className={`chip${style === "" ? " on" : ""}`} onClick={() => setStyle("")}>{C.none}</button>
              {C.styles.map(([l, v]) => <button type="button" key={l} className={`chip${style === v ? " on" : ""}`} onClick={() => setStyle(v)}>{l}</button>)}
            </div>
          </div>
          <label className="field"><span>{C.model}</span><Select value={model} onChange={(e) => setModel(e.target.value)} style={{ minWidth: 200 }}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            {cur && <span className="hint">{C.price.replace("{p}", perM(cur.prices.image, lang))}</span>}</label>
          <div className="field"><span>{C.size}</span><Seg value={size} onChange={setSize} options={[{ value: "1024x1024", label: C.square }, { value: "1024x1536", label: C.portrait }, { value: "1536x1024", label: C.landscape }]} /></div>
          <div className="field"><span>{C.count}</span><Seg value={n} onChange={setN} options={["1", "2", "3", "4"].map((x) => ({ value: x, label: x }))} /></div>
        </div>
      </form>

      <div className="spread" style={{ margin: "36px 0 14px" }}>
        <h2 className="h2">{C.history}</h2>
        {shots.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => save([])}><Icon name="trash" size={15} />{C.clear}</button>}
      </div>
      {shots.length === 0 && !busy ? (
        <div className="img2-empty">
          <p className="muted">{C.empty}</p>
          <div className="pg2-ex">{C.examples.map((x) => <button key={x} onClick={() => go(x)}><Icon name="image" size={16} />{x}</button>)}</div>
        </div>
      ) : (
        <div className="img2-grid">
          {busy && Array.from({ length: Number(n) }).map((_, i) => <div key={`s${i}`} className="img2-shot skeleton" />)}
          {shots.map((s, i) => (
            <figure key={s.at + "-" + i} className="img2-shot">
              <img src={s.url} alt={s.prompt} />
              <figcaption><span className="mclamp">{s.prompt}</span><a href={s.url} download={`image-${s.at}.svg`} className="img2-dl" aria-label="download"><Icon name="download" size={16} /></a></figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>{C.saved}</p>
    </>
  );
}

export default function Page() { return <Suspense><Images /></Suspense>; }
