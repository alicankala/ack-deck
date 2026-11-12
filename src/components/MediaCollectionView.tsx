import {
  MEDIA_STATUS_LABELS,
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_LABELS,
  type MediaItem,
} from "../../shared/media";
import { MediaPoster, sanitizeMediaProgress } from "./MediaPoster";

type MediaCollectionViewProps = {
  totalCount: number;
  filteredCount: number;
  visibleItems: MediaItem[];
  visibleCount: number;
  viewMode: "grid" | "list";
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

/** Desktop Media Collection empty state, compact list view, and grid cards view. */
export function MediaCollectionView({
  totalCount,
  filteredCount,
  visibleItems,
  visibleCount,
  viewMode,
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

  if (viewMode === "list") {
    return (
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
                {item.progress && <span className="media-list-progress">📌 {item.progress}</span>}
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
                  onClick={() => onQuickStart(item)}
                  title="Hemen Başla (Devam Ediyor Yap)"
                >
                  ▶ Başla
                </button>
              )}
              {item.status === "in_progress" && (
                <button
                  type="button"
                  className="button button-primary media-quick-finish-btn"
                  onClick={() => onQuickFinish(item)}
                  title="Bitirildi Olarak İşaretle"
                >
                  ✓ Bitir
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                style={{ padding: "0.28rem 0.65rem", fontSize: "0.8rem" }}
                onClick={() => onEdit(item)}
              >
                Düzenle
              </button>
              <button
                type="button"
                className="button button-secondary media-delete-btn"
                style={{ padding: "0.28rem 0.65rem", fontSize: "0.8rem" }}
                onClick={() => onAskDelete(item.id)}
              >
                Sil
              </button>
            </div>

            {deleteId === item.id && (
              <div className="media-delete-confirm">
                <span>Bu kayıt silinsin mi?</span>
                <button type="button" onClick={() => onConfirmDelete(item.id)}>Evet</button>
                <button type="button" onClick={() => onAskDelete(null)}>Vazgeç</button>
              </div>
            )}
          </article>
        ))}
        {visibleCount < filteredCount && (
          <div style={{ display: "flex", justifyContent: "center", margin: "1.25rem 0", width: "100%" }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={onLoadMore}
              style={{ padding: "0.6rem 1.4rem", fontSize: "0.9rem" }}
            >
              Daha Fazla Göster ({visibleCount} / {filteredCount})
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
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

          {item.review && <p className="media-card-review">"{item.review}"</p>}

          <div className="media-card-actions">
            {item.status === "planned" && (
              <button
                type="button"
                className="button button-primary media-card-quick-start"
                onClick={() => onQuickStart(item)}
                title="İzlemeye/Okumaya/Oynamaya Başla"
              >
                ▶ Başla
              </button>
            )}
            {item.status === "in_progress" && (
              <button
                type="button"
                className="button button-primary media-card-quick-finish"
                onClick={() => onQuickFinish(item)}
                title="Bitirildi olarak işaretle"
              >
                ✓ Bitir
              </button>
            )}
            <button
              type="button"
              className="button button-secondary"
              style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}
              onClick={() => onEdit(item)}
            >
              Düzenle
            </button>
            <button
              type="button"
              className="button button-secondary media-delete-btn"
              style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}
              onClick={() => onAskDelete(item.id)}
            >
              Sil
            </button>
          </div>

          {deleteId === item.id && (
            <div className="media-delete-confirm">
              <span>Bu kayıt silinsin mi?</span>
              <button type="button" onClick={() => onConfirmDelete(item.id)}>Evet</button>
              <button type="button" onClick={() => onAskDelete(null)}>Vazgeç</button>
            </div>
          )}
        </article>
      ))}
      {visibleCount < filteredCount && (
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", margin: "1.5rem 0", width: "100%" }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={onLoadMore}
            style={{ padding: "0.6rem 1.4rem", fontSize: "0.9rem" }}
          >
            Daha Fazla Göster ({visibleCount} / {filteredCount})
          </button>
        </div>
      )}
    </div>
  );
}
