import { useEffect, useMemo, useState } from "react";
import {
  MEDIA_STATUS_LABELS,
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_LABELS,
  type MediaItem,
  type MediaType,
} from "../../shared/media";
import { getPosterFallbackUrls, proxyPosterUrl } from "../../shared/mediaSearch";

export function sanitizeMediaProgress(progress?: string): string | undefined {
  if (!progress) return undefined;
  const trimmed = progress.trim();
  if (trimmed === "Başlandı" || trimmed === "Yeniden başlandı") return undefined;
  return trimmed || undefined;
}

type MobileMediaPosterProps = {
  url?: string;
  title: string;
  type: MediaType;
  className?: string;
  placeholderClassName?: string;
};

/** Mobile media poster image with multi-URL fallback and type icon placeholder. */
export function MobileMediaPoster({
  url,
  title,
  type,
  className = "mobile-media-poster",
  placeholderClassName = "mobile-media-poster-placeholder",
}: MobileMediaPosterProps) {
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

type MobileMediaCardsProps = {
  totalCount: number;
  filtered: MediaItem[];
  visibleCount: number;
  viewMode: "grid" | "list";
  onOpenItem: (item: MediaItem) => void;
  onQuickStart: (item: MediaItem) => void;
  onQuickFinish: (item: MediaItem) => void;
  onLoadMore: () => void;
};

/** Mobile Media empty state, compact list view, and showcase grid cards. */
export function MobileMediaCards({
  totalCount,
  filtered,
  visibleCount,
  viewMode,
  onOpenItem,
  onQuickStart,
  onQuickFinish,
  onLoadMore,
}: MobileMediaCardsProps) {
  if (filtered.length === 0) {
    return (
      <div className="mobile-media-list">
        <div className="mobile-empty-card">
          <p>{totalCount === 0 ? "Henüz kayıtlı film, dizi, kitap veya oyun yok." : "Filtreye uygun kayıt bulunamadı."}</p>
        </div>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="mobile-media-compact-list">
        {filtered.slice(0, visibleCount).map((item) => (
          <div
            key={item.id}
            className="mobile-media-row-item"
            onClick={() => onOpenItem(item)}
          >
            {item.posterUrl ? (
              <img
                src={proxyPosterUrl(item.posterUrl)}
                alt={item.title}
                className="mobile-media-row-thumb"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="mobile-media-row-placeholder" aria-hidden="true">
                <span>{MEDIA_TYPE_ICONS[item.type]}</span>
              </div>
            )}

            <div className="mobile-media-row-info">
              <div className="mobile-media-row-top">
                <span className="mobile-media-type-chip mobile-media-type-chip-compact">
                  {MEDIA_TYPE_ICONS[item.type]}
                </span>
                <strong className="mobile-media-row-title">{item.title}</strong>
                {item.year && <small className="mobile-media-muted" style={{ fontSize: "10px" }}>({item.year})</small>}
                {(item.type === "movie" || item.type === "series") && item.imdbRating !== undefined && (
                  <span className="mobile-imdb-badge">🟡 {item.imdbRating}</span>
                )}
              </div>

              <div className="mobile-media-row-meta">
                {item.creator && <span>{item.creator}</span>}
                {item.rating !== undefined && <span className="mobile-media-rating-text">⭐ {item.rating}/10</span>}
                {sanitizeMediaProgress(item.progress) && (
                  <span className="mobile-media-progress-text">📌 {sanitizeMediaProgress(item.progress)}</span>
                )}
                {item.review && (
                  <span style={{ fontStyle: "italic", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }}>
                    "{item.review}"
                  </span>
                )}
              </div>
            </div>

            <div className="mobile-media-row-actions" onClick={(e) => e.stopPropagation()}>
              {item.status === "planned" && (
                <button
                  type="button"
                  className="mobile-row-quick-btn is-start"
                  onClick={() => onQuickStart(item)}
                  title="Hemen Başla"
                >
                  ▶ Başla
                </button>
              )}
              {item.status === "in_progress" && (
                <button
                  type="button"
                  className="mobile-row-quick-btn is-finish"
                  onClick={() => onQuickFinish(item)}
                  title="Bitir"
                >
                  ✓ Bitir
                </button>
              )}
            </div>
          </div>
        ))}

        {visibleCount < filtered.length && (
          <button
            type="button"
            className="mobile-button-secondary"
            onClick={onLoadMore}
            style={{ width: "100%", padding: "10px", margin: "8px 0", fontSize: "13px" }}
          >
            Daha Fazla Göster ({visibleCount} / {filtered.length})
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mobile-media-list">
      {filtered.slice(0, visibleCount).map((item) => (
        <article
          key={item.id}
          className="mobile-media-card"
          onClick={() => onOpenItem(item)}
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
                {(item.type === "movie" || item.type === "series") && item.imdbRating !== undefined && (
                  <span className="mobile-imdb-badge" title={`IMDb: ${item.imdbRating}/10`}>
                    🟡 {item.imdbRating}
                  </span>
                )}
                {item.rating !== undefined && <span className="rating-tag">⭐ {item.rating}/10</span>}
                {item.progress && <span className="progress-tag">📌 {item.progress}</span>}
                {item.completedDate && (
                  <span className="date-tag">🗓️ {item.completedDate.split("-").reverse().join(".")}</span>
                )}
              </div>
            </div>
          </div>

          {item.review && <p className="mobile-media-review">"{item.review}"</p>}

          <div className="mobile-media-card-actions" onClick={(e) => e.stopPropagation()}>
            {item.status === "planned" && (
              <button
                type="button"
                className="mobile-button-primary mobile-card-quick-btn"
                onClick={() => onQuickStart(item)}
                title="İzlemeye/Okumaya/Oynamaya Başla"
              >
                ▶ Başla
              </button>
            )}
            {item.status === "in_progress" && (
              <button
                type="button"
                className="mobile-button-primary mobile-card-quick-btn mobile-card-quick-finish"
                onClick={() => onQuickFinish(item)}
                title="Bitirildi olarak işaretle"
              >
                ✓ Bitir
              </button>
            )}
            <button
              type="button"
              className="mobile-button-secondary mobile-card-quick-btn"
              onClick={() => onOpenItem(item)}
            >
              Düzenle
            </button>
          </div>
        </article>
      ))}

      {visibleCount < filtered.length && (
        <button
          type="button"
          className="mobile-button-secondary"
          onClick={onLoadMore}
          style={{ width: "100%", padding: "10px", margin: "8px 0", fontSize: "13px" }}
        >
          Daha Fazla Göster ({visibleCount} / {filtered.length})
        </button>
      )}
    </div>
  );
}
