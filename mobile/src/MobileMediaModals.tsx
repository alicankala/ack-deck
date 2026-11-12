import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_LABELS,
  type MediaItem,
  type MediaStatus,
  type MediaType,
} from "../../shared/media";
import {
  fetchMediaRating,
  proxyPosterUrl,
  searchMediaCatalog,
  type MediaSearchCandidate,
} from "../../shared/mediaSearch";

type MobileMediaFormModalProps = {
  editor: MediaItem;
  isEditingExisting: boolean;
  initialSuppressLookup: boolean;
  onChangeEditor: (updater: MediaItem | ((prev: MediaItem | null) => MediaItem | null)) => void;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
  onDelete: (id: string) => void;
};

/** Mobile Add / Edit media item modal with catalog metadata lookup (no autoFocus per AGENTS §8). */
export function MobileMediaFormModal({
  editor,
  isEditingExisting,
  initialSuppressLookup,
  onChangeEditor,
  onClose,
  onSave,
  onDelete,
}: MobileMediaFormModalProps) {
  const [suggestions, setSuggestions] = useState<MediaSearchCandidate[]>([]);
  const [searchingMeta, setSearchingMeta] = useState(false);
  const [searchHasQueried, setSearchHasQueried] = useState(false);
  const suppressedLookupKeyRef = useRef<string | null>(
    initialSuppressLookup ? `${editor.type}\0${editor.title.trim()}` : null
  );

  const triggerImmediateLookup = async (forcedQuery?: string) => {
    const q = (forcedQuery ?? editor.title).trim();
    if (q.length < 2) return;
    setSearchingMeta(true);
    try {
      const res = await searchMediaCatalog(editor.type, q);
      setSuggestions(res);
      setSearchHasQueried(true);
    } catch {
      setSuggestions([]);
      setSearchHasQueried(true);
    } finally {
      setSearchingMeta(false);
    }
  };

  useEffect(() => {
    const currentKey = `${editor.type}\0${editor.title.trim()}`;
    if (suppressedLookupKeyRef.current === currentKey) {
      return;
    }
    suppressedLookupKeyRef.current = null;
    const q = editor.title.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearchingMeta(false);
      setSearchHasQueried(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingMeta(true);
      void searchMediaCatalog(editor.type, q, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) {
            setSuggestions(res);
            setSearchHasQueried(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchingMeta(false);
        });
    }, 380);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [editor.type, editor.title]);

  const applyCandidate = (cand: MediaSearchCandidate) => {
    const nextType = (cand.suggestedType as MediaType) || editor.type;
    const nextTitle = cand.title.slice(0, 160);
    suppressedLookupKeyRef.current = `${nextType}\0${nextTitle.trim()}`;
    const nextItem: MediaItem = {
      ...editor,
      type: nextType,
      title: nextTitle,
      posterUrl: cand.posterUrl || editor.posterUrl || "",
      year: cand.year || editor.year || "",
      creator: cand.creator || editor.creator || "",
      progress: editor.progress?.trim() ? editor.progress : (cand.progressHint ?? ""),
      imdbId: cand.imdbId || editor.imdbId,
      imdbRating: cand.imdbRating || editor.imdbRating,
    };
    onChangeEditor(nextItem);
    setSuggestions([]);
    setSearchHasQueried(false);

    if ((nextType === "movie" || nextType === "series") && nextItem.imdbId && !nextItem.imdbRating) {
      void fetchMediaRating(nextItem.imdbId).then((rating) => {
        if (typeof rating === "number" && rating > 0) {
          onChangeEditor((curr) =>
            curr && curr.id === nextItem.id
              ? { ...curr, imdbRating: rating, imdbUpdatedAt: Date.now() }
              : curr
          );
        }
      });
    }
  };

  return (
    <div className="mobile-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mobile-media-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-weather-top">
          <strong style={{ fontSize: "17px", fontWeight: 700 }}>
            {isEditingExisting ? "Kaydı Düzenle" : "Yeni Koleksiyon Kaydı"}
          </strong>
          <button type="button" className="mobile-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={onSave} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
          <div className="mobile-media-type-choice">
            {(["movie", "series", "book", "game"] as const).map((t) => (
              <button
                type="button"
                key={t}
                className={`mobile-type-btn ${editor.type === t ? "is-selected" : ""}`}
                onClick={() => onChangeEditor({ ...editor, type: t })}
              >
                <span className="mobile-type-icon">{MEDIA_TYPE_ICONS[t]}</span>
                <span className="mobile-type-label">{MEDIA_TYPE_LABELS[t]}</span>
              </button>
            ))}
          </div>

          <div className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="mobile-media-muted" style={{ fontSize: "12px" }}>Başlık *</span>
              {searchingMeta ? (
                <span className="mobile-media-search-status">
                  <span className="media-mini-spinner" style={{ width: 10, height: 10 }} /> Aranıyor…
                </span>
              ) : suggestions.length > 0 ? (
                <span className="mobile-media-matches-status">
                  ✨ {suggestions.length} eşleşme
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                type="text"
                required
                className="mobile-media-field-input"
                value={editor.title}
                onChange={(e) => {
                  setSearchHasQueried(false);
                  onChangeEditor({ ...editor, title: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void triggerImmediateLookup();
                  }
                }}
                placeholder="İsim yazın (örn. Interstellar, Breaking Bad)..."
                maxLength={160}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="mobile-media-lookup-btn"
                disabled={searchingMeta || editor.title.trim().length < 2}
                onClick={() => void triggerImmediateLookup()}
              >
                {searchingMeta ? "⏳" : "🔍 Ara"}
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className="mobile-media-suggestions">
                {suggestions.map((cand, idx) => {
                  const isCrossType = !!cand.suggestedType && cand.suggestedType !== editor.type;
                  const displayType = cand.suggestedType || editor.type;
                  return (
                    <button
                      type="button"
                      key={`${cand.title}-${cand.year ?? idx}-${cand.suggestedType ?? ""}`}
                      className="mobile-media-suggestion-item"
                      onClick={() => applyCandidate(cand)}
                    >
                      {cand.posterUrl ? (
                        <img
                          src={proxyPosterUrl(cand.posterUrl)}
                          alt=""
                          className="mobile-media-suggestion-thumb"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="mobile-media-suggestion-placeholder">{MEDIA_TYPE_ICONS[displayType]}</span>
                      )}
                      <div className="mobile-media-suggestion-info">
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <strong>{cand.title}</strong>
                          {isCrossType && (
                            <span className="mobile-media-cross-badge">
                              {MEDIA_TYPE_ICONS[cand.suggestedType!]} {MEDIA_TYPE_LABELS[cand.suggestedType!]}
                            </span>
                          )}
                        </div>
                        <small>
                          {[cand.year, cand.creator, cand.progressHint].filter(Boolean).join(" · ") || MEDIA_TYPE_LABELS[displayType]}
                        </small>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {searchHasQueried && !searchingMeta && suggestions.length === 0 && editor.title.trim().length >= 2 && (
              <div className="mobile-media-no-match-box">
                ℹ️ "{editor.title}" için otomatik afiş bulunamadı. Başlığı kontrol edebilir veya bilgileri aşağıdan elle girebilirsin.
              </div>
            )}
          </div>

          {(editor.posterUrl || editor.year || editor.creator) && (
            <div className="mobile-media-preview-box">
              {editor.posterUrl && (
                <img
                  src={proxyPosterUrl(editor.posterUrl)}
                  alt=""
                  className="mobile-media-preview-poster"
                  referrerPolicy="no-referrer"
                />
              )}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "6px" }}>
                  <input
                    type="text"
                    className="mobile-media-field-input"
                    value={editor.year ?? ""}
                    onChange={(e) => onChangeEditor({ ...editor, year: e.target.value })}
                    placeholder="Yıl"
                    maxLength={24}
                    style={{ width: "100%", boxSizing: "border-box", minWidth: 0, padding: "6px 8px", borderRadius: "7px" }}
                  />
                  <input
                    type="text"
                    className="mobile-media-field-input"
                    value={editor.creator ?? ""}
                    onChange={(e) => onChangeEditor({ ...editor, creator: e.target.value })}
                    placeholder="Yönetmen / Yazar / Stüdyo"
                    maxLength={160}
                    style={{ width: "100%", boxSizing: "border-box", minWidth: 0, padding: "6px 8px", borderRadius: "7px" }}
                  />
                </div>
                {editor.posterUrl && (
                  <button
                    type="button"
                    className="mobile-media-clear-btn"
                    onClick={() => onChangeEditor({ ...editor, posterUrl: "" })}
                  >
                    Afişi kaldır
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="mobile-media-muted" style={{ fontSize: "12px" }}>Durum</span>
              <select
                className="mobile-media-field-input"
                value={editor.status}
                onChange={(e) => {
                  const nextStatus = e.target.value as MediaStatus;
                  const updated = { ...editor, status: nextStatus };
                  if (nextStatus === "completed") {
                    if (updated.rating === undefined) updated.rating = 8;
                    if (!updated.completedDate) updated.completedDate = new Date().toISOString().slice(0, 10);
                  } else if (nextStatus === "planned") {
                    delete updated.rating;
                    delete updated.completedDate;
                  } else if (nextStatus === "in_progress") {
                    delete updated.completedDate;
                  }
                  onChangeEditor(updated);
                }}
                style={{ padding: "8px" }}
              >
                <option value="planned">Listemde</option>
                <option value="in_progress">Devam Ediyor</option>
                <option value="completed">Bitirildi</option>
              </select>
            </label>

            {editor.status === "completed" ? (
              <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="mobile-media-muted" style={{ fontSize: "12px" }}>Puan (1-10)</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  className="mobile-media-field-input"
                  value={editor.rating ?? 8}
                  onChange={(e) => onChangeEditor({ ...editor, rating: Number(e.target.value) })}
                  style={{ padding: "8px" }}
                />
              </label>
            ) : editor.status === "in_progress" ? (
              <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="mobile-media-muted" style={{ fontSize: "12px" }}>İlerleme</span>
                <input
                  type="text"
                  className="mobile-media-field-input"
                  value={editor.progress ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, progress: e.target.value })}
                  placeholder="örn. S3 B2, 120. sayfa"
                  maxLength={60}
                  style={{ padding: "8px" }}
                />
              </label>
            ) : (
              <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="mobile-media-muted" style={{ fontSize: "12px" }}>Hedef / Not</span>
                <input
                  type="text"
                  className="mobile-media-field-input"
                  value={editor.progress ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, progress: e.target.value })}
                  placeholder="örn. Vizyon, platform"
                  maxLength={60}
                  style={{ padding: "8px" }}
                />
              </label>
            )}
          </div>

          {editor.status === "completed" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="mobile-media-muted" style={{ fontSize: "12px" }}>İlerleme / Detay</span>
                <input
                  type="text"
                  className="mobile-media-field-input"
                  value={editor.progress ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, progress: e.target.value })}
                  placeholder="örn. 352 sayfa, 40 saat"
                  maxLength={60}
                  style={{ padding: "8px" }}
                />
              </label>

              <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="mobile-media-muted" style={{ fontSize: "12px" }}>Bitirme Tarihi</span>
                <input
                  type="date"
                  className="mobile-media-field-input"
                  value={editor.completedDate ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, completedDate: e.target.value })}
                  style={{ padding: "8px" }}
                />
              </label>
            </div>
          )}

          <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="mobile-media-muted" style={{ fontSize: "12px" }}>Notlar</span>
            <textarea
              className="mobile-media-field-input"
              value={editor.review ?? ""}
              onChange={(e) => onChangeEditor({ ...editor, review: e.target.value })}
              placeholder="Kişisel yorum veya notlar…"
              rows={2}
              maxLength={1000}
              style={{ padding: "8px" }}
            />
          </label>

          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button type="submit" className="mobile-button-primary" style={{ flex: 1 }}>
              Kaydet
            </button>
            {isEditingExisting && (
              <button
                type="button"
                className="mobile-button-secondary mobile-media-delete-btn"
                onClick={() => onDelete(editor.id)}
              >
                Sil
              </button>
            )}
            <button type="button" className="mobile-button-secondary" onClick={onClose}>
              Vazgeç
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
