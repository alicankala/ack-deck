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
  searchMediaCatalog,
  type MediaSearchCandidate,
} from "../../shared/mediaSearch";
import { MediaPoster } from "./MediaPoster";

type MediaFormModalProps = {
  editor: MediaItem;
  isEditingExisting: boolean;
  initialSuppressLookup: boolean;
  onChangeEditor: (updater: MediaItem | ((prev: MediaItem | null) => MediaItem | null)) => void;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
};

/** Desktop Add / Edit media item modal with catalog metadata & IMDb lookup. */
export function MediaFormModal({
  editor,
  isEditingExisting,
  initialSuppressLookup,
  onChangeEditor,
  onClose,
  onSave,
}: MediaFormModalProps) {
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
    <div className="media-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="surface media-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="media-editor-header">
          <h3>{isEditingExisting ? "Kaydı Düzenle" : "Yeni Koleksiyon Kaydı Ekle"}</h3>
          <button type="button" className="mobile-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={onSave} className="media-editor-form">
          <div className="media-type-choice">
            {(["movie", "series", "book", "game"] as const).map((t) => (
              <button
                type="button"
                key={t}
                className={`type-choice-btn ${editor.type === t ? "is-selected" : ""}`}
                onClick={() => onChangeEditor({ ...editor, type: t })}
              >
                <span className="type-icon">{MEDIA_TYPE_ICONS[t]}</span>
                <span className="type-text">{MEDIA_TYPE_LABELS[t]}</span>
              </button>
            ))}
          </div>

          <div className="editor-field media-lookup-wrap">
            <div className="media-lookup-label-row">
              <span>Başlık *</span>
              {searchingMeta ? (
                <span className="media-lookup-badge is-searching">
                  <span className="media-mini-spinner" /> Afiş ve bilgi aranıyor…
                </span>
              ) : suggestions.length > 0 ? (
                <span className="media-lookup-badge is-found">
                  ✨ {suggestions.length} otomatik eşleşme bulundu
                </span>
              ) : null}
            </div>
            <div className="media-lookup-input-group">
              <input
                type="text"
                required
                autoFocus
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
                placeholder="İsim yazın (örn. Interstellar, Breaking Bad, Suç ve Ceza, Elden Ring)..."
                maxLength={160}
              />
              <button
                type="button"
                className="media-lookup-btn"
                disabled={searchingMeta || editor.title.trim().length < 2}
                onClick={() => void triggerImmediateLookup()}
                title="Afiş ve bilgileri ara"
              >
                {searchingMeta ? <span className="media-mini-spinner" /> : "🔍 Ara"}
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="media-suggestions-list" role="listbox" aria-label="Otomatik bulunan sonuçlar">
                {suggestions.map((cand, idx) => {
                  const isCrossType = !!cand.suggestedType && cand.suggestedType !== editor.type;
                  const displayType = cand.suggestedType || editor.type;
                  return (
                    <button
                      type="button"
                      key={`${cand.title}-${cand.year ?? idx}-${cand.suggestedType ?? ""}`}
                      className="media-suggestion-item"
                      onClick={() => applyCandidate(cand)}
                    >
                      <MediaPoster
                        url={cand.posterUrl}
                        title={cand.title}
                        type={cand.suggestedType || editor.type}
                        className="media-suggestion-thumb"
                        placeholderClassName="media-suggestion-placeholder"
                      />
                      <div className="media-suggestion-meta">
                        <div className="media-suggestion-title-row">
                          <strong>{cand.title}</strong>
                          {isCrossType && (
                            <span className="media-cross-tag">
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
              <div className="media-lookup-empty-note">
                ℹ️ "{editor.title}" için otomatik afiş bulunamadı. Başlığı kontrol edebilir veya bilgileri aşağıdan elle girebilirsin.
              </div>
            )}
          </div>

          {(editor.posterUrl || editor.year || editor.creator) && (
            <div className="media-selected-meta-preview">
              <MediaPoster
                url={editor.posterUrl}
                title={editor.title}
                type={editor.type}
                className="media-preview-poster"
                placeholderClassName="media-preview-poster-placeholder"
              />
              <div className="media-preview-fields">
                <div className="editor-row">
                  <label className="editor-field">
                    <span>Yıl</span>
                    <input
                      type="text"
                      value={editor.year ?? ""}
                      onChange={(e) => onChangeEditor({ ...editor, year: e.target.value })}
                      placeholder="örn. 2014"
                      maxLength={24}
                    />
                  </label>
                  <label className="editor-field">
                    <span>Yönetmen / Yazar / Stüdyo</span>
                    <input
                      type="text"
                      value={editor.creator ?? ""}
                      onChange={(e) => onChangeEditor({ ...editor, creator: e.target.value })}
                      placeholder="örn. Christopher Nolan"
                      maxLength={160}
                    />
                  </label>
                </div>

                {editor.posterUrl && (
                  <button
                    type="button"
                    className="text-action"
                    style={{ fontSize: "0.75rem", alignSelf: "flex-start" }}
                    onClick={() => onChangeEditor({ ...editor, posterUrl: "" })}
                  >
                    Afişi kaldır
                  </button>
                )}
              </div>
            </div>
          )}

          {(editor.type === "movie" || editor.type === "series") && (
            <div className="editor-imdb-block">
              <div className="editor-imdb-left">
                <span className="editor-imdb-title">IMDb:</span>
                {editor.imdbId ? (
                  <span className="editor-imdb-connected">
                    <span className="media-imdb-badge">🟡 {editor.imdbRating ?? "Puan aranıyor"}</span>
                    <code>{editor.imdbId}</code>
                  </span>
                ) : (
                  <span className="editor-imdb-unlinked">Henüz IMDb kodu bağlanmadı</span>
                )}
              </div>
              <button
                type="button"
                className="button button-secondary editor-imdb-btn"
                onClick={async () => {
                  if (!editor.title.trim()) return;
                  const results = await searchMediaCatalog(editor.type, editor.title);
                  const matched = results.find((c) => c.imdbId);
                  if (matched?.imdbId) {
                    const r = await fetchMediaRating(matched.imdbId);
                    onChangeEditor({
                      ...editor,
                      imdbId: matched.imdbId,
                      imdbRating: r,
                      posterUrl: editor.posterUrl || matched.posterUrl,
                      year: editor.year || matched.year,
                      creator: editor.creator || matched.creator,
                    });
                  }
                }}
                title="Başlığa göre otomatik IMDb eşleştir"
              >
                🔍 IMDb'de Eşle / Güncelle
              </button>
            </div>
          )}

          <div className="editor-row">
            <label className="editor-field">
              <span>Durum</span>
              <select
                value={editor.status}
                onChange={(e) => {
                  const nextStatus = e.target.value as MediaStatus;
                  const updated = { ...editor, status: nextStatus };
                  if (nextStatus === "completed") {
                    if (updated.rating === undefined) updated.rating = 8;
                    if (!updated.completedDate) {
                      updated.completedDate = new Date().toISOString().slice(0, 10);
                    }
                  } else if (nextStatus === "planned") {
                    delete updated.rating;
                    delete updated.completedDate;
                  } else if (nextStatus === "in_progress") {
                    delete updated.completedDate;
                  }
                  onChangeEditor(updated);
                }}
              >
                <option value="planned">Listemde / Planlandı</option>
                <option value="in_progress">Devam Ediyor</option>
                <option value="completed">Bitirildi / İzlendi / Okundu</option>
              </select>
            </label>

            {editor.status === "completed" ? (
              <label className="editor-field">
                <span>Puan (1-10)</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  value={editor.rating ?? 8}
                  onChange={(e) => onChangeEditor({ ...editor, rating: Number(e.target.value) })}
                />
              </label>
            ) : editor.status === "in_progress" ? (
              <label className="editor-field">
                <span>İlerleme Durumu</span>
                <input
                  type="text"
                  value={editor.progress ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, progress: e.target.value })}
                  placeholder="örn. 3. Sezon 4. Bölüm, 120. sayfa..."
                  maxLength={60}
                />
              </label>
            ) : (
              <label className="editor-field">
                <span>Not / Hedef (opsiyonel)</span>
                <input
                  type="text"
                  value={editor.progress ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, progress: e.target.value })}
                  placeholder="örn. Vizyon tarihi, platform, tavsiye eden..."
                  maxLength={60}
                />
              </label>
            )}
          </div>

          {editor.status === "completed" && (
            <div className="editor-row">
              <label className="editor-field">
                <span>İlerleme / Detay (opsiyonel)</span>
                <input
                  type="text"
                  value={editor.progress ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, progress: e.target.value })}
                  placeholder="örn. Tüm sezonlar, 352 sayfa, 40 saat..."
                  maxLength={60}
                />
              </label>

              <label className="editor-field">
                <span>Bitirme Tarihi</span>
                <input
                  type="date"
                  value={editor.completedDate ?? ""}
                  onChange={(e) => onChangeEditor({ ...editor, completedDate: e.target.value })}
                />
              </label>
            </div>
          )}

          <label className="editor-field">
            <span>{editor.status === "planned" ? "Beklenti / Notlar" : "İnceleme / Kişisel Notlar"}</span>
            <textarea
              value={editor.review ?? ""}
              onChange={(e) => onChangeEditor({ ...editor, review: e.target.value })}
              placeholder={
                editor.status === "planned"
                  ? "Neden listene aldın? Beklentilerin, tür veya nereden duyduğun..."
                  : "Bu eser hakkında ne düşündün? Notların veya yorumun..."
              }
              rows={3}
              maxLength={1000}
            />
          </label>

          <div className="media-editor-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Vazgeç
            </button>
            <button type="submit" className="button button-primary">
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
