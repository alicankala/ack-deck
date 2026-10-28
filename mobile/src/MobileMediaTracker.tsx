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
import { searchMediaCatalog, proxyPosterUrl, type MediaSearchCandidate } from "../../shared/mediaSearch";
import type { CloudRecord, Mutation } from "../../shared/phone";

function MobileMediaPoster({
  url,
  title,
  type,
  className = "mobile-media-poster",
}: {
  url?: string;
  title: string;
  type: MediaType;
  className?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const src = !loadFailed && url ? proxyPosterUrl(url) : null;
  if (!src) {
    return (
      <div className="mobile-media-poster-placeholder" aria-hidden="true">
        <span>{MEDIA_TYPE_ICONS[type]}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setLoadFailed(true)}
    />
  );
}

export function MobileMediaTracker({
  records,
  onSave,
  disabled = false,
  onNotice,
  onError,
}: {
  records: CloudRecord[];
  onSave: (mutation: Mutation) => Promise<void>;
  disabled?: boolean;
  onNotice: (text: string) => void;
  onError?: (text: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<MediaItem | null>(null);
  const [suggestions, setSuggestions] = useState<MediaSearchCandidate[]>([]);
  const [searchingMeta, setSearchingMeta] = useState(false);
  const [searchHasQueried, setSearchHasQueried] = useState(false);
  const suppressNextLookupRef = useRef(false);

  const triggerImmediateLookup = async (forcedQuery?: string) => {
    if (!editor) return;
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
    if (!editor) {
      setSuggestions([]);
      setSearchingMeta(false);
      setSearchHasQueried(false);
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
  }, [editor?.type, editor?.title]);

  const applyCandidate = (cand: MediaSearchCandidate) => {
    if (!editor) return;
    suppressNextLookupRef.current = true;
    setEditor({
      ...editor,
      type: (cand.suggestedType as MediaType) || editor.type,
      title: cand.title.slice(0, 160),
      posterUrl: cand.posterUrl || editor.posterUrl || "",
      year: cand.year || editor.year || "",
      creator: cand.creator || editor.creator || "",
      progress: editor.progress?.trim() ? editor.progress : (cand.progressHint ?? ""),
    });
    setSuggestions([]);
    setSearchHasQueried(false);
  };

  const items = records
    .filter((r) => r.kind === "mediaItems" && !r.deleted && r.data)
    .map((r) => r.data as MediaItem)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor || !editor.title.trim() || disabled) return;
    const cleanItem: MediaItem = {
      ...editor,
      title: editor.title.trim(),
      posterUrl: editor.posterUrl?.trim() || undefined,
      year: editor.year?.trim() || undefined,
      creator: editor.creator?.trim() || undefined,
      updatedAt: Date.now(),
    };
    const existingRow = records.find((r) => r.kind === "mediaItems" && r.id === cleanItem.id);
    const exists = Boolean(existingRow && !existingRow.deleted);
    try {
      await onSave({
        mutationId: crypto.randomUUID(),
        kind: "mediaItems",
        id: cleanItem.id,
        baseVersion: existingRow?.version ?? 0,
        deleted: false,
        data: cleanItem,
      });
      onNotice(exists ? "Kayıt güncellendi." : "Yeni kayıt eklendi.");
      setEditor(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Kayıt kaydedilemedi.");
    }
  };

  const handleDelete = async (id: string) => {
    if (disabled) return;
    if (!window.confirm("Bu kayıt silinsin mi?")) return;
    const existingRow = records.find((r) => r.kind === "mediaItems" && r.id === id);
    if (!existingRow) return;
    try {
      await onSave({
        mutationId: crypto.randomUUID(),
        kind: "mediaItems",
        id,
        baseVersion: existingRow.version,
        deleted: true,
        data: null,
      });
      onNotice("Kayıt silindi.");
      setEditor(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Kayıt silinemedi.");
    }
  };

  return (
    <div className="mobile-media-page">
      {/* Header */}
      <div className="mobile-media-header">
        <div>
          <h2>🎬 Koleksiyon</h2>
          <span className="mobile-media-subtitle">Film, Dizi, Kitap, Oyun</span>
        </div>
        <button
          type="button"
          className="mobile-button-primary"
          style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem", borderRadius: "10px" }}
          onClick={() => {
            suppressNextLookupRef.current = false;
            setEditor(newMediaItem(typeFilter === "all" ? "movie" : typeFilter));
          }}
        >
          + Ekle
        </button>
      </div>

      {/* Stats Chips */}
      <div className="mobile-media-stats">
        <button
          type="button"
          className={`stat-chip ${typeFilter === "movie" ? "active" : ""}`}
          onClick={() => setTypeFilter(typeFilter === "movie" ? "all" : "movie")}
        >
          <span>🎬 {counts.movie} Film</span>
        </button>
        <button
          type="button"
          className={`stat-chip ${typeFilter === "series" ? "active" : ""}`}
          onClick={() => setTypeFilter(typeFilter === "series" ? "all" : "series")}
        >
          <span>📺 {counts.series} Dizi</span>
        </button>
        <button
          type="button"
          className={`stat-chip ${typeFilter === "book" ? "active" : ""}`}
          onClick={() => setTypeFilter(typeFilter === "book" ? "all" : "book")}
        >
          <span>📚 {counts.book} Kitap</span>
        </button>
        <button
          type="button"
          className={`stat-chip ${typeFilter === "game" ? "active" : ""}`}
          onClick={() => setTypeFilter(typeFilter === "game" ? "all" : "game")}
        >
          <span>🎮 {counts.game} Oyun</span>
        </button>
      </div>

      {/* Filter strip */}
      <div className="mobile-media-filters">
        <div className="status-pills-row">
          {(["all", "completed", "in_progress", "planned"] as const).map((s) => (
            <button
              type="button"
              key={s}
              className={`pill-btn ${statusFilter === s ? "is-selected" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "Tümü" : MEDIA_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ara…"
          className="mobile-search-input"
        />
      </div>

      {/* Card List */}
      <div className="mobile-media-list">
        {filtered.length === 0 ? (
          <div className="mobile-empty-card">
            <p>{items.length === 0 ? "Henüz kayıtlı film, dizi, kitap veya oyun yok." : "Filtreye uygun kayıt bulunamadı."}</p>
          </div>
        ) : (
          filtered.map((item) => (
            <article
              key={item.id}
              className="mobile-media-card"
              onClick={() => {
                suppressNextLookupRef.current = true;
                setEditor({ ...item });
              }}
            >
              <div className="mobile-media-card-row">
                <MobileMediaPoster url={item.posterUrl} title={item.title} type={item.type} />
                <div className="mobile-media-card-main">
                  <div className="mobile-media-card-top">
                    <span className="type-badge">
                      {MEDIA_TYPE_ICONS[item.type]} {MEDIA_TYPE_LABELS[item.type]}
                    </span>
                    <span className={`status-badge is-${item.status}`}>
                      {MEDIA_STATUS_LABELS[item.status]}
                    </span>
                  </div>

                  <strong className="mobile-media-title">
                    {item.title}
                    {item.year && <span className="mobile-media-year"> ({item.year})</span>}
                  </strong>

                  {item.creator && <span className="mobile-media-creator">{item.creator}</span>}

                  <div className="mobile-media-meta">
                    {item.rating !== undefined && (
                      <span className="rating-tag">⭐ {item.rating}/10</span>
                    )}
                    {item.progress && (
                      <span className="progress-tag">📌 {item.progress}</span>
                    )}
                    {item.completedDate && (
                      <span className="date-tag">🗓️ {item.completedDate.split("-").reverse().join(".")}</span>
                    )}
                  </div>
                </div>
              </div>

              {item.review && (
                <p className="mobile-media-review">"{item.review}"</p>
              )}
            </article>
          ))
        )}
      </div>

      {/* Edit / Add Modal */}
      {editor && (
        <div className="mobile-modal-overlay" onClick={() => setEditor(null)} role="dialog" aria-modal="true">
          <div className="mobile-media-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-weather-top">
              <strong style={{ fontSize: "17px", fontWeight: 700 }}>
                {items.some((i) => i.id === editor.id) ? "Kaydı Düzenle" : "Yeni Koleksiyon Kaydı"}
              </strong>
              <button type="button" className="mobile-modal-close" onClick={() => setEditor(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
              <div className="mobile-media-type-choice">
                {(["movie", "series", "book", "game"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`mobile-type-btn ${editor.type === t ? "is-selected" : ""}`}
                    onClick={() => setEditor({ ...editor, type: t })}
                  >
                    <span className="mobile-type-icon">{MEDIA_TYPE_ICONS[t]}</span>
                    <span className="mobile-type-label">{MEDIA_TYPE_LABELS[t]}</span>
                  </button>
                ))}
              </div>

              <div className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px", position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>Başlık *</span>
                  {searchingMeta ? (
                    <span style={{ fontSize: "11px", color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <span className="media-mini-spinner" style={{ width: 10, height: 10 }} /> Aranıyor…
                    </span>
                  ) : suggestions.length > 0 ? (
                    <span style={{ fontSize: "11px", color: "#4ade80" }}>
                      ✨ {suggestions.length} eşleşme
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={editor.title}
                    onChange={(e) => {
                      setSearchHasQueried(false);
                      setEditor({ ...editor, title: e.target.value });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void triggerImmediateLookup();
                      }
                    }}
                    placeholder="İsim yazın (örn. Interstellar, Breaking Bad)..."
                    maxLength={160}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff" }}
                  />
                  <button
                    type="button"
                    disabled={searchingMeta || editor.title.trim().length < 2}
                    onClick={() => void triggerImmediateLookup()}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(96, 165, 250, 0.4)",
                      background: "rgba(96, 165, 250, 0.16)",
                      color: "#93c5fd",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
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
                            <img src={proxyPosterUrl(cand.posterUrl)} alt="" className="mobile-media-suggestion-thumb" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="mobile-media-suggestion-placeholder">{MEDIA_TYPE_ICONS[displayType]}</span>
                          )}
                          <div className="mobile-media-suggestion-info">
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <strong>{cand.title}</strong>
                              {isCrossType && (
                                <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", fontWeight: 700 }}>
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
                  <div style={{ fontSize: "11px", color: "var(--app-text-muted)", padding: "4px 6px", background: "rgba(255, 255, 255, 0.04)", borderRadius: "6px" }}>
                    ℹ️ "{editor.title}" için otomatik afiş bulunamadı. Başlığı kontrol edebilir veya bilgileri aşağıdan elle girebilirsin.
                  </div>
                )}
              </div>

              {(editor.posterUrl || editor.year || editor.creator) && (
                <div className="mobile-media-preview-box">
                  {editor.posterUrl && (
                    <img src={proxyPosterUrl(editor.posterUrl)} alt="" className="mobile-media-preview-poster" referrerPolicy="no-referrer" />
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "6px" }}>
                      <input
                        type="text"
                        value={editor.year ?? ""}
                        onChange={(e) => setEditor({ ...editor, year: e.target.value })}
                        placeholder="Yıl"
                        maxLength={24}
                        style={{ width: "100%", boxSizing: "border-box", minWidth: 0, padding: "6px 8px", borderRadius: "7px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff", fontSize: "12px" }}
                      />
                      <input
                        type="text"
                        value={editor.creator ?? ""}
                        onChange={(e) => setEditor({ ...editor, creator: e.target.value })}
                        placeholder="Yönetmen / Yazar / Stüdyo"
                        maxLength={160}
                        style={{ width: "100%", boxSizing: "border-box", minWidth: 0, padding: "6px 8px", borderRadius: "7px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff", fontSize: "12px" }}
                      />
                    </div>
                    {editor.posterUrl && (
                      <button
                        type="button"
                        onClick={() => setEditor({ ...editor, posterUrl: "" })}
                        style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "11px", textAlign: "left", padding: 0 }}
                      >
                        Afişi kaldır
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>Durum</span>
                  <select
                    value={editor.status}
                    onChange={(e) => setEditor({ ...editor, status: e.target.value as MediaStatus })}
                    style={{ padding: "8px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff" }}
                  >
                    <option value="completed">Bitirildi</option>
                    <option value="in_progress">Devam Ediyor</option>
                    <option value="planned">Listemde</option>
                  </select>
                </label>

                <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>Puan (1-10)</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={editor.rating ?? 8}
                    onChange={(e) => setEditor({ ...editor, rating: Number(e.target.value) })}
                    style={{ padding: "8px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>İlerleme / Sayfa</span>
                  <input
                    type="text"
                    value={editor.progress ?? ""}
                    onChange={(e) => setEditor({ ...editor, progress: e.target.value })}
                    placeholder="örn. S3 B2, 352 sayfa"
                    maxLength={60}
                    style={{ padding: "8px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff" }}
                  />
                </label>

                <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>Bitirme Tarihi</span>
                  <input
                    type="date"
                    value={editor.completedDate ?? ""}
                    onChange={(e) => setEditor({ ...editor, completedDate: e.target.value })}
                    style={{ padding: "8px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff" }}
                  />
                </label>
              </div>

              <label className="mobile-field" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>Notlar</span>
                <textarea
                  value={editor.review ?? ""}
                  onChange={(e) => setEditor({ ...editor, review: e.target.value })}
                  placeholder="Kişisel yorum veya notlar…"
                  rows={2}
                  maxLength={1000}
                  style={{ padding: "8px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff" }}
                />
              </label>

              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button type="submit" className="mobile-button-primary" style={{ flex: 1 }}>
                  Kaydet
                </button>
                {items.some((i) => i.id === editor.id) && (
                  <button
                    type="button"
                    className="mobile-button-secondary"
                    style={{ color: "#f87171" }}
                    onClick={() => handleDelete(editor.id)}
                  >
                    Sil
                  </button>
                )}
                <button
                  type="button"
                  className="mobile-button-secondary"
                  onClick={() => setEditor(null)}
                >
                  Vazgeç
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
