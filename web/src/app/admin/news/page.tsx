"use client";

import { useState } from "react";
import { useL } from "@/components/admin-kit";
import { Select } from "@/components/select";
import { Modal, PageHead, Switch, useConfirm, useLoad, useToast } from "@/components/ui";
import { ApiError, del, get, post, put } from "@/lib/api";
import { date } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type A = { id?: string; title_ru: string; title_en: string; body_ru: string; body_en: string; kind: string; published: boolean; pinned: boolean; created_at?: string };

export default function AdminNews() {
  const { lang } = useI18n();
  const L = useL();
  const toast = useToast();
  const { ask, node } = useConfirm();
  const { data, reload } = useLoad(() => get<{ data: A[] }>("/api/admin/announcements"));
  const [f, setF] = useState<A | null>(null);
  const save = async () => {
    if (!f) return;
    try {
      if (f.id) await put(`/api/admin/announcements/${f.id}`, f); else await post("/api/admin/announcements", f);
      setF(null); reload(); toast(L("Сохранено", "Saved"));
    } catch (e) { toast(e instanceof ApiError ? e.message : "error", true); }
  };
  return (
    <>
      <PageHead title={L("Новости для пользователей", "News for users")} lead={L("Опубликованные новости видны в кабинете: в разделе «Новости» и плашкой на обзоре. Непрочитанные отмечаются счётчиком в меню.", "Published news shows up in the dashboard under News and as a banner on the overview.")}
        actions={<button className="btn" onClick={() => setF({ title_ru: "", title_en: "", body_ru: "", body_en: "", kind: "info", published: true, pinned: false })}>+ {L("Новость", "News")}</button>} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{L("Заголовок", "Title")}</th><th>{L("Тип", "Kind")}</th><th>{L("Статус", "Status")}</th><th>{L("Дата", "Date")}</th><th /></tr></thead>
          <tbody>
            {data?.data.map((a) => (
              <tr key={a.id} className="clickable" onClick={() => setF(a)}>
                <td>{a.title_ru}{a.pinned && <span className="tag" style={{ marginLeft: 8 }}>{L("закреплена", "pinned")}</span>}</td>
                <td><span className="tag">{a.kind}</span></td>
                <td>{a.published ? <span className="tag tag-ok">{L("опубликована", "published")}</span> : <span className="tag">{L("черновик", "draft")}</span>}</td>
                <td className="small muted">{date(a.created_at, lang)}</td>
                <td className="r"><button className="btn btn-danger btn-sm" onClick={async (e) => { e.stopPropagation(); if (await ask(L("Удалить новость?", "Delete?"))) { await del(`/api/admin/announcements/${a.id}`); reload(); } }}>{L("Удалить", "Delete")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal wide open={!!f} onClose={() => setF(null)} title={f?.id ? L("Новость", "News") : L("Новая новость", "New post")}
        footer={<><button className="btn btn-ghost" onClick={() => setF(null)}>{L("Отмена", "Cancel")}</button><button className="btn" disabled={!f?.title_ru} onClick={save}>{L("Сохранить", "Save")}</button></>}>
        {f && (
          <>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span>{L("Заголовок (рус)", "Title (ru)")}</span><input className="input" value={f.title_ru} onChange={(e) => setF({ ...f, title_ru: e.target.value })} autoFocus /></label>
              <label className="field"><span>{L("Заголовок (англ)", "Title (en)")}</span><input className="input" value={f.title_en} onChange={(e) => setF({ ...f, title_en: e.target.value })} /></label>
            </div>
            <label className="field"><span>{L("Текст (рус)", "Text (ru)")}</span><textarea className="textarea" rows={5} value={f.body_ru} onChange={(e) => setF({ ...f, body_ru: e.target.value })} /></label>
            <label className="field"><span>{L("Текст (англ)", "Text (en)")}</span><textarea className="textarea" rows={4} value={f.body_en} onChange={(e) => setF({ ...f, body_en: e.target.value })} /></label>
            <div className="row-wrap" style={{ ["--gap" as string]: "20px" }}>
              <label className="field"><span>{L("Тип", "Kind")}</span><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="info">{L("Информация", "Info")}</option><option value="success">{L("Хорошая новость", "Good news")}</option><option value="warning">{L("Важно", "Important")}</option></Select></label>
              <label className="row small"><Switch checked={f.published} onChange={(v) => setF({ ...f, published: v })} />{L("Опубликована", "Published")}</label>
              <label className="row small"><Switch checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} />{L("Закрепить", "Pin")}</label>
            </div>
          </>
        )}
      </Modal>
      {node}
    </>
  );
}
