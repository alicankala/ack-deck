import { useEffect, useMemo, useState } from "react";
import {
  MEDIA_STATUS_LABELS,
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_LABELS,
  type MediaItem,
  type MediaStatus,
  type MediaType,
} from "../../shared/media";
import { buildMediaSections, type MediaCollectionEntry } from "../../shared/mediaGrouping";
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
  groupSeries: boolean;
  onOpenItem: (item: MediaItem) => void;
  onQuickStart: (item: MediaItem) => void;
  onQuickFinish: (item: MediaItem) => void;
  onLoadMore: () => void;
};

/** Mobile Media empty state, status-sectioned list/showcase cards, and collapsible series groups. */
export function MobileMediaCards({
  totalCount,
  filtered,
  visibleCount,
  viewMode,
  groupSeries,
  onOpenItem,
  onQuickStart,
  onQuickFinish,
  onLoadMore,
}: MobileMediaCardsProps) {
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<MediaStatus, boolean>>>({});

  if (filtered.length === 0) {
    return (
      <div className="mobile-media-list">
        <div className="mobile-empty-card">
          <p>{totalCount === 0 ? "Henüz kayıtlı film, dizi, kitap veya oyun yok." : "Filtreye uygun kayıt bulunamadı."}</p>
        </div>
      </div>
    );
  }

  const sections = buildMediaSections(filtered.slice(0, visibleCount), { groupSeries });

  const toggleSeries = (key: string) => {
    setExpandedSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSection = (status: MediaStatus) => {
    setCollapsedSections((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const renderListRow = (item: MediaItem, nested = false) => (
    <div
      key={item.id}
      className={`mobile-media-row-item ${nested ? "is-nested" : ""}`}
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

      <div className="mobile-media-row-body">
        <div className="mobile-media-row-top">
          <strong className="mobile-media-row-title">
            {item.title}
            {item.year && <span className="mobile-media-year"> ({item.year})</span>}
          </strong>
        </div>
        <div className="mobile-media-row-sub">
          <span className={`status-badge is-${item.status}`}>{MEDIA_STATUS_LABELS[item.status]}</span>
          {(item.type === "movie" || item.type === "series") && item.imdbRating !== undefined && (
            <span className="mobile-imdb-badge">🟡 {item.imdbRating}</span>
          )}
          {item.rating !== undefined && <span className="rating-tag">⭐ {item.rating}/10</span>}
        </div>
      </div>

      <div className="mobile-media-row-actions" onClick={(e) => e.stopPropagation()}>
        {item.status === "planned" && (
          <button
            type="button"
            className="mobile-row-quick-btn is-start"
            onClick={() => onQuickStart(item)}
            title="Başla"
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
  );

  const renderShowcaseCard = (item: MediaItem, nested = false) => (
    <article
      key={item.id}
      className={`mobile-media-card ${nested ? "is-nested" : ""}`}
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
            {sanitizeMediaProgress(item.progress) && (
              <span className="progress-tag">📌 {sanitizeMediaProgress(item.progress)}</span>
            )}
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
            className="mobile-media-action-btn is-start"
            onClick={() => onQuickStart(item)}
            title="İzlemeye/Okumaya/Oynamaya Başla"
          >
            ▶ Başla
          </button>
        )}
        {item.status === "in_progress" && (
          <button
            type="button"
            className="mobile-media-action-btn is-finish"
            onClick={() => onQuickFinish(item)}
            title="Bitirildi olarak işaretle"
          >
            ✓ Bitir
          </button>
        )}
        <button
          type="button"
          className="mobile-media-action-btn is-neutral"
          onClick={() => onOpenItem(item)}
        >
          Düzenle
        </button>
      </div>
    </article>
  );

  const renderSeriesGroup = (
    entry: Extract<MediaCollectionEntry, { kind: "series" }>,
    sectionStatus: MediaStatus
  ) => {
    const expandKey = `${sectionStatus}::${entry.key}`;
    const isExpanded = Boolean(expandedSeries[expandKey]);

    return (
      <div key={expandKey} className={`mobile-series-group ${isExpanded ? "is-expanded" : ""}`}>
        <div
          className="mobile-series-card"
          onClick={() => toggleSeries(expandKey)}
          role="button"
          tabIndex={0}
        >
          <div className="mobile-media-card-row">
            <MobileMediaPoster url={entry.posterUrl} title={entry.title} type={entry.type} />
            <div className="mobile-media-card-main">
              <div className="mobile-media-card-top">
                <span className="type-badge">
                  {MEDIA_TYPE_ICONS[entry.type]} {MEDIA_TYPE_LABELS[entry.type]} Serisi
                </span>
                <span className="mobile-series-count-badge">{entry.items.length} yapım</span>
              </div>

              <strong className="mobile-media-title">
                {entry.title}
                {entry.yearRange && <span className="mobile-media-year"> ({entry.yearRange})</span>}
              </strong>

              <span className="mobile-media-creator">
                {entry.items.map((i) => i.year || i.title).join(" · ")}
              </span>

              <div className="mobile-series-toggle-row">
                <span className="mobile-series-toggle-hint">
                  {isExpanded ? "Kapat ▴" : `Seriyi Aç (${entry.items.length}) ▾`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="mobile-series-children">
            {entry.items.map((child) =>
              viewMode === "list" ? renderListRow(child, true) : renderShowcaseCard(child, true)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mobile-media-sections">
      {sections.map((section) => {
        const isCollapsed = Boolean(collapsedSections[section.status]);
        return (
          <section key={section.status} className="mobile-media-section">
            <button
              type="button"
              className="mobile-media-section-header"
              onClick={() => toggleSection(section.status)}
              aria-expanded={!isCollapsed}
            >
              <div className="mobile-media-section-title-group">
                <span className={`mobile-media-section-dot is-${section.status}`} aria-hidden="true" />
                <span className="mobile-media-section-title">{section.label}</span>
                <span className="mobile-media-section-count">{section.totalItems}</span>
              </div>
              <span className="mobile-media-section-chevron">{isCollapsed ? "▸" : "▾"}</span>
            </button>

            {!isCollapsed && (
              <div className={viewMode === "list" ? "mobile-media-compact-list" : "mobile-media-list"}>
                {section.entries.map((entry) =>
                  entry.kind === "series"
                    ? renderSeriesGroup(entry, section.status)
                    : viewMode === "list"
                      ? renderListRow(entry.item)
                      : renderShowcaseCard(entry.item)
                )}
              </div>
            )}
          </section>
        );
      })}

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
