import type { MediaType } from "./media";

export type MediaSearchCandidate = {
  title: string;
  year?: string;
  creator?: string;
  posterUrl?: string;
  progressHint?: string;
  suggestedType?: MediaType;
};

export async function searchMediaCatalog(
  type: MediaType,
  query: string,
  signal?: AbortSignal,
): Promise<MediaSearchCandidate[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = `type=${encodeURIComponent(type)}&q=${encodeURIComponent(q.slice(0, 100))}`;
  const loc = (globalThis as { location?: { hostname?: string } }).location;
  const isWorkersOrigin = Boolean(loc?.hostname?.endsWith(".workers.dev"));
  const urls = isWorkersOrigin
    ? [`/api/media-search?${params}`]
    : [
        `https://ack-deck-phone.ack-deck-cloud.workers.dev/api/media-search?${params}`,
        `/api/media-search?${params}`,
      ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { results?: unknown };
      if (!Array.isArray(json?.results)) continue;
      return json.results
        .filter(
          (r): r is MediaSearchCandidate =>
            !!r && typeof r === "object" && typeof (r as MediaSearchCandidate).title === "string",
        )
        .slice(0, 6);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return [];
    }
  }
  return [];
}

export function proxyPosterUrl(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  if (
    url.startsWith("https://") &&
    (url.includes("media-amazon.com") ||
      url.includes("ssl-images-amazon.com") ||
      url.includes("imdb.com") ||
      url.includes("tvmaze.com") ||
      url.includes("tmdb.org") ||
      url.includes("books.google.com") ||
      url.includes("openlibrary.org"))
  ) {
    const loc = (globalThis as { location?: { hostname?: string } }).location;
    const isWorkersOrigin = Boolean(loc?.hostname?.endsWith(".workers.dev"));
    return isWorkersOrigin
      ? `/api/image-proxy?url=${encodeURIComponent(url)}`
      : `https://ack-deck-phone.ack-deck-cloud.workers.dev/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
