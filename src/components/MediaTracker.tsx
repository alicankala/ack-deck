import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  MEDIA_STATUS_LABELS,
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_LABELS,
  newMediaItem,
  type MediaItem,
  type MediaStatus,
  type MediaType,
} from "../../shared/media";
import { fetchMediaRating, searchMediaCatalog } from "../../shared/mediaSearch";
import { loadMedia, saveMedia } from "../mediaStore";
import { MediaAiAssistant } from "./MediaAiAssistant";
import { MediaCollectionView } from "./MediaCollectionView";
import { MediaFormModal } from "./MediaFormModal";
import { sanitizeMediaProgress } from "./MediaPoster";

type EditorState = {
  item: MediaItem;
  suppressLookup: boolean;
};

export function MediaTracker() {
  const [mediaData, setMediaData] = useState(loadMedia);
  const [items, setItems] = useState<MediaItem[]>(mediaData.entries);
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem("ack-deck.media-view-mode.v1") as "grid" | "list") || "grid";
    } catch {
      return "grid";
    }
  });
  const [refreshingRatings, setRefreshingRatings] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const PAGE_SIZE = 36;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const commit = (next: MediaItem[]) => {
    if (saveMedia(next, mediaData)) {
      setItems(next);
      return true;
    }
    return false;
  };

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
    commit(items.map((i) => (i.id === item.id ? updated : i)));
  };

  const handleQuickFinish = (item: MediaItem) => {
    setEditorState({
      suppressLookup: true,
      item: {
        ...item,
        progress: sanitizeMediaProgress(item.progress),
        status: "completed",
        rating: item.rating ?? 8,
        completedDate: item.completedDate || new Date().toISOString().slice(0, 10),
      },
    });
  };

  const handleRefreshImdbRatings = async () => {
    if (refreshingRatings) return;
    const targets = items.filter((i) => i.type === "movie" || i.type === "series");
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
    const candidates = items
      .filter(
        (i) =>
          (i.type === "movie" || i.type === "series") &&
          (!i.imdbRating || !i.imdbId || !i.imdbUpdatedAt || Date.now() - i.imdbUpdatedAt > 30 * 86400 * 1000)
      )
      .slice(0, 5);

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
    setVisibleCount(PAGE_SIZE);
  }, [typeFilter, statusFilter, search]);

  const openNewItemEditor = (type?: MediaType) => {
    const initialType: MediaType = type || (typeFilter === "all" ? "movie" : typeFilter);
    const initialStatus: MediaStatus =
      statusFilter === "planned"
        ? "planned"
        : statusFilter === "in_progress"
        ? "in_progress"
        : "completed";
    const item = newMediaItem(initialType);
    item.status = initialStatus;
    if (initialStatus === "planned" || initialStatus === "in_progress") {
      delete item.rating;
      delete item.completedDate;
    }
    setEditorState({ item, suppressLookup: false });
  };

  const handleAddItem = (item: MediaItem) => {
    commit([item, ...items]);
  };

  const handleUpdateItem = (item: MediaItem) => {
    commit(items.map((i) => (i.id === item.id ? item : i)));
  };

  const updateEditorItem = (updater: MediaItem | ((prev: MediaItem | null) => MediaItem | null)) => {
    setEditorState((prev) => {
      if (!prev) return null;
      const nextItem = typeof updater === "function" ? updater(prev.item) : updater;
      return nextItem ? { ...prev, item: nextItem } : null;
    });
  };

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
    const editor = editorState?.item;
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
    setEditorState(null);
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
      <MediaCollectionView
        totalCount={items.length}
        filteredCount={filtered.length}
        visibleItems={visibleItems}
        visibleCount={visibleCount}
        viewMode={viewMode}
        deleteId={deleteId}
        onOpenNew={() => openNewItemEditor()}
        onOpenAi={() => setAiModalOpen(true)}
        onQuickStart={handleQuickStart}
        onQuickFinish={handleQuickFinish}
        onEdit={(item) => setEditorState({ item: { ...item }, suppressLookup: true })}
        onAskDelete={setDeleteId}
        onConfirmDelete={handleDeleteItem}
        onLoadMore={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
      />

      {/* Editor Modal */}
      {editorState && (
        <MediaFormModal
          key={editorState.item.id}
          editor={editorState.item}
          isEditingExisting={items.some((i) => i.id === editorState.item.id)}
          initialSuppressLookup={editorState.suppressLookup}
          onChangeEditor={updateEditorItem}
          onClose={() => setEditorState(null)}
          onSave={handleSaveItem}
        />
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
