import { offerUndo } from "../recordUndo";
import { PhoneMedia } from "./PhoneMedia";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadNotes, saveNotes, type Note } from "../notesStore";
import { Icon } from "./Icon";
import { recordRecent } from "../recentStore";
import { moveBy } from "../reorder";
import "./notes.css";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});

function countNoteMetrics(content: string): { words: number; chars: number; lines: number } {
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const lines = content ? content.split(/\r\n|\r|\n/).length : 0;
  return { words, chars: content.length, lines };
}

export function Notes({ initialId, createNew = false }: { initialId?: string; createNew?: boolean }) {
  const created = useRef(false);
  const editedNote = useRef<{ id: string; usedAt: number } | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (editedNote.current) {
        recordRecent("notes", editedNote.current.id, undefined, editedNote.current.usedAt);
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const [initial] = useState(loadNotes);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? initial.notes[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "attachments">("all");
  const [error, setError] = useState<string | null>(initial.error);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (createNew && !created.current) {
      created.current = true;
      createNote();
    }
  }, [createNew]);

  useEffect(() => {
    if (createNew && selectedId) {
      document.getElementById("note-title")?.focus();
    }
  }, [createNew, selectedId]);

  useEffect(() => {
    const refresh = () => {
      const loaded = loadNotes();
      if (!loaded.error) setNotes(loaded.notes);
    };
    window.addEventListener("ack-data-changed", refresh);
    return () => window.removeEventListener("ack-data-changed", refresh);
  }, []);

  useEffect(() => {
    setCopied(false);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [selectedId]);

  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const search = query.trim().toLocaleLowerCase("tr-TR");
  const attachmentsNotesCount = useMemo(
    () => notes.filter((n) => (n.attachments?.length ?? 0) > 0).length,
    [notes],
  );
  const latestNoteUpdatedAt = useMemo(
    () => notes.reduce((max, n) => (n.updatedAt > max ? n.updatedAt : max), 0),
    [notes],
  );

  const visible = notes.filter((note) => {
    if (filterType === "attachments" && !(note.attachments?.length ?? 0)) {
      return false;
    }
    if (!search) return true;
    return (note.title + " " + note.content).toLocaleLowerCase("tr-TR").includes(search);
  });

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

  function reorder(id: string, direction: number) {
    const current = loadNotes();
    if (current.error) return;
    const next = moveBy(current.notes, id, direction);
    commit(next);
  }

  function createNote() {
    const note: Note = { id: crypto.randomUUID(), title: "Yeni Not", content: "", updatedAt: Date.now() };
    const current = loadNotes();
    if (initial.error || current.error || !saveNotes([note, ...current.notes])) {
      setError(initial.error ?? "Not oluşturulamadı. Depolama alanını kontrol edin.");
      return;
    }
    setNotes([note, ...current.notes]);
    editedNote.current = { id: note.id, usedAt: note.updatedAt };
    setSelectedId(note.id);
    setQuery("");
    setFilterType("all");
    setError(null);
    setConfirmDelete(false);
  }

  function edit(changes: Partial<Pick<Note, "title" | "content" | "projectId" | "workspaceId">>) {
    if (!selected) return;
    const updatedAt = Date.now();
    const current = loadNotes();
    if (current.error || !current.notes.some((n) => n.id === selected.id)) {
      setError("Not başka bir cihazda değişti veya okunamıyor. Güncel kayıtları kontrol et.");
      return;
    }
    if (commit(current.notes.map((note) => (note.id === selected.id ? { ...note, ...changes, updatedAt } : note)))) {
      editedNote.current = { id: selected.id, usedAt: updatedAt };
    }
  }

  function remove() {
    if (!selected) return;
    const current = loadNotes();
    if (current.error) {
      setError(current.error);
      return;
    }
    const removed = current.notes.find((n) => n.id === selected.id);
    if (!removed) return;
    const next = current.notes.filter((note) => note.id !== selected.id);
    if (!saveNotes(next)) {
      setError("Not silinemedi. Depolama alanını kontrol edin.");
      return;
    }
    offerUndo({ source: "notes", record: removed });
    setNotes(next);
    setSelectedId(next[0]?.id ?? null);
    setConfirmDelete(false);
    setError(null);
  }

  async function copySelectedNote() {
    if (!selected) return;
    const title = selected.title.trim();
    const content = selected.content;
    const payload = content.trim()
      ? title && title !== "Yeni Not"
        ? `${title}\n\n${content}`
        : content
      : title;
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1500);
    } catch {
      setError("Not panoya kopyalanamadı.");
    }
  }

  const metrics = selected ? countNoteMetrics(selected.content) : null;

  return (
    <div className="notes-page">
      <header className="feature-heading page-header notes-page-header">
        <div>
          <h1>Notlar</h1>
          <p>Notların bu bilgisayarda saklanır ve eşleştirildiğinde telefonla eşitlenir.</p>
        </div>
        <div className="notes-header-actions">
          <span className="notes-header-pill">{notes.length} Not</span>
          {latestNoteUpdatedAt > 0 && (
            <span className="notes-header-pill is-muted">
              Son: {shortDateFormatter.format(latestNoteUpdatedAt)}
            </span>
          )}
          <button
            className="button button-primary"
            type="button"
            onClick={createNote}
            disabled={!!initial.error}
          >
            <Icon name="plus" size={16} /> Yeni Not
          </button>
        </div>
      </header>

      {error && <div className="tool-feedback error" role="alert">{error}</div>}

      <div className="notes-layout surface">
        <aside className="notes-sidebar" aria-label="Not listesi">
          <div className="notes-sidebar-top">
            <div className="notes-search-wrap">
              <span className="notes-search-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <label className="sr-only" htmlFor="notes-search">Notlarda ara</label>
              <input
                id="notes-search"
                className="notes-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Notlarda ara..."
              />
              {query && (
                <button
                  type="button"
                  className="notes-search-clear"
                  onClick={() => setQuery("")}
                  aria-label="Aramayı temizle"
                >
                  ×
                </button>
              )}
            </div>

            <div className="notes-sidebar-meta">
              <span>
                {search || filterType === "attachments"
                  ? `${visible.length} / ${notes.length} eşleşme`
                  : `${notes.length} kayıtlı not`}
              </span>
              {attachmentsNotesCount > 0 && (
                <div className="notes-filter-chips" role="group" aria-label="Not filtresi">
                  <button
                    type="button"
                    className={`notes-filter-chip ${filterType === "all" ? "is-active" : ""}`}
                    onClick={() => setFilterType("all")}
                  >
                    Tümü
                  </button>
                  <button
                    type="button"
                    className={`notes-filter-chip ${filterType === "attachments" ? "is-active" : ""}`}
                    onClick={() => setFilterType("attachments")}
                  >
                    Ekli ({attachmentsNotesCount})
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="notes-list">
            {visible.length ? (
              visible.map((note) => {
                const index = notes.findIndex((n) => n.id === note.id);
                const noteStats = countNoteMetrics(note.content);
                const attachCount = note.attachments?.length ?? 0;

                return (
                  <div
                    className={`note-list-row ${selectedId === note.id ? "active" : ""}`}
                    key={note.id}
                  >
                    <button
                      className={`note-list-item ${selectedId === note.id ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setSelectedId(note.id);
                        setConfirmDelete(false);
                      }}
                    >
                      <strong>{note.title.trim() || "Başlıksız not"}</strong>
                      <span className="note-card-excerpt">{note.content.trim() || "İçerik yok"}</span>
                      <div className="note-card-meta">
                        <time dateTime={new Date(note.updatedAt).toISOString()}>
                          {dateFormatter.format(note.updatedAt)}
                        </time>
                        <span className="note-card-badges">
                          {attachCount > 0 && (
                            <span className="note-card-attach-badge">📎 {attachCount}</span>
                          )}
                          {noteStats.words > 0 && <span>{noteStats.words} kelime</span>}
                        </span>
                      </div>
                    </button>

                    <div className="note-list-item-reorder" role="group" aria-label="Not sırası">
                      <button
                        type="button"
                        className="note-order-btn"
                        title="Öne taşı"
                        aria-label={`${note.title.trim() || "Notu"} öne taşı`}
                        disabled={index <= 0}
                        onClick={() => reorder(note.id, -1)}
                      >
                        <Icon name="arrowUp" size={12} />
                      </button>
                      <button
                        type="button"
                        className="note-order-btn"
                        title="Arkaya taşı"
                        aria-label={`${note.title.trim() || "Notu"} arkaya taşı`}
                        disabled={index < 0 || index >= notes.length - 1}
                        onClick={() => reorder(note.id, 1)}
                      >
                        <Icon name="arrowDown" size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="notes-empty-list-box">
                <p>{search ? "Aramayla eşleşen not yok." : "Bu görünümde not yok."}</p>
                {(search || filterType !== "all") && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setQuery("");
                      setFilterType("all");
                    }}
                  >
                    Filtreyi Temizle
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        <section className="notes-editor" aria-label="Not düzenleyici">
          {selected ? (
            <>
              <div className="notes-editor-top">
                <span className={`note-save-pill ${error ? "is-error" : "is-saved"}`}>
                  <span className="note-save-dot" aria-hidden="true" />
                  <span>{error ? "Kaydedilemedi" : "Kaydedildi"}</span>
                </span>

                <div className="notes-editor-actions">
                  <button
                    type="button"
                    className={`button button-secondary notes-copy-btn ${copied ? "is-copied" : ""}`}
                    onClick={() => void copySelectedNote()}
                    disabled={!selected.title.trim() && !selected.content.trim()}
                  >
                    {copied ? "✓ Kopyalandı" : "Kopyala"}
                  </button>
                  <button
                    className="button button-secondary notes-delete-btn"
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={!!initial.error}
                  >
                    <Icon name="trash" size={15} /> Notu Sil
                  </button>
                </div>
              </div>

              {confirmDelete && (
                <div className="notes-delete-confirm" role="group" aria-label="Notu silme onayı">
                  <span>Bu not silinsin mi?</span>
                  <button type="button" className="button button-secondary" onClick={remove}>
                    Evet, sil
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => setConfirmDelete(false)}>
                    Vazgeç
                  </button>
                </div>
              )}

              <div className="notes-writing-sheet">
                <label className="sr-only" htmlFor="note-title">Not başlığı</label>
                <input
                  id="note-title"
                  className="notes-title"
                  value={selected.title}
                  onChange={(event) => edit({ title: event.target.value })}
                  maxLength={160}
                  placeholder="Not başlığı"
                  disabled={!!initial.error}
                />
                <div className="note-writing-area">
                  <label className="sr-only" htmlFor="note-content">Not içeriği</label>
                  <textarea
                    id="note-content"
                    className="notes-content"
                    value={selected.content}
                    onChange={(event) => edit({ content: event.target.value })}
                    maxLength={30000}
                    placeholder="Notunu buraya yaz..."
                    disabled={!!initial.error}
                  />
                </div>
              </div>

              {(selected.attachments?.length ?? 0) > 0 && (
                <div className="notes-attachments-section">
                  {selected.attachments!.map((file) => (
                    <section className="note-attachment" key={file.id}>
                      <strong>{file.name}</strong>
                      <PhoneMedia file={file} cached />
                    </section>
                  ))}
                </div>
              )}

              <div className="notes-save-info">
                <span>
                  <time dateTime={new Date(selected.updatedAt).toISOString()}>
                    {dateFormatter.format(selected.updatedAt)}
                  </time>{" "}
                  · Otomatik kaydedilir
                </span>
                {metrics && (
                  <span>
                    {metrics.lines} satır · {metrics.words} kelime · {metrics.chars} karakter
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="notes-empty-editor">
              <span className="feature-icon">
                <Icon name="note" size={24} />
              </span>
              <h2>Bir not seç veya yeni not oluştur</h2>
              <p>Başlık ve içerik yazdıkça notun otomatik olarak kaydedilir.</p>
              <button
                type="button"
                className="button button-primary"
                onClick={createNote}
                disabled={!!initial.error}
              >
                <Icon name="plus" size={16} /> Yeni Not Oluştur
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
