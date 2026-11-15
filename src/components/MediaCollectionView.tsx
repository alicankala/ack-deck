import { useState } from "react";
import {
  MEDIA_STATUS_LABELS,
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_LABELS,
  type MediaItem,
  type MediaStatus,
} from "../../shared/media";
import { buildMediaSections, type MediaCollectionEntry } from "../../shared/mediaGrouping";
import { MediaPoster, sanitizeMediaProgress } from "./MediaPoster";

type MediaCollectionViewProps = {
  totalCount: number;
  filteredCount: number;
  visibleItems: MediaItem[];
  visibleCount: number;
  viewMode: "grid" | "list";
  groupSeries: boolean;
  deleteId: string | null;
  onOpenNew: () => void;
  onOpenAi: () => void;
  onQuickStart: (item: MediaItem) => void;
  onQuickFinish: (item: MediaItem) => void;
  onEdit: (item: MediaItem) => void;
  onAskDelete: (id: string | null) => void;
  onConfirmDelete: (id: string) => void;
  onLoadMore: () => void;
};

/** Desktop Media Collection: unified poster showcase, status-sectioned list view, and inline series drawer. */
export function MediaCollectionView({
  totalCount,
  filteredCount,
  visibleItems,
  visibleCount,
  viewMode,
  groupSeries,
  deleteId,
  onOpenNew,
  onOpenAi,
  onQuickStart,
  onQuickFinish,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onLoadMore,
}: MediaCollectionViewProps) {
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<MediaStatus, boolean>>>({});

  if (filteredCount === 0) {
    return (
      <div className="media-empty surface">
        <span className="media-empty-icon" aria-hidden="true">🎬</span>
        <h3>{totalCount === 0 ? "Koleksiyonun Henüz Boş" : "Eşleşen Kayıt Bulunamadı"}</h3>
        <p>
          {totalCount === 0
            ? "İzlediğin filmleri, dizileri, okuduğun kitapları ve bitirdiğin oyunları ekleyip puanlayabilir, afiş ve kişisel notlarını tutabilirsin."
            : "Seçili filtrelere uygun film, dizi, kitap veya oyun bulunamadı."}
        </p>
        {totalCount === 0 && (
          <div style={{ display: "flex", gap: "0.65rem", marginTop: "0.5rem" }}>
            <button type="button" className="button button-primary" onClick={onOpenNew}>
              + İlk Kaydını Ekle
            </button>
            <button type="button" className="media-ai-btn" onClick={onOpenAi}>
              <span>✨</span> ACK AI ile Öneri Al
            </button>
          </div>
        )}
      </div>
    );
  }

  const sections = buildMediaSections(visibleItems, { groupSeries });

  const toggleSeries = (sectionKey: string) => {
    setExpandedSeries((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const toggleSection = (status: MediaStatus) => {
    setCollapsedSections((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const renderListRow = (item: MediaItem, nested = false) => (
    <article key={item.id} className={`surface media-list-row ${nested ? "is-nested" : ""}`}>
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
        </div>
        {item.creator && <span className="media-list-creator">{item.creator}</span>}
        {item.review && <p className="media-list-review">"{item.review}"</p>}
      </div>

      <div className="media-list-meta-cols">
        <span className={`media-status-chip is-${item.status}`}>
          {MEDIA_STATUS_LABELS[item.status]}
        </span>
        {(item.type === "movie" || item.type === "series") && item.imdbRating !== undefined && (
          <span className="media-imdb-badge" title={`IMDb: ${item.imdbRating}/10`}>
            🟡 {item.imdbRating}
          </span>
        )}
        {item.rating !== undefined && (
          <span className="media-rating-tag" title={`Senin Puanın: ${item.rating}/10`}>
            ⭐ {item.rating}/10
          </span>
        )}
        {sanitizeMediaProgress(item.progress) && (
          <span className="media-progress-tag">📌 {sanitizeMediaProgress(item.progress)}</span>
        )}
        {item.completedDate && (
          <span className="media-date-tag">
            🗓️ {item.completedDate.split("-").reverse().join(".")}
          </span>
        )}
      </div>

      <div className="media-list-actions">
        {item.status === "planned" && (
          <button
            type="button"
            className="media-action-btn is-start"
            onClick={() => onQuickStart(item)}
            title="Başla"
          >
            ▶ Başla
          </button>
        )}
        {item.status === "in_progress" && (
          <button
            type="button"
            className="media-action-btn is-finish"
            onClick={() => onQuickFinish(item)}
            title="Bitir"
          >
            ✓ Bitir
          </button>
        )}
        <button
          type="button"
          className="media-action-btn is-neutral"
          onClick={() => onEdit(item)}
        >
          Düzenle
        </button>
        <button
          type="button"
          className="media-action-btn media-delete-btn is-danger"
          onClick={() => onAskDelete(item.id)}
        >
          Sil
        </button>
      </div>

      {deleteId === item.id && (
        <div className="media-delete-confirm">
          <span>Silinsin mi?</span>
          <button type="button" onClick={() => onConfirmDelete(item.id)}>Evet</button>
          <button type="button" onClick={() => onAskDelete(null)}>Vazgeç</button>
        </div>
      )}
    </article>
  );

  const renderPosterCard = (item: MediaItem, nested = false) => {
    const scoreText =
      item.rating !== undefined
        ? `⭐ ${item.rating}`
        : (item.type === "movie" || item.type === "series") && item.imdbRating !== undefined
          ? `★ ${item.imdbRating}`
          : null;
    const subParts = [item.year, MEDIA_TYPE_LABELS[item.type]].filter(Boolean);

    return (
      <article
        key={item.id}
        className={`media-poster-card ${nested ? "is-nested" : ""}`}
      >
        <div
          className="media-poster-frame"
          onClick={() => onEdit(item)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEdit(item);
            }
          }}
          aria-label={`${item.title} detaylarını aç`}
        >
          <MediaPoster
            url={item.posterUrl}
            title={item.title}
            type={item.type}
            className="media-poster-img"
            placeholderClassName="media-poster-placeholder"
          />

          <div className="media-poster-corners">
            <span
              className="media-poster-corner-pill"
              title={`${MEDIA_TYPE_LABELS[item.type]} · ${MEDIA_STATUS_LABELS[item.status]}`}
            >
              <span className={`media-section-dot is-${item.status}`} aria-hidden="true" />
              <span>{MEDIA_TYPE_ICONS[item.type]}</span>
            </span>

            {scoreText && (
              <span
                className={`media-poster-corner-pill ${item.rating !== undefined ? "is-user-rating" : "is-imdb-rating"}`}
                title={item.rating !== undefined ? `Senin Puanın: ${item.rating}/10` : `IMDb: ${item.imdbRating}/10`}
              >
                {scoreText}
              </span>
            )}
          </div>

          <div className="media-poster-hover-actions" onClick={(e) => e.stopPropagation()}>
            {item.status === "planned" && (
              <button
                type="button"
                className="media-poster-hover-btn is-start"
                onClick={() => onQuickStart(item)}
                title="İzlemeye/Okumaya/Oynamaya Başla"
              >
                ▶ Başla
              </button>
            )}
            {item.status === "in_progress" && (
              <button
                type="button"
                className="media-poster-hover-btn is-finish"
                onClick={() => onQuickFinish(item)}
                title="Bitirildi olarak işaretle"
              >
                ✓ Bitir
              </button>
            )}
            {item.status === "completed" && (
              <button
                type="button"
                className="media-poster-hover-btn"
                onClick={() => onEdit(item)}
              >
                Detaylar
              </button>
            )}
            <button
              type="button"
              className="media-poster-hover-btn is-icon"
              onClick={() => onEdit(item)}
              title="Düzenle"
              aria-label="Düzenle"
            >
              ✎
            </button>
            <button
              type="button"
              className="media-poster-hover-btn media-delete-btn is-icon is-danger"
              onClick={() => onAskDelete(item.id)}
              title="Sil"
              aria-label="Sil"
            >
              🗑
            </button>
          </div>
        </div>

        <div className="media-poster-caption" onClick={() => onEdit(item)}>
          <h3 className="media-poster-title" title={item.title}>{item.title}</h3>
          <span className="media-poster-sub">{subParts.join(" · ")}</span>
        </div>

        {deleteId === item.id && (
          <div className="media-delete-confirm" onClick={(e) => e.stopPropagation()}>
            <span>Silinsin mi?</span>
            <button type="button" onClick={() => onConfirmDelete(item.id)}>Evet</button>
            <button type="button" onClick={() => onAskDelete(null)}>Vazgeç</button>
          </div>
        )}
      </article>
    );
  };

  const renderGridSeries = (entry: Extract<MediaCollectionEntry, { kind: "series" }>, sectionStatus: MediaStatus) => {
    const expandKey = `${sectionStatus}::${entry.key}`;
    const isExpanded = Boolean(expandedSeries[expandKey]);

    return (
      <div key={expandKey} style={{ display: "contents" }}>
        <article className={`media-poster-card is-series ${isExpanded ? "is-expanded" : ""}`}>
          <div
            className="media-poster-frame"
            onClick={() => toggleSeries(expandKey)}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleSeries(expandKey);
              }
            }}
          >
            <MediaPoster
              url={entry.posterUrl}
              title={entry.title}
              type={entry.type}
              className="media-poster-img"
              placeholderClassName="media-poster-placeholder"
            />
            <div className="media-poster-corners">
              <span className="media-poster-corner-pill">
                <span className={`media-section-dot is-${sectionStatus}`} aria-hidden="true" />
                <span>{MEDIA_TYPE_ICONS[entry.type]}</span>
              </span>
              <span className="media-poster-corner-pill is-series-pill">
                {entry.items.length} yapım
              </span>
            </div>
            <div className="media-poster-hover-actions">
              <span className="media-poster-hover-btn is-series-hint">
                {isExpanded ? "Seriyi Kapat ▴" : `Seriyi Aç (${entry.items.length}) ▾`}
              </span>
            </div>
          </div>
          <div className="media-poster-caption" onClick={() => toggleSeries(expandKey)}>
            <h3 className="media-poster-title" title={entry.title}>{entry.title}</h3>
            <span className="media-poster-sub">
              {[entry.yearRange, `${MEDIA_TYPE_LABELS[entry.type]} Serisi`].filter(Boolean).join(" · ")}
            </span>
          </div>
        </article>

        {isExpanded && (
          <div className="media-series-drawer surface">
            <div className="media-series-drawer-head">
              <div>
                <strong>{entry.title}</strong>
                {entry.yearRange && <span className="media-card-year"> ({entry.yearRange})</span>}
                <span className="media-series-drawer-count"> · {entry.items.length} yapım</span>
              </div>
              <button
                type="button"
                className="media-action-btn is-neutral"
                onClick={() => toggleSeries(expandKey)}
              >
                Kapat ✕
              </button>
            </div>
            <div className="media-poster-grid is-nested">
              {entry.items.map((child) => renderPosterCard(child, true))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSeriesListGroup = (entry: Extract<MediaCollectionEntry, { kind: "series" }>, sectionStatus: MediaStatus) => {
    const expandKey = `${sectionStatus}::${entry.key}`;
    const isExpanded = Boolean(expandedSeries[expandKey]);

    return (
      <div key={expandKey} className={`media-series-group ${isExpanded ? "is-expanded" : ""}`}>
        <article className="surface media-series-card">
          <div className="media-card-body-row">
            <div className="media-series-poster-stack">
              <MediaPoster
                url={entry.posterUrl}
                title={entry.title}
                type={entry.type}
                className="media-card-poster"
                placeholderClassName="media-card-poster-placeholder"
              />
            </div>
            <div className="media-card-info">
              <div className="media-card-top">
                <span className="media-card-type-chip">
                  {MEDIA_TYPE_ICONS[entry.type]} {MEDIA_TYPE_LABELS[entry.type]} Serisi
                </span>
                <span className="media-series-count-badge">
                  {entry.items.length} yapım
                </span>
              </div>

              <h3 className="media-card-title">
                {entry.title}
                {entry.yearRange && <span className="media-card-year"> ({entry.yearRange})</span>}
              </h3>

              <p className="media-series-preview-list">
                {entry.items.map((i) => i.year || i.title).join(" · ")}
              </p>

              <div className="media-card-actions">
                <button
                  type="button"
                  className="media-action-btn is-series-toggle"
                  onClick={() => toggleSeries(expandKey)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? "Seriyi Daralt ▴" : `Seriyi Aç (${entry.items.length}) ▾`}
                </button>
              </div>
            </div>
          </div>
        </article>

        {isExpanded && (
          <div className="media-series-children-list">
            {entry.items.map((child) => renderListRow(child, true))}
          </div>
        )}
      </div>
    );
  };

  if (viewMode === "grid") {
    const flatEntries = sections.flatMap((section) =>
      section.entries.map((entry) => ({ entry, status: section.status }))
    );

    return (
      <div className="media-sections-stack">
        <div className="media-poster-grid">
          {flatEntries.map(({ entry, status }) =>
            entry.kind === "series"
              ? renderGridSeries(entry, status)
              : renderPosterCard(entry.item)
          )}
        </div>

        {visibleCount < filteredCount && (
          <div style={{ display: "flex", justifyContent: "center", margin: "1.25rem 0", width: "100%" }}>
            <button
              type="button"
              className="media-action-btn is-neutral"
              onClick={onLoadMore}
              style={{ padding: "0.55rem 1.35rem", fontSize: "0.86rem" }}
            >
              Daha Fazla Göster ({visibleCount} / {filteredCount})
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="media-sections-stack">
      {sections.map((section) => {
        const isCollapsed = Boolean(collapsedSections[section.status]);
        return (
          <section key={section.status} className="media-status-section">
            <button
              type="button"
              className="media-section-header"
              onClick={() => toggleSection(section.status)}
              aria-expanded={!isCollapsed}
            >
              <div className="media-section-title-group">
                <span className={`media-section-dot is-${section.status}`} aria-hidden="true" />
                <h2 className="media-section-title">{section.label}</h2>
                <span className="media-section-count">{section.totalItems}</span>
              </div>
              <span className="media-section-chevron">{isCollapsed ? "▸" : "▾"}</span>
            </button>

            {!isCollapsed && (
              <div className="media-compact-list">
                {section.entries.map((entry) =>
                  entry.kind === "series"
                    ? renderSeriesListGroup(entry, section.status)
                    : renderListRow(entry.item)
                )}
              </div>
            )}
          </section>
        );
      })}

      {visibleCount < filteredCount && (
        <div style={{ display: "flex", justifyContent: "center", margin: "1.25rem 0", width: "100%" }}>
          <button
            type="button"
            className="media-action-btn is-neutral"
            onClick={onLoadMore}
            style={{ padding: "0.55rem 1.35rem", fontSize: "0.86rem" }}
          >
            Daha Fazla Göster ({visibleCount} / {filteredCount})
          </button>
        </div>
      )}
    </div>
  );
}
