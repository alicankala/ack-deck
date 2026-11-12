import { useEffect, useState, type FormEvent } from "react";
import {
  MEDIA_STATUS_LABELS,
  newMediaItem,
  type MediaItem,
  type MediaStatus,
  type MediaType,
} from "../../shared/media";
import { fetchMediaRating, searchMediaCatalog } from "../../shared/mediaSearch";
import type { CloudRecord, Mutation } from "../../shared/phone";
import { MobileMediaAiAssistant } from "./MobileMediaAiAssistant";
import { MobileMediaCards, sanitizeMediaProgress } from "./MobileMediaCards";
import { MobileMediaFormModal } from "./MobileMediaModals";
import type { MobileState } from "./store";

type EditorState = {
  item: MediaItem;
  suppressLookup: boolean;
};

export function MobileMediaTracker({
  state,
  records,
  onSave,
  disabled = false,
  onNotice,
  onError,
}: {
  state: MobileState;
  records: CloudRecord[];
  onSave: (mutation: Mutation) => Promise<void>;
  disabled?: boolean;
  onNotice: (text: string) => void;
  onError?: (text: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem("ack-deck.mobile-media-view-mode.v1") as "grid" | "list") || "grid";
    } catch {
      return "grid";
    }
  });
  const [refreshingRatings, setRefreshingRatings] = useState(false);

  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [typeFilter, statusFilter, search]);

  const items = records
    .filter((r) => r.kind === "mediaItems" && !r.deleted && r.data)
    .map((r) => r.data as MediaItem)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  const handleSetViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("ack-deck.mobile-media-view-mode.v1", mode);
    } catch {}
  };

  const handleQuickStart = async (item: MediaItem) => {
    try {
      const existingRow = records.find((r) => r.kind === "mediaItems" && r.id === item.id);
      await onSave({
        mutationId: crypto.randomUUID(),
        kind: "mediaItems",
        id: item.id,
        baseVersion: existingRow?.version ?? 0,
        deleted: false,
        data: {
          ...item,
          status: "in_progress",
          progress: sanitizeMediaProgress(item.progress),
          updatedAt: Date.now(),
        },
      });
      onNotice("Eser 'Devam Ediyor' durumuna alındı.");
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Durum güncellenemedi.");
    }
  };

  const handleQuickFinish = (item: MediaItem) => {
    setEditorState({
      suppressLookup: true,
      item: {
        ...item,
        status: "completed",
        rating: item.rating ?? 8,
        completedDate: item.completedDate || new Date().toISOString().slice(0, 10),
      },
    });
  };

  const handleRefreshImdbRatings = async () => {
    if (refreshingRatings) return;
    const targets = items.filter((i) => (i.type === "movie" || i.type === "series") && i.imdbId);
    if (targets.length === 0) {
      onNotice("Yenilenecek IMDb kodlu film veya dizi yok.");
      return;
    }

    setRefreshingRatings(true);
    onNotice(`${targets.length} eserin puanı kontrol ediliyor...`);

    let updatedCount = 0;
    for (let index = 0; index < targets.length; index++) {
      const item = targets[index];
      try {
        const rating = await fetchMediaRating(item.imdbId!);
        if (typeof rating === "number" && rating > 0 && rating !== item.imdbRating) {
          updatedCount++;
          const existingRow = records.find((r) => r.kind === "mediaItems" && r.id === item.id);
          await onSave({
            mutationId: crypto.randomUUID(),
            kind: "mediaItems",
            id: item.id,
            baseVersion: existingRow?.version ?? 0,
            deleted: false,
            data: {
              ...item,
              imdbRating: rating,
              imdbUpdatedAt: Date.now(),
            },
          });
        }
      } catch {}
      if (index < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setRefreshingRatings(false);
    onNotice(updatedCount > 0 ? `✅ ${updatedCount} eserin IMDb puanı güncellendi.` : "Tüm puanlar zaten güncel.");
  };

  // Background auto-resolve for missing IMDb ratings & IDs
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
            if (!cancelled && typeof rating === "number" && rating > 0) {
              const existingRow = records.find((r) => r.kind === "mediaItems" && r.id === item.id);
              await onSave({
                mutationId: crypto.randomUUID(),
                kind: "mediaItems",
                id: item.id,
                baseVersion: existingRow?.version ?? 0,
                deleted: false,
                data: {
                  ...item,
                  imdbId: activeImdbId,
                  imdbRating: rating,
                  imdbUpdatedAt: Date.now(),
                },
              });
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddItemFromAi = async (item: MediaItem) => {
    await onSave({
      mutationId: crypto.randomUUID(),
      kind: "mediaItems",
      id: item.id,
      baseVersion: 0,
      deleted: false,
      data: item,
    });
  };

  const handleUpdateItemFromAi = async (item: MediaItem) => {
    const existingRow = records.find((r) => r.kind === "mediaItems" && r.id === item.id);
    await onSave({
      mutationId: crypto.randomUUID(),
      kind: "mediaItems",
      id: item.id,
      baseVersion: existingRow?.version ?? 0,
      deleted: false,
      data: item,
    });
  };

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

  const updateEditorItem = (updater: MediaItem | ((prev: MediaItem | null) => MediaItem | null)) => {
    setEditorState((prev) => {
      if (!prev) return null;
      const nextItem = typeof updater === "function" ? updater(prev.item) : updater;
      return nextItem ? { ...prev, item: nextItem } : null;
    });
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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const editor = editorState?.item;
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
      setEditorState(null);
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
      setEditorState(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Kayıt silinemedi.");
    }
  };

  return (
    <div className="mobile-media-page">
      {/* Header */}
      <div className="mobile-media-header">
        <h2>🎬 Koleksiyon</h2>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button
            type="button"
            className="pill-btn mobile-media-ai-trigger"
            onClick={() => setAiModalOpen(true)}
          >
            ✨ ACK AI
          </button>
          <button
            type="button"
            className="mobile-button-primary"
            style={{ padding: "6px 14px", fontSize: "12.5px", fontWeight: 650, borderRadius: "10px" }}
            onClick={() => openNewItemEditor()}
          >
            + Ekle
          </button>
        </div>
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

        <div style={{ display: "flex", gap: "6px", alignItems: "center", width: "100%" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
            className="mobile-search-input"
            style={{ flex: 1, minWidth: 0, fontSize: "16px" }}
          />
          <div style={{ display: "inline-flex", gap: "3px", flexShrink: 0 }}>
            <button
              type="button"
              className={`pill-btn ${viewMode === "grid" ? "is-selected" : ""}`}
              onClick={() => handleSetViewMode("grid")}
              title="Vitrin Görünümü"
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              🔲
            </button>
            <button
              type="button"
              className={`pill-btn ${viewMode === "list" ? "is-selected" : ""}`}
              onClick={() => handleSetViewMode("list")}
              title="Liste Görünümü"
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              ☰
            </button>
            <button
              type="button"
              className="mobile-refresh-ratings-btn"
              onClick={() => void handleRefreshImdbRatings()}
              title="IMDb Puanlarını Yenile"
              disabled={refreshingRatings}
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              {refreshingRatings ? "..." : "🔄"}
            </button>
          </div>
        </div>
      </div>

      {/* Card List */}
      <MobileMediaCards
        totalCount={items.length}
        filtered={filtered}
        visibleCount={visibleCount}
        viewMode={viewMode}
        onOpenItem={(item) => setEditorState({ item: { ...item }, suppressLookup: true })}
        onQuickStart={(item) => void handleQuickStart(item)}
        onQuickFinish={handleQuickFinish}
        onLoadMore={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
      />

      {/* Edit / Add Modal */}
      {editorState && (
        <MobileMediaFormModal
          key={editorState.item.id}
          editor={editorState.item}
          isEditingExisting={items.some((i) => i.id === editorState.item.id)}
          initialSuppressLookup={editorState.suppressLookup}
          onChangeEditor={updateEditorItem}
          onClose={() => setEditorState(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {aiModalOpen && (
        <MobileMediaAiAssistant
          items={items}
          state={state}
          onAddItem={handleAddItemFromAi}
          onUpdateItem={handleUpdateItemFromAi}
          onClose={() => setAiModalOpen(false)}
          onNotice={onNotice}
          onError={(err) => onError?.(err)}
        />
      )}
    </div>
  );
}
