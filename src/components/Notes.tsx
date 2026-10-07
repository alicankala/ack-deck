import { offerUndo } from "../recordUndo";
import { useEffect, useRef, useState } from "react";
import { loadNotes, saveNotes, type Note } from "../notesStore";
import { Icon } from "./Icon";
import { recordRecent } from "../recentStore";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Notes({ initialId, createNew = false }: { initialId?: string; createNew?: boolean }) {
  const created = useRef(false);
  const editedNote = useRef<{ id: string; usedAt: number } | null>(null);
  useEffect(() => () => { if (editedNote.current) recordRecent("notes", editedNote.current.id, undefined, editedNote.current.usedAt); }, []);
  const [initial] = useState(loadNotes);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? [...initial.notes].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(initial.error);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (createNew && !created.current) { created.current = true; createNote(); } }, [createNew]);
  useEffect(() => { if (createNew && selectedId) document.getElementById("note-title")?.focus(); }, [createNew, selectedId]);
  useEffect(() => { const refresh = () => { const loaded = loadNotes(); if (!loaded.error) setNotes(loaded.notes); }; window.addEventListener("ack-data-changed", refresh); return () => window.removeEventListener("ack-data-changed", refresh); }, []);
  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const search = query.trim().toLocaleLowerCase("tr-TR");
  const visible = notes.filter((note) => (note.title + " " + note.content).toLocaleLowerCase("tr-TR").includes(search))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  function commit(next: Note[]) {
    if (initial.error) return false;
    if (!saveNotes(next)) {
      setError("Not kaydedilemedi. Depolama alanını kontrol edin.");
      return false;
    }
    setNotes(next);
    setError(null);
    return true;
  }

  function createNote() {
    const note: Note = { id: crypto.randomUUID(), title: "Yeni Not", content: "", updatedAt: Date.now() };
    if (initial.error || !saveNotes([note, ...notes])) {
      setError(initial.error ?? "Not oluşturulamadı. Depolama alanını kontrol edin.");
      return;
    }
    setNotes([note, ...notes]);
    editedNote.current = { id: note.id, usedAt: note.updatedAt };
    setSelectedId(note.id);
    setQuery("");
    setError(null);
    setConfirmDelete(false);
  }

  function edit(changes: Partial<Pick<Note, "title" | "content">>) {
    if (!selected) return;
    const updatedAt = Date.now();
    if (commit(notes.map((note) => note.id === selected.id ? { ...note, ...changes, updatedAt } : note))) editedNote.current = { id: selected.id, usedAt: updatedAt };
  }

  function remove() {
    if (!selected) return;
    const next = notes.filter((note) => note.id !== selected.id);
    if (!saveNotes(next)) {
      setError("Not silinemedi. Depolama alanını kontrol edin.");
      return;
    }
    offerUndo({ source: "notes", record: selected });
    setNotes(next);
    setSelectedId(null);
    setConfirmDelete(false);
    setError(null);
  }

  return <div className="notes-page">
    <header className="feature-heading"><h1>Notlar</h1><p>Notların bu bilgisayarda saklanır.</p></header>
    {error && <div className="tool-feedback error" role="alert">{error}</div>}
    <div className="notes-layout surface">
      <aside className="notes-sidebar" aria-label="Not listesi">
        <div className="notes-sidebar-top"><strong>{notes.length} not</strong><button className="button button-primary" type="button" onClick={createNote} disabled={!!initial.error}><Icon name="plus" size={16} /> Yeni not</button></div>
        <label className="sr-only" htmlFor="notes-search">Notlarda ara</label>
        <input id="notes-search" className="notes-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Notlarda ara..." />
        <div className="notes-list">{visible.length ? visible.map((note) => <button className={"note-list-item " + (selectedId === note.id ? "active" : "")} key={note.id} type="button" onClick={() => { setSelectedId(note.id); setConfirmDelete(false); }}>
          <strong>{note.title.trim() || "Başlıksız not"}</strong><span>{note.content.trim() || "İçerik yok"}</span><time dateTime={new Date(note.updatedAt).toISOString()}>{dateFormatter.format(note.updatedAt)}</time>
        </button>) : <p className="notes-empty-list">{search ? "Aramayla eşleşen not yok." : "Henüz not yok."}</p>}</div>
      </aside>
      <section className="notes-editor" aria-label="Not düzenleyici">
        {selected ? <>
          <div className="notes-editor-top"><span className="note-save-status">{error ? "Kaydedilemedi" : "Kaydedildi"}</span><button className="notes-delete" type="button" onClick={() => setConfirmDelete(true)} disabled={!!initial.error}><Icon name="trash" size={16} /> Notu sil</button></div>
          {confirmDelete && <div className="notes-delete-confirm" role="group" aria-label="Notu silme onayı"><span>Bu not silinsin mi?</span><button type="button" onClick={remove}>Evet, sil</button><button type="button" onClick={() => setConfirmDelete(false)}>Vazgeç</button></div>}
          <label className="sr-only" htmlFor="note-title">Not başlığı</label><input id="note-title" className="notes-title" value={selected.title} onChange={(event) => edit({ title: event.target.value })} maxLength={160} placeholder="Not başlığı" disabled={!!initial.error} />
          <label className="sr-only" htmlFor="note-content">Not içeriği</label><textarea id="note-content" className="notes-content" value={selected.content} onChange={(event) => edit({ content: event.target.value })} maxLength={30000} placeholder="Notunu yaz..." disabled={!!initial.error} />
          <p className="notes-save-info"><time dateTime={new Date(selected.updatedAt).toISOString()}>{dateFormatter.format(selected.updatedAt)}</time> · Otomatik kaydedilir</p>
        </> : <div className="notes-empty-editor"><span className="feature-icon"><Icon name="note" size={24} /></span><h2>Bir not seç veya yeni not oluştur</h2><p>Başlık ve içerik yazdıkça notun kaydedilir.</p></div>}
      </section>
    </div>
  </div>;
}
