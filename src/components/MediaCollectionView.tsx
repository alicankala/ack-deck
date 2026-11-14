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

type CardActionsProps = {
  item: MediaItem;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  onQuickStart: (item: MediaItem) => void;
  onQuickFinish: (item: MediaItem) => void;
  onEdit: (item: MediaItem) => void;
  onAskDelete: (id: string | null) => void;
};

function CardActionBar({
  item,
  menuOpenId,
  setMenuOpenId,
  onQuickStart,
  onQuickFinish,
  onEdit,
  onAskDelete,
}: CardActionsProps) {
  const isMenuOpen = menuOpenId === item.id;

  return (
    <div className="media-card-actions">
      <div className="media-card-primary-slot">
        {item.status === "planned" && (
          <button
            type="button"
            className="media-action-btn is-start"
            onClick={() => onQuickStart(item)}
            title="İzlemeye/Okumaya/Oynamaya Başla"
          >
            ▶ Başla
          </button>
        )}
        {item.status === "in_progress" && (
          <button
            type="button"
            className="media-action-btn is-finish"
            onClick={() => onQuickFinish(item)}
            title="Bitirildi olarak işaretle"
          >
            ✓ Bitir
          </button>
        )}
        {item.status === "completed" && (
          <button
            type="button"
            className="media-action-btn is-neutral"
            onClick={() => onEdit(item)}
          >
            Detaylar
          </button>
        )}
      </div>

      <div className="media-card-menu-wrap">
        <button
          type="button"
          className={`media-more-btn ${isMenuOpen ? "is-open" : ""}`}
          onClick={() => setMenuOpenId(isMenuOpen ? null : item.id)}
          aria-label="Diğer işlemler"
          aria-expanded={isMenuOpen}
        >
          ⋯
        </button>
        {isMenuOpen && (
          <div className="media-card-dropdown" role="menu">
            <button
              type="button"
              className="media-dropdown-item"
              onClick={() => {
                setMenuOpenId(null);
                onEdit(item);
              }}
            >
              Düzenle
            </button>
            <button
              type="button"
              className="media-dropdown-item media-delete-btn is-danger"
              onClick={() => {
                setMenuOpenId(null);
                onAskDelete(item.id);
              }}
            >
              Sil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Desktop Media Collection: status sections, series grouping, and clean showcase/list cards. */
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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
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

  const renderGridCard = (item: MediaItem, nested = false) => (
    <article key={item.id} className={`surface media-card ${nested ? "is-nested" : ""}`}>
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

          <h3 className="media-card-title" title={item.title}>
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

      {item.review && <p className="media-card-review">"{item.review}"</p>}

      <CardActionBar
        item={item}
        menuOpenId={menuOpenId}
        setMenuOpenId={setMenuOpenId}
        onQuickStart={onQuickStart}
        onQuickFinish={onQuickFinish}
        onEdit={onEdit}
        onAskDelete={onAskDelete}
      />

      {deleteId === item.id && (
        <div className="media-delete-confirm">
          <span>Bu kayıt silinsin mi?</span>
          <button type="button" onClick={() => onConfirmDelete(item.id)}>Evet</button>
          <button type="button" onClick={() => onAskDelete(null)}>Vazgeç</button>
        </div>
      )}
    </article>
  );

  const renderSeriesGroup = (entry: Extract<MediaCollectionEntry, { kind: "series" }>, sectionStatus: MediaStatus) => {
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
          <div className={viewMode === "list" ? "media-series-children-list" : "media-series-children-grid"}>
            {entry.items.map((child) =>
              viewMode === "list" ? renderListRow(child, true) : renderGridCard(child, true)
            )}
          </div>
        )}
      </div>
    );
  };

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
              viewMode === "list" ? (
                <div className="media-compact-list">
                  {section.entries.map((entry) =>
                    entry.kind === "series"
                      ? renderSeriesGroup(entry, section.status)
                      : renderListRow(entry.item)
                  )}
                </div>
              ) : (
                <div className="media-grid">
                  {section.entries.map((entry) =>
                    entry.kind === "series"
                      ? renderSeriesGroup(entry, section.status)
                      : renderGridCard(entry.item)
                  )}
                </div>
              )
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
