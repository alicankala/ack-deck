import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  type MediaItem,
  type MediaType,
  type MediaStatus,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPE_ICONS,
  MEDIA_STATUS_LABELS,
  newMediaItem,
} from "../../shared/media";
import { searchMediaCatalog, type MediaSearchCandidate } from "../../shared/mediaSearch";
import { loadMedia, saveMedia } from "../mediaStore";

export function MediaTracker() {
  const [mediaData, setMediaData] = useState(loadMedia);
  const [items, setItems] = useState<MediaItem[]>(mediaData.entries);
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<MediaItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MediaSearchCandidate[]>([]);
  const [searchingMeta, setSearchingMeta] = useState(false);
  const suppressNextLookupRef = useRef(false);

  useEffect(() => {
    const refresh = () => {
      const data = loadMedia();
      setMediaData(data);
      setItems(data.entries);
    };
    window.addEventListener("ack-media-changed", refresh);
    window.addEventListener("ack-data-changed", refresh);
    return () => {
      window.removeEventListener("ack-media-changed", refresh);
      window.removeEventListener("ack-data-changed", refresh);
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      setSuggestions([]);
      setSearchingMeta(false);
      return;
    }
    if (suppressNextLookupRef.current) {
      suppressNextLookupRef.current = false;
      return;
    }
    const q = editor.title.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearchingMeta(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingMeta(true);
      void searchMediaCatalog(editor.type, q, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) setSuggestions(res);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchingMeta(false);
        });
    }, 340);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [editor?.type, editor?.title]);

  const applyCandidate = (cand: MediaSearchCandidate) => {
    if (!editor) return;
    suppressNextLookupRef.current = true;
    setEditor({
      ...editor,
      title: cand.title.slice(0, 160),
      posterUrl: cand.posterUrl || editor.posterUrl || "",
      year: cand.year || editor.year || "",
      creator: cand.creator || editor.creator || "",
      progress: editor.progress?.trim() ? editor.progress : (cand.progressHint ?? ""),
    });
    setSuggestions([]);
  };

  const commit = (next: MediaItem[]) => {
    if (saveMedia(next, mediaData)) {
      setItems(next);
      return true;
    }
    return false;
  };

  const counts = {
    movie: items.filter((i) => i.type === "movie").length,
    series: items.filter((i) => i.type === "series").length,
    book: items.filter((i) => i.type === "book").length,
    game: items.filter((i) => i.type === "game").length,
  };

  const filtered = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchReview = item.review?.toLowerCase().includes(q);
      const matchProgress = item.progress?.toLowerCase().includes(q);
      const matchCreator = item.creator?.toLowerCase().includes(q);
      if (!matchTitle && !matchReview && !matchProgress && !matchCreator) return false;
    }
    return true;
  });

  const handleSaveItem = (e: FormEvent) => {
    e.preventDefault();
    if (!editor || !editor.title.trim()) return;
    const cleanItem: MediaItem = {
      ...editor,
      title: editor.title.trim(),
      posterUrl: editor.posterUrl?.trim() || undefined,
      year: editor.year?.trim() || undefined,
      creator: editor.creator?.trim() || undefined,
      updatedAt: Date.now(),
    };
    const exists = items.some((i) => i.id === cleanItem.id);
    const next = exists
      ? items.map((i) => (i.id === cleanItem.id ? cleanItem : i))
      : [cleanItem, ...items];
    commit(next);
    setEditor(null);
  };

  const handleDeleteItem = (id: string) => {
    commit(items.filter((i) => i.id !== id));
    setDeleteId(null);
  };

  return (
    <section className="media-tracker-page" aria-label="Koleksiyon">
      <header className="feature-heading page-header">
        <div>
          <h1>Koleksiyon</h1>
          <p>İzlediğin filmler, diziler, okuduğun kitaplar ve bitirdiğin oyunların kişisel koleksiyonu.</p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            suppressNextLookupRef.current = false;
            setEditor(newMediaItem(typeFilter === "all" ? "movie" : typeFilter));
          }}
        >
          + Yeni Kayıt Ekle
        </button>
      </header>

      {/* Stats Bar */}
      <div className="media-stats-strip">
        <div className={`media-stat-chip ${typeFilter === "movie" ? "is-active" : ""}`} onClick={() => setTypeFilter(typeFilter === "movie" ? "all" : "movie")}>
          <span className="media-stat-icon">🎬</span>
          <span className="media-stat-count">{counts.movie}</span>
          <span className="media-stat-label">Film</span>
        </div>
        <div className={`media-stat-chip ${typeFilter === "series" ? "is-active" : ""}`} onClick={() => setTypeFilter(typeFilter === "series" ? "all" : "series")}>
          <span className="media-stat-icon">📺</span>
          <span className="media-stat-count">{counts.series}</span>
          <span className="media-stat-label">Dizi</span>
        </div>
        <div className={`media-stat-chip ${typeFilter === "book" ? "is-active" : ""}`} onClick={() => setTypeFilter(typeFilter === "book" ? "all" : "book")}>
          <span className="media-stat-icon">📚</span>
          <span className="media-stat-count">{counts.book}</span>
          <span className="media-stat-label">Kitap</span>
        </div>
        <div className={`media-stat-chip ${typeFilter === "game" ? "is-active" : ""}`} onClick={() => setTypeFilter(typeFilter === "game" ? "all" : "game")}>
          <span className="media-stat-icon">🎮</span>
          <span className="media-stat-count">{counts.game}</span>
          <span className="media-stat-label">Oyun</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="media-toolbar">
        <div className="media-type-pills">
          {(["all", "movie", "series", "book", "game"] as const).map((t) => (
            <button
              type="button"
              key={t}
              className={`pill-btn ${typeFilter === t ? "is-selected" : ""}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === "all" ? "Tümü" : `${MEDIA_TYPE_ICONS[t]} ${MEDIA_TYPE_LABELS[t]}`}
            </button>
          ))}
        </div>

        <div className="media-status-pills">
          {(["all", "completed", "in_progress", "planned"] as const).map((s) => (
            <button
              type="button"
              key={s}
              className={`pill-btn ${statusFilter === s ? "is-selected" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "Tüm Durumlar" : MEDIA_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="media-search-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Başlık, yönetmen/yazar veya not ara…"
            className="media-search-input"
          />
        </div>
      </div>

      {/* Media Cards Grid */}
      <div className="media-grid">
        {filtered.length === 0 ? (
          <div className="media-empty surface">
            <span className="media-empty-icon" aria-hidden="true">🎬</span>
            <h3>{items.length === 0 ? "Koleksiyonun Henüz Boş" : "Eşleşen Kayıt Bulunamadı"}</h3>
            <p>
              {items.length === 0
                ? "İzlediğin filmleri, dizileri, okuduğun kitapları ve bitirdiğin oyunları ekleyip puanlayabilir, afiş ve kişisel notlarını tutabilirsin."
                : "Seçili filtrelere uygun film, dizi, kitap veya oyun bulunamadı."}
            </p>
            {items.length === 0 && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  suppressNextLookupRef.current = false;
                  setEditor(newMediaItem(typeFilter === "all" ? "movie" : typeFilter));
                }}
              >
                + İlk Kaydını Ekle
              </button>
            )}
          </div>
        ) : (
          filtered.map((item) => (
            <article key={item.id} className="surface media-card">
              <div className="media-card-body-row">
                {item.posterUrl && (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="media-card-poster"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <div className="media-card-info">
                  <div className="media-card-top">
                    <span className="media-card-type-chip">
                      {MEDIA_TYPE_ICONS[item.type]} {MEDIA_TYPE_LABELS[item.type]}
                    </span>
                    <span className={`media-status-chip is-${item.status}`}>
                      {MEDIA_STATUS_LABELS[item.status]}
                    </span>
                  </div>

                  <h3 className="media-card-title">
                    {item.title}
                    {item.year && <span className="media-card-year"> ({item.year})</span>}
                  </h3>

                  {item.creator && <p className="media-card-creator">{item.creator}</p>}

                  <div className="media-card-meta">
                    {item.rating !== undefined && (
                      <span className="media-rating-tag" title={`${item.rating}/10`}>
                        ⭐ {item.rating}/10
                      </span>
                    )}
                    {item.progress && (
                      <span className="media-progress-tag">
                        📌 {item.progress}
                      </span>
                    )}
                    {item.completedDate && (
                      <span className="media-date-tag">
                        🗓️ {item.completedDate.split("-").reverse().join(".")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {item.review && (
                <p className="media-card-review">"{item.review}"</p>
              )}

              <div className="media-card-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}
                  onClick={() => {
                    suppressNextLookupRef.current = true;
                    setEditor({ ...item });
                  }}
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem", color: "#f87171" }}
                  onClick={() => setDeleteId(item.id)}
                >
                  Sil
                </button>
              </div>

              {deleteId === item.id && (
                <div className="media-delete-confirm">
                  <span>Bu kayıt silinsin mi?</span>
                  <button type="button" onClick={() => handleDeleteItem(item.id)}>Evet</button>
                  <button type="button" onClick={() => setDeleteId(null)}>Vazgeç</button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {/* Editor Modal */}
      {editor && (
        <div className="media-modal-overlay" onClick={() => setEditor(null)} role="dialog" aria-modal="true">
          <div className="surface media-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="media-editor-header">
              <h3>{items.some((i) => i.id === editor.id) ? "Kaydı Düzenle" : "Yeni Koleksiyon Kaydı Ekle"}</h3>
              <button type="button" className="mobile-modal-close" onClick={() => setEditor(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="media-editor-form">
              <div className="media-type-choice">
                {(["movie", "series", "book", "game"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`type-choice-btn ${editor.type === t ? "is-selected" : ""}`}
                    onClick={() => setEditor({ ...editor, type: t })}
                  >
                    <span className="type-icon">{MEDIA_TYPE_ICONS[t]}</span>
                    <span className="type-text">{MEDIA_TYPE_LABELS[t]}</span>
                  </button>
                ))}
              </div>

              <div className="editor-field media-lookup-wrap">
                <span>Başlık * {searchingMeta && <small className="media-lookup-status">· Afiş ve bilgi aranıyor…</small>}</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  placeholder="İsim yazın (örn. Interstellar, Breaking Bad, Suç ve Ceza, Elden Ring)..."
                  maxLength={160}
                />
                {suggestions.length > 0 && (
                  <div className="media-suggestions-list" role="listbox" aria-label="Otomatik bulunan sonuçlar">
                    {suggestions.map((cand, idx) => (
                      <button
                        type="button"
                        key={`${cand.title}-${cand.year ?? idx}`}
                        className="media-suggestion-item"
                        onClick={() => applyCandidate(cand)}
                      >
                        {cand.posterUrl ? (
                          <img src={cand.posterUrl} alt="" className="media-suggestion-thumb" />
                        ) : (
                          <span className="media-suggestion-placeholder">{MEDIA_TYPE_ICONS[editor.type]}</span>
                        )}
                        <div className="media-suggestion-meta">
                          <strong>{cand.title}</strong>
                          <small>
                            {[cand.year, cand.creator, cand.progressHint].filter(Boolean).join(" · ") || MEDIA_TYPE_LABELS[editor.type]}
                          </small>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(editor.posterUrl || editor.year || editor.creator) && (
                <div className="media-selected-meta-preview">
                  {editor.posterUrl && (
                    <img src={editor.posterUrl} alt="" className="media-preview-poster" />
                  )}
                  <div className="media-preview-fields">
                    <div className="editor-row">
                      <label className="editor-field">
                        <span>Yıl</span>
                        <input
                          type="text"
                          value={editor.year ?? ""}
                          onChange={(e) => setEditor({ ...editor, year: e.target.value })}
                          placeholder="örn. 2014"
                          maxLength={24}
                        />
                      </label>
                      <label className="editor-field">
                        <span>Yönetmen / Yazar / Stüdyo</span>
                        <input
                          type="text"
                          value={editor.creator ?? ""}
                          onChange={(e) => setEditor({ ...editor, creator: e.target.value })}
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
                        onClick={() => setEditor({ ...editor, posterUrl: "" })}
                      >
                        Afişi kaldır
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="editor-row">
                <label className="editor-field">
                  <span>Durum</span>
                  <select
                    value={editor.status}
                    onChange={(e) => setEditor({ ...editor, status: e.target.value as MediaStatus })}
                  >
                    <option value="completed">Bitirildi / İzlendi / Okundu</option>
                    <option value="in_progress">Devam Ediyor</option>
                    <option value="planned">Listemde / Planlandı</option>
                  </select>
                </label>

                <label className="editor-field">
                  <span>Puan (1-10)</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={editor.rating ?? 8}
                    onChange={(e) => setEditor({ ...editor, rating: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="editor-row">
                <label className="editor-field">
                  <span>İlerleme / Bölüm / Sayfa (opsiyonel)</span>
                  <input
                    type="text"
                    value={editor.progress ?? ""}
                    onChange={(e) => setEditor({ ...editor, progress: e.target.value })}
                    placeholder="örn. 3. Sezon, 352 sayfa, 40 saat..."
                    maxLength={60}
                  />
                </label>

                <label className="editor-field">
                  <span>Bitirme Tarihi</span>
                  <input
                    type="date"
                    value={editor.completedDate ?? ""}
                    onChange={(e) => setEditor({ ...editor, completedDate: e.target.value })}
                  />
                </label>
              </div>

              <label className="editor-field">
                <span>İnceleme / Kişisel Notlar</span>
                <textarea
                  value={editor.review ?? ""}
                  onChange={(e) => setEditor({ ...editor, review: e.target.value })}
                  placeholder="Bu eser hakkında ne düşündün? Notların veya yorumun..."
                  rows={3}
                  maxLength={1000}
                />
              </label>

              <div className="media-editor-actions">
                <button type="submit" className="button button-primary">
                  Kaydet
                </button>
                <button type="button" className="button button-secondary" onClick={() => setEditor(null)}>
                  Vazgeç
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
