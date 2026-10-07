import { useLayoutEffect, useRef, type ReactNode, type FormEvent } from "react";
import { Icon } from "./Icon";

export function NoteEditor({ title, content, onTitle, onContent, onClose, onSubmit, onDelete, busy, error, updatedAt, linkControl }: { title: string; content: string; onTitle: (value: string) => void; onContent: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; onDelete?: () => void; busy: boolean; error: string; updatedAt?: number; linkControl?:ReactNode }) {
  const titleField = useRef<HTMLTextAreaElement>(null), bodyField = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const resize = () => { for (const field of [titleField.current, bodyField.current]) if (field) { field.style.height = "auto"; field.style.height = field.scrollHeight + "px"; } };
    resize(); window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [title, content]);
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return <div className="note-sheet">
    <header className="note-toolbar"><button type="button" className="note-back" aria-label="Notlara geri dön" disabled={busy} onClick={onClose}><Icon name="back" /></button><div className="note-toolbar-title"><span>NOT DEFTERİ</span><h2 id="editor-title">{updatedAt ? "Notu düzenle" : "Yeni not"}</h2></div><button type="submit" form="mobile-note-form" className="note-done" disabled={busy || !title.trim() && !content.trim()}>{busy ? "Bekle…" : "Kaydet"}</button></header>
    <form id="mobile-note-form" className="note-writing-area" onSubmit={onSubmit}>
      {linkControl}<div className="note-paper-meta"><span>{updatedAt ? new Date(updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "Aklındakiler için yeni bir sayfa"}</span><Icon name="note" size={17} /></div>
      <label className="sr-only" htmlFor="mobile-note-title">Not başlığı</label><textarea ref={titleField} rows={1} id="mobile-note-title" className="note-title-input" value={title} onChange={event => onTitle(event.target.value)} maxLength={200} placeholder="Başlık" autoComplete="off" />
      <div className="note-paper-rule" aria-hidden="true" />
      <label className="sr-only" htmlFor="mobile-note-content">Not içeriği</label><textarea ref={bodyField} rows={6} id="mobile-note-content" className="note-body-input" value={content} onChange={event => onContent(event.target.value)} maxLength={20000} placeholder="Bir şeyler yaz…" />
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    <footer className="note-bottom-bar"><span>{words} kelime <span aria-hidden="true">·</span> {content.length.toLocaleString("tr-TR")} karakter</span>{onDelete && <button type="button" disabled={busy} onClick={onDelete}><Icon name="trash" size={17} /> Notu sil</button>}</footer>
  </div>;
}
