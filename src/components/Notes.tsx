import { ActionMenu } from "./ActionMenu";
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

  useEffect(() => {
    return () => {
      if (editedNote.current) {
        recordRecent("notes", editedNote.current.id, undefined, editedNote.current.usedAt);
      }
    };
  }, []);

  const [initial] = useState(loadNotes);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const firstNote = initial.notes.find((n) => n.id === initialId) ?? initial.notes[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstNote?.id ?? null);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState(firstNote?.title ?? "");
  const [draftContent, setDraftContent] = useState(firstNote?.content ?? "");
  const [pendingSwitchId, setPendingSwitchId] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "attachments">("all");
  const [error, setError] = useState<string | null>(initial.error);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selected = isNewDraft ? null : notes.find((note) => note.id === selectedId) ?? null;
  const hasDraftText = Boolean(draftTitle.trim() || draftContent.trim());
  const isDirty = isNewDraft
    ? hasDraftText
    : Boolean(selected && (draftTitle !== selected.title || draftContent !== selected.content));

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const isNewDraftRef = useRef(isNewDraft);
  isNewDraftRef.current = isNewDraft;

  function loadNoteIntoDraft(note: Note | null) {
    setIsNewDraft(false);
    setSelectedId(note?.id ?? null);
    setDraftTitle(note?.title ?? "");
    setDraftContent(note?.content ?? "");
    setPendingSwitchId(null);
    setConfirmDeleteId(null);
    setError(null);
  }

  function startNewDraft() {
    setIsNewDraft(true);
    setSelectedId(null);
    setDraftTitle("");
    setDraftContent("");
    setPendingSwitchId(null);
    setQuery("");
    setFilterType("all");
    setError(null);
    setConfirmDeleteId(null);
    requestAnimationFrame(() => {
      document.getElementById("note-title")?.focus();
    });
  }

  useEffect(() => {
    if (createNew && !created.current) {
      created.current = true;
      startNewDraft();
    }
  }, [createNew]);

  useEffect(() => {
    const refresh = () => {
      const loaded = loadNotes();
      if (loaded.error) return;
      setNotes(loaded.notes);
      if (!isNewDraftRef.current && !isDirtyRef.current) {
        const cur = loaded.notes.find((n) => n.id === selectedIdRef.current) ?? loaded.notes[0] ?? null;
        setSelectedId(cur?.id ?? null);
        setDraftTitle(cur?.title ?? "");
        setDraftContent(cur?.content ?? "");
      }
    };
    window.addEventListener("ack-data-changed", refresh);
    return () => window.removeEventListener("ack-data-changed", refresh);
  }, []);

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

  function saveDraft(): boolean {
    if (initial.error) return false;
    const cleanTitle = draftTitle.trim();
    const cleanContent = draftContent;
    if (!cleanTitle && !cleanContent.trim()) return false;

    const updatedAt = Date.now();
    const current = loadNotes();
    if (current.error) {
      setError(current.error);
      return false;
    }

    if (isNewDraft) {
      const finalTitle = cleanTitle || "Başlıksız Not";
      const note: Note = {
        id: crypto.randomUUID(),
        title: finalTitle,
        content: cleanContent,
        updatedAt,
      };
      const next = [note, ...current.notes];
      if (!commit(next)) return false;
      editedNote.current = { id: note.id, usedAt: updatedAt };
      setIsNewDraft(false);
      setSelectedId(note.id);
      setDraftTitle(note.title);
      setDraftContent(note.content);
      setPendingSwitchId(null);
      return true;
    }

    if (!selected) return false;
    if (!current.notes.some((n) => n.id === selected.id)) {
      setError("Not başka bir cihazda değişti veya okunamıyor. Güncel kayıtları kontrol et.");
      return false;
    }
    const next = current.notes.map((note) =>
      note.id === selected.id
        ? { ...note, title: draftTitle, content: cleanContent, updatedAt }
        : note,
    );
    if (!commit(next)) return false;
    editedNote.current = { id: selected.id, usedAt: updatedAt };
    setPendingSwitchId(null);
    return true;
  }

  function discardDraft() {
    if (isNewDraft) {
      loadNoteIntoDraft(notes[0] ?? null);
      return;
    }
    if (selected) {
      setDraftTitle(selected.title);
      setDraftContent(selected.content);
      setPendingSwitchId(null);
      setError(null);
    }
  }

  function requestSelectNote(targetId: string) {
    if (!isNewDraft && selectedId === targetId) return;
    if (isDirty) {
      setPendingSwitchId(targetId);
      return;
    }
    const target = notes.find((n) => n.id === targetId) ?? null;
    loadNoteIntoDraft(target);
  }

  function requestCreateNote() {
    if (isNewDraft && !hasDraftText) {
      document.getElementById("note-title")?.focus();
      return;
    }
    if (isDirty) {
      setPendingSwitchId("new");
      return;
    }
    startNewDraft();
  }

  function applyPendingSwitch(saveFirst: boolean) {
    const target = pendingSwitchId;
    if (!target) return;
    if (saveFirst && !saveDraft()) return;
    if (target === "new") {
      startNewDraft();
    } else {
      const nextNote = loadNotes().notes.find((n) => n.id === target) ?? notes.find((n) => n.id === target) ?? null;
      loadNoteIntoDraft(nextNote);
    }
  }

  function removeNoteById(noteId: string) {
    const current = loadNotes();
    if (current.error) {
      setError(current.error);
      return;
    }
    const removed = current.notes.find((n) => n.id === noteId);
    if (!removed) return;
    const next = current.notes.filter((note) => note.id !== noteId);
    if (!saveNotes(next)) {
      setError("Not silinemedi. Depolama alanını kontrol edin.");
      return;
    }
    offerUndo({ source: "notes", record: removed });
    setNotes(next);
    setConfirmDeleteId(null);
    setError(null);
    if (!isNewDraft && selectedId === noteId) {
      loadNoteIntoDraft(next[0] ?? null);
    }
  }

  const hasOpenEditor = Boolean(isNewDraft || selected);
  const metrics = hasOpenEditor ? countNoteMetrics(draftContent) : null;
  const canSave = !initial.error && hasDraftText && (isNewDraft || isDirty);
  const canCancel = !initial.error && (isNewDraft || isDirty);

  return (
    <div
      className="notes-page"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (canSave) saveDraft();
        }
      }}
    >
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
            onClick={requestCreateNote}
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
            {isNewDraft && (
              <div className="note-list-row active">
                <button className="note-list-item active" type="button">
                  <strong>{draftTitle.trim() || "Yeni not (taslak)"}</strong>
                  <span className="note-card-excerpt">{draftContent.trim() || "Henüz kaydedilmedi..."}</span>
                  <div className="note-card-meta">
                    <span>Taslak</span>
                    {metrics && metrics.words > 0 && (
                      <span className="note-card-badges">
                        <span>{metrics.words} kelime</span>
                      </span>
                    )}
                  </div>
                </button>
              </div>
            )}

            {visible.length ? (
              visible.map((note) => {
                const index = notes.findIndex((n) => n.id === note.id);
                const isSelectedRow = !isNewDraft && selectedId === note.id;
                const displayTitle = isSelectedRow ? draftTitle : note.title;
                const displayContent = isSelectedRow ? draftContent : note.content;
                const noteStats = countNoteMetrics(displayContent);
                const attachCount = note.attachments?.length ?? 0;

                return (
                  <div className="note-list-entry" key={note.id}>
                    <div className={`note-list-row ${isSelectedRow ? "active" : ""}`}>
                      <button
                        className={`note-list-item ${isSelectedRow ? "active" : ""}`}
                        type="button"
                        onClick={() => requestSelectNote(note.id)}
                      >
                        <strong>{displayTitle.trim() || "Başlıksız not"}</strong>
                        <span className="note-card-excerpt">{displayContent.trim() || "İçerik yok"}</span>
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

                      <div className="note-list-item-menu">
                        <ActionMenu label={`${note.title.trim() || "Not"} işlemleri`}>
                          <button
                            type="button"
                            disabled={index <= 0}
                            onClick={() => reorder(note.id, -1)}
                          >
                            Öne taşı
                          </button>
                          <button
                            type="button"
                            disabled={index < 0 || index >= notes.length - 1}
                            onClick={() => reorder(note.id, 1)}
                          >
                            Arkaya taşı
                          </button>
                          <button
                            type="button"
                            className="danger-action"
                            disabled={!!initial.error}
                            onClick={() => setConfirmDeleteId(note.id)}
                          >
                            Notu sil
                          </button>
                        </ActionMenu>
                      </div>
                    </div>

                    {confirmDeleteId === note.id && (
                      <div className="notes-delete-confirm is-sidebar" role="group" aria-label="Notu silme onayı">
                        <span>Bu not silinsin mi?</span>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => removeNoteById(note.id)}
                        >
                          Evet, sil
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Vazgeç
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : !isNewDraft ? (
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
            ) : null}
          </div>
        </aside>

        <section className="notes-editor" aria-label="Not düzenleyici">
          {hasOpenEditor ? (
            <>
              <div className="notes-editor-top">
                <span
                  className={`note-save-pill ${
                    error ? "is-error" : isNewDraft || isDirty ? "is-dirty" : "is-saved"
                  }`}
                >
                  <span className="note-save-dot" aria-hidden="true" />
                  <span>
                    {error
                      ? "Kaydedilemedi"
                      : isNewDraft
                        ? "Yeni Taslak"
                        : isDirty
                          ? "Kaydedilmedi"
                          : "Kaydedildi"}
                  </span>
                </span>

                <div className="notes-editor-actions">
                  <button
                    type="button"
                    className="button button-secondary notes-cancel-btn"
                    onClick={discardDraft}
                    disabled={!canCancel}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    className="button button-primary notes-save-btn"
                    onClick={saveDraft}
                    disabled={!canSave}
                    title="Notu kaydet (Ctrl+S)"
                  >
                    Kaydet
                  </button>
                </div>
              </div>

              {pendingSwitchId && (
                <div className="notes-unsaved-confirm" role="alert">
                  <span>Kaydedilmemiş değişiklikler var.</span>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => applyPendingSwitch(true)}
                  >
                    Kaydet ve Geç
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => applyPendingSwitch(false)}
                  >
                    Kaydetmeden Geç
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setPendingSwitchId(null)}
                  >
                    İptal
                  </button>
                </div>
              )}

              <div className="notes-writing-sheet">
                <label className="sr-only" htmlFor="note-title">Not başlığı</label>
                <input
                  id="note-title"
                  className="notes-title"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  maxLength={160}
                  placeholder="Not başlığı"
                  disabled={!!initial.error}
                />
                <div className="note-writing-area">
                  <label className="sr-only" htmlFor="note-content">Not içeriği</label>
                  <textarea
                    id="note-content"
                    className="notes-content"
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    maxLength={30000}
                    placeholder="Notunu buraya yaz..."
                    disabled={!!initial.error}
                  />
                </div>
              </div>

              {selected && (selected.attachments?.length ?? 0) > 0 && (
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
                  {selected ? (
                    <>
                      <time dateTime={new Date(selected.updatedAt).toISOString()}>
                        {dateFormatter.format(selected.updatedAt)}
                      </time>{" "}
                      · {isDirty ? "Kaydedilmemiş değişiklik var (Kaydet veya Ctrl+S)" : "Kaydedildi"}
                    </>
                  ) : (
                    "Henüz kaydedilmedi · Kaydet tuşu veya Ctrl+S ile kaydet"
                  )}
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
              <p>Başlık ve içerik yazdıktan sonra Kaydet tuşuyla notunu kaydedebilirsin.</p>
              <button
                type="button"
                className="button button-primary"
                onClick={requestCreateNote}
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
