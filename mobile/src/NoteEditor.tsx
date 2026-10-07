import type { FormEvent } from "react";
import { Icon } from "./Icon";

export function NoteEditor({ title, content, onTitle, onContent, onClose, onSubmit, onDelete, busy, error, updatedAt }: { title: string; content: string; onTitle: (value: string) => void; onContent: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; onDelete?: () => void; busy: boolean; error: string; updatedAt?: number }) {
  return <div className="note-sheet">
    <header className="note-toolbar"><button type="button" className="note-back" disabled={busy} onClick={onClose}><span aria-hidden="true">‹</span> Notlar</button><h2 id="editor-title" className="sr-only">Not düzenle</h2><button type="submit" form="mobile-note-form" className="note-done" disabled={busy || !title.trim() && !content.trim()}>{busy ? "Bekle…" : "Bitti"}</button></header>
    <form id="mobile-note-form" className="note-writing-area" onSubmit={onSubmit}>
      <p className="note-edit-date">{updatedAt ? new Date(updatedAt).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Yeni not"}</p>
      <label className="sr-only" htmlFor="mobile-note-title">Not başlığı</label><input id="mobile-note-title" className="note-title-input" value={title} onChange={event => onTitle(event.target.value)} maxLength={200} placeholder="Başlık" autoFocus autoComplete="off" />
      <label className="sr-only" htmlFor="mobile-note-content">Not içeriği</label><textarea id="mobile-note-content" className="note-body-input" value={content} onChange={event => onContent(event.target.value)} maxLength={20000} placeholder="Yazmaya başla…" />
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    <footer className="note-bottom-bar"><span>Bitti’ye dokunarak kaydet</span>{onDelete && <button type="button" aria-label="Notu sil" disabled={busy} onClick={onDelete}><Icon name="trash" size={20} /></button>}</footer>
  </div>;
}
