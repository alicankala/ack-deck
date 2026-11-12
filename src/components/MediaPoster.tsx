import { useEffect, useMemo, useState } from "react";
import { MEDIA_TYPE_ICONS, type MediaType } from "../../shared/media";
import { getPosterFallbackUrls } from "../../shared/mediaSearch";

export function sanitizeMediaProgress(progress?: string): string | undefined {
  if (!progress) return undefined;
  const trimmed = progress.trim();
  if (trimmed === "Başlandı" || trimmed === "Yeniden başlandı") return undefined;
  return trimmed || undefined;
}

type MediaPosterProps = {
  url?: string;
  title: string;
  type: MediaType;
  className?: string;
  placeholderClassName?: string;
};

/** Poster thumbnail with multi-URL fallback and media-type icon placeholder. */
export function MediaPoster({
  url,
  title,
  type,
  className = "media-card-poster",
  placeholderClassName = "media-card-poster-placeholder",
}: MediaPosterProps) {
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
