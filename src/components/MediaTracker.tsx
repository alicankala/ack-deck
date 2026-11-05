import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import {
  type MediaItem,
  type MediaType,
  type MediaStatus,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPE_ICONS,
  MEDIA_STATUS_LABELS,
  newMediaItem,
} from "../../shared/media";
import { searchMediaCatalog, getPosterFallbackUrls, fetchMediaRating, type MediaSearchCandidate } from "../../shared/mediaSearch";
import { loadMedia, saveMedia } from "../mediaStore";
import { MediaAiAssistant } from "./MediaAiAssistant";

function MediaPoster({
  url,
  title,
  type,
  className = "media-card-poster",
  placeholderClassName = "media-card-poster-placeholder",
}: {
  url?: string;
  title: string;
  type: MediaType;
  className?: string;
  placeholderClassName?: string;
}) {
  const fallbacks = useMemo(() => getPosterFallbackUrls(url), [url]);
  const [attemptIndex, setAttemptIndex] = useState(0);

  useEffect(() => {
    setAttemptIndex(0);
  }, [url]);

  const currentSrc = fallbacks[attemptIndex];
  if (!currentSrc || attemptIndex >= fallbacks.length) {
    return (
      <div className={placeholderClassName} aria-hidden="true">
        <span>{MEDIA_TYPE_ICONS[type]}</span>
      </div>
    );
  }
  return (
    <img
      src={currentSrc}
      alt={title}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setAttemptIndex((prev) => prev + 1);
      }}
    />
  );
}

function sanitizeMediaProgress(progress?: string): string | undefined {
  if (!progress) return undefined;
  const trimmed = progress.trim();
  if (trimmed === "Başlandı" || trimmed === "Yeniden başlandı") return undefined;
  return trimmed || undefined;
}

export function MediaTracker() {
  const [mediaData, setMediaData] = useState(loadMedia);
  const [items, setItems] = useState<MediaItem[]>(mediaData.entries);
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<MediaItem | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem("ack-deck.media-view-mode.v1") as "grid" | "list") || "grid";
    } catch {
      return "grid";
    }
  });

  const handleSetViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("ack-deck.media-view-mode.v1", mode);
    } catch {}
  };

  const handleQuickStart = (item: MediaItem) => {
    const updated: MediaItem = {
      ...item,
      status: "in_progress",
      progress: sanitizeMediaProgress(item.progress),
      updatedAt: Date.now(),
    };
    const next = items.map((i) => (i.id === item.id ? updated : i));
    commit(next);
  };

  const handleQuickFinish = (item: MediaItem) => {
    suppressNextLookupRef.current = true;
    setEditor({
      ...item,
      progress: sanitizeMediaProgress(item.progress),
      status: "completed",
      rating: item.rating ?? 8,
      completedDate: item.completedDate || new Date().toISOString().slice(0, 10),
    });
  };

  const [refreshingRatings, setRefreshingRatings] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const handleRefreshImdbRatings = async () => {
    if (refreshingRatings) return;
    const targets = items.filter(
      (i) => i.type === "movie" || i.type === "series"
    );
    if (targets.length === 0) {
      setRefreshNotice("Koleksiyonunuzda film veya dizi bulunamadı.");
      setTimeout(() => setRefreshNotice(null), 3000);
      return;
    }

    setRefreshingRatings(true);
    setRefreshNotice(`${targets.length} eserin IMDb puanı kontrol ediliyor...`);

    let updatedCount = 0;
    let currentList = [...items];

    for (let index = 0; index < targets.length; index++) {
      const item = targets[index];
      try {
        let activeImdbId = item.imdbId;
        if (!activeImdbId) {
          const candidates = await searchMediaCatalog(item.type, item.title);
          const matched = candidates.find((c) => c.imdbId);
          if (matched?.imdbId) activeImdbId = matched.imdbId;
        }

        if (activeImdbId) {
          const rating = await fetchMediaRating(activeImdbId);
          if (typeof rating === "number" && rating > 0 && (rating !== item.imdbRating || !item.imdbId)) {
            updatedCount++;
            const updated: MediaItem = {
              ...item,
              imdbId: activeImdbId,
              imdbRating: rating,
              imdbUpdatedAt: Date.now(),
            };
            currentList = currentList.map((x) => (x.id === item.id ? updated : x));
            commit(currentList);
          }
        }
      } catch {}
      if (index < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setRefreshingRatings(false);
    setRefreshNotice(
      updatedCount > 0
        ? `✅ ${updatedCount} eserin IMDb puanı güncellendi.`
        : "Tüm IMDb puanları zaten güncel."
    );
    setTimeout(() => setRefreshNotice(null), 4000);
  };

  useEffect(() => {
    // Sanitize any existing items that had 'Başlandı' or 'Yeniden başlandı'
    let hasDirty = false;
    const sanitized = items.map((item) => {
      const cleanP = sanitizeMediaProgress(item.progress);
      if (cleanP !== item.progress) {
        hasDirty = true;
        return { ...item, progress: cleanP };
      }
      return item;
    });
    if (hasDirty) {
      commit(sanitized);
    }
  }, []);

  useEffect(() => {
    const candidates = items.filter(
      (i) =>
        (i.type === "movie" || i.type === "series") &&
        (!i.imdbRating || !i.imdbId || !i.imdbUpdatedAt || Date.now() - i.imdbUpdatedAt > 30 * 86400 * 1000)
    ).slice(0, 5);

    if (candidates.length === 0) return;

    let cancelled = false;
    (async () => {
      let currentList = [...items];
      let hasChange = false;
      for (const item of candidates) {
        if (cancelled) break;
        try {
          let activeImdbId = item.imdbId;
          if (!activeImdbId) {
            const results = await searchMediaCatalog(item.type, item.title);
            const matched = results.find((c) => c.imdbId);
            if (matched?.imdbId) activeImdbId = matched.imdbId;
          }
          if (activeImdbId) {
            const rating = await fetchMediaRating(activeImdbId);
            if (!cancelled && typeof rating === "number" && rating > 0 && (rating !== item.imdbRating || !item.imdbId)) {
              hasChange = true;
              const updated: MediaItem = {
                ...item,
                imdbId: activeImdbId,
                imdbRating: rating,
                imdbUpdatedAt: Date.now(),
              };
              currentList = currentList.map((x) => (x.id === item.id ? updated : x));
              commit(currentList);
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled && hasChange) {
        commit(currentList);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);


  const openNewItemEditor = (type?: MediaType) => {
    suppressNextLookupRef.current = false;
    const initialType: MediaType = type || (typeFilter === "all" ? "movie" : typeFilter);
    const initialStatus: MediaStatus =
      statusFilter === "planned"
        ? "planned"
        : statusFilter === "in_progress"
        ? "in_progress"
        : "completed";
    const item = newMediaItem(initialType);
    item.status = initialStatus;
    if (initialStatus === "planned") {
      delete item.rating;
      delete item.completedDate;
    } else if (initialStatus === "in_progress") {
      delete item.rating;
      delete item.completedDate;
    }
    setEditor(item);
  };

  const handleAddItem = (item: MediaItem) => {
    const next = [item, ...items];
    commit(next);
  };

  const handleUpdateItem = (item: MediaItem) => {
    const next = items.map((i) => (i.id === item.id ? item : i));
    commit(next);
  };
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MediaSearchCandidate[]>([]);
  const [searchingMeta, setSearchingMeta] = useState(false);
  const [searchHasQueried, setSearchHasQueried] = useState(false);
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
    const nextType = (cand.suggestedType as MediaType) || editor.type;
    const nextItem: MediaItem = {
      ...editor,
      type: nextType,
      title: cand.title.slice(0, 160),
      posterUrl: cand.posterUrl || editor.posterUrl || "",
      year: cand.year || editor.year || "",
      creator: cand.creator || editor.creator || "",
      progress: editor.progress?.trim() ? editor.progress : (cand.progressHint ?? ""),
      imdbId: cand.imdbId || editor.imdbId,
      imdbRating: cand.imdbRating || editor.imdbRating,
    };
    setEditor(nextItem);
    setSuggestions([]);
    setSearchHasQueried(false);

    if ((nextType === "movie" || nextType === "series") && nextItem.imdbId && !nextItem.imdbRating) {
      void fetchMediaRating(nextItem.imdbId).then((rating) => {
        if (typeof rating === "number" && rating > 0) {
          setEditor((curr) =>
            curr && curr.id === nextItem.id
              ? { ...curr, imdbRating: rating, imdbUpdatedAt: Date.now() }
              : curr
          );
        }
      });
    }
  };

  const commit = (next: MediaItem[]) => {
    if (saveMedia(next, mediaData)) {
      setItems(next);
      return true;
    }
    return false;
  };

  const PAGE_SIZE = 36;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [typeFilter, statusFilter, search]);

  const counts = useMemo(
    () => ({
      movie: items.filter((i) => i.type === "movie").length,
      series: items.filter((i) => i.type === "series").length,
      book: items.filter((i) => i.type === "book").length,
      game: items.filter((i) => i.type === "game").length,
    }),
    [items]
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
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
  }, [items, typeFilter, statusFilter, search]);

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const handleSaveItem = (e: FormEvent) => {
    e.preventDefault();
    if (!editor || !editor.title.trim()) return;
    const cleanItem: MediaItem = {
      ...editor,
      title: editor.title.trim(),
      posterUrl: editor.posterUrl?.trim() || undefined,
      year: editor.year?.trim() || undefined,
      creator: editor.creator?.trim() || undefined,
      progress: (editor.status === "completed" ? sanitizeMediaProgress(editor.progress) : editor.progress?.trim()) || undefined,
      review: editor.review?.trim() || undefined,
      updatedAt: Date.now(),
    };
    if (editor.status === "planned") {
      delete cleanItem.rating;
      delete cleanItem.completedDate;
    } else if (editor.status === "in_progress") {
      delete cleanItem.completedDate;
    }
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
        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="media-ai-btn"
            onClick={() => setAiModalOpen(true)}
            title="ACK AI ile listenden seç veya zevkine göre yeni öneri al"
          >
            <span>✨</span> ACK AI Asistanı
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => openNewItemEditor()}
          >
            + Yeni Kayıt Ekle
          </button>
        </div>
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
      {refreshNotice && (
        <div className="media-refresh-notice surface">
          <span>{refreshNotice}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="media-toolbar">
        {/* Sol Grup: Tür ve Durum Filtreleri */}
        <div className="media-toolbar-filters">
          <div className="media-type-pills" role="group" aria-label="Tür Filtreleri">
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

          <div className="media-status-pills" role="group" aria-label="Durum Filtreleri">
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
        </div>

        {/* Sağ Grup: Arama, Puan Yenile ve Görünüm Seçici */}
        <div className="media-toolbar-actions">
          <div className="media-search-actions">
            <div className="media-search-wrap">
              <span className="media-search-icon" aria-hidden="true">🔍</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Film, dizi, kitap, yazar ara…"
                className="media-search-input"
              />
            </div>

            <button
              type="button"
              className={`media-refresh-ratings-btn ${refreshingRatings ? "is-loading" : ""}`}
              onClick={() => void handleRefreshImdbRatings()}
              title="Tüm film ve dizi IMDb puanlarını internetten güncelle"
              disabled={refreshingRatings}
            >
              <span>{refreshingRatings ? "⏳" : "🔄"}</span>
              <span>{refreshingRatings ? "Puanlar Güncelleniyor..." : "Puanları Yenile"}</span>
            </button>
          </div>

          <div className="media-view-toggle" role="group" aria-label="Görünüm Seçici">
            <button
              type="button"
              className={`pill-btn ${viewMode === "grid" ? "is-selected" : ""}`}
              onClick={() => handleSetViewMode("grid")}
              title="Vitrin / Kart Görünümü"
            >
              🔲 Vitrin
            </button>
            <button
              type="button"
              className={`pill-btn ${viewMode === "list" ? "is-selected" : ""}`}
              onClick={() => handleSetViewMode("list")}
              title="Kompakt Liste Görünümü"
            >
              ☰ Liste
            </button>
          </div>
        </div>
      </div>

      {/* Media Cards Grid or Compact List */}
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
            <div style={{ display: "flex", gap: "0.65rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="button button-primary"
                onClick={() => openNewItemEditor()}
              >
                + İlk Kaydını Ekle
              </button>
              <button
                type="button"
                className="media-ai-btn"
                onClick={() => setAiModalOpen(true)}
              >
                <span>✨</span> ACK AI ile Öneri Al
              </button>
            </div>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="media-compact-list">
          {visibleItems.map((item) => (
            <article key={item.id} className="surface media-list-row">
              <div className="media-list-thumb-wrap">
                <MediaPoster
                  url={item.posterUrl}
                  title={item.title}
                  type={item.type}
                  className="media-list-thumb"
                  placeholderClassName="media-list-thumb-placeholder"
                />
              </div>

              <div className="media-list-main-info">
                <div className="media-list-title-row">
                  <span className="media-list-type-tag">
                    {MEDIA_TYPE_ICONS[item.type]} {MEDIA_TYPE_LABELS[item.type]}
                  </span>
                  <h3 className="media-list-title">
                    {item.title}
                    {item.year && <span className="media-card-year"> ({item.year})</span>}
                  </h3>
                  {(item.type === "movie" || item.type === "series") && item.imdbRating !== undefined && (
                    <span className="media-imdb-badge" title={`IMDb Puanı: ${item.imdbRating}/10`}>
                      🟡 {item.imdbRating}
                    </span>
                  )}{(item.type === "movie" || item.type === "series") && item.imdbRating !== undefined && (
                      <span className="media-imdb-badge" title={`IMDb Puanı: ${item.imdbRating}/10`}>
                        🟡 {item.imdbRating}
                      </span>
                    )}
                    
                  {item.rating !== undefined && (
                    <span className="media-rating-tag" title={`${item.rating}/10`}>
                      ⭐ {item.rating}/10
                    </span>
                  )}
                  <span className={`media-status-chip is-${item.status}`}>
                    {MEDIA_STATUS_LABELS[item.status]}
                  </span>
                </div>

                <div className="media-list-sub-row">
                  {item.creator && <span className="media-list-creator">{item.creator}</span>}
                  {item.progress && (
                    <span className="media-list-progress">
                      📌 {item.progress}
                    </span>
                  )}
                  {item.completedDate && (
                    <span className="media-list-date">
                      🗓️ {item.completedDate.split("-").reverse().join(".")}
                    </span>
                  )}
                  {item.review && (
                    <span className="media-list-note" title={item.review}>
                      💬 "{item.review.slice(0, 90)}{item.review.length > 90 ? "…" : ""}"
                    </span>
                  )}
                </div>
              </div>

              <div className="media-list-actions">
                {item.status === "planned" && (
                  <button
                    type="button"
                    className="button button-primary media-quick-start-btn"
                    onClick={() => handleQuickStart(item)}
                    title="Hemen Başla (Devam Ediyor Yap)"
                  >
                    ▶ Başla
                  </button>
                )}
                {item.status === "in_progress" && (
                  <button
                    type="button"
                    className="button button-primary media-quick-finish-btn"
                    onClick={() => handleQuickFinish(item)}
                    title="Bitirildi Olarak İşaretle"
                  >
                    ✓ Bitir
                  </button>
                )}
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ padding: "0.28rem 0.65rem", fontSize: "0.8rem" }}
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
                  style={{ padding: "0.28rem 0.65rem", fontSize: "0.8rem", color: "#f87171" }}
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
          ))}
          {visibleCount < filtered.length && (
            <div style={{ display: "flex", justifyContent: "center", margin: "1.25rem 0", width: "100%" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                style={{ padding: "0.6rem 1.4rem", fontSize: "0.9rem" }}
              >
                Daha Fazla Göster ({visibleCount} / {filtered.length})
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="media-grid">
          {visibleItems.map((item) => (
            <article key={item.id} className="surface media-card">
              <div className="media-card-body-row">
                <MediaPoster
                  url={item.posterUrl}
                  title={item.title}
                  type={item.type}
                  className="media-card-poster"
                  placeholderClassName="media-card-poster-placeholder"
                />
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
                    {(item.type === "movie" || item.type === "series") && item.imdbRating !== undefined && (
                      <span className="media-imdb-badge" title={`IMDb Puanı: ${item.imdbRating}/10`}>
                        🟡 {item.imdbRating}
                      </span>
                    )}
                    {item.rating !== undefined && (
                      <span className="media-rating-tag" title={`Senin Puanın: ${item.rating}/10`}>
                        ⭐ {item.rating}/10
                      </span>
                    )}
                    {item.completedDate && (
                      <span className="media-date-tag">
                        🗓️ {item.completedDate.split("-").reverse().join(".")}
                      </span>
                    )}
                    {sanitizeMediaProgress(item.progress) && (
                      <span className="media-progress-tag">
                        📌 {sanitizeMediaProgress(item.progress)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {item.review && (
                <p className="media-card-review">"{item.review}"</p>
              )}

              <div className="media-card-actions">
                {item.status === "planned" && (
                  <button
                    type="button"
                    className="button button-primary media-card-quick-start"
                    onClick={() => handleQuickStart(item)}
                    title="İzlemeye/Okumaya/Oynamaya Başla"
                  >
                    ▶ Başla
                  </button>
                )}
                {item.status === "in_progress" && (
                  <button
                    type="button"
                    className="button button-primary media-card-quick-finish"
                    onClick={() => handleQuickFinish(item)}
                    title="Bitirildi olarak işaretle"
                  >
                    ✓ Bitir
                  </button>
                )}
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
          ))}
          {visibleCount < filtered.length && (
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", margin: "1.5rem 0", width: "100%" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                style={{ padding: "0.6rem 1.4rem", fontSize: "0.9rem" }}
              >
                Daha Fazla Göster ({visibleCount} / {filtered.length})
              </button>
            </div>
          )}
        </div>
      )}

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
                      setEditor({ ...editor, title: e.target.value });
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
                        setEditor({
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
                      setEditor(updated);
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
                      onChange={(e) => setEditor({ ...editor, rating: Number(e.target.value) })}
                    />
                  </label>
                ) : editor.status === "in_progress" ? (
                  <label className="editor-field">
                    <span>İlerleme Durumu</span>
                    <input
                      type="text"
                      value={editor.progress ?? ""}
                      onChange={(e) => setEditor({ ...editor, progress: e.target.value })}
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
                      onChange={(e) => setEditor({ ...editor, progress: e.target.value })}
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
                      onChange={(e) => setEditor({ ...editor, progress: e.target.value })}
                      placeholder="örn. Tüm sezonlar, 352 sayfa, 40 saat..."
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
              )}

              <label className="editor-field">
                <span>{editor.status === "planned" ? "Beklenti / Notlar" : "İnceleme / Kişisel Notlar"}</span>
                <textarea
                  value={editor.review ?? ""}
                  onChange={(e) => setEditor({ ...editor, review: e.target.value })}
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
                <button type="button" className="button button-secondary" onClick={() => setEditor(null)}>
                  Vazgeç
                </button>
                <button type="submit" className="button button-primary">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {aiModalOpen && (
        <MediaAiAssistant
          items={items}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onClose={() => setAiModalOpen(false)}
        />
      )}
    </section>
  );
}
