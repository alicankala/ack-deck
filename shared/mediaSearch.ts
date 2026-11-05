import type { MediaType } from "./media";

export type MediaSearchCandidate = {
  title: string;
  year?: string;
  creator?: string;
  posterUrl?: string;
  progressHint?: string;
  suggestedType?: MediaType;
  imdbId?: string;
  imdbRating?: number;
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
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("/api/image-proxy?url=")) return trimmed;

  const normalized = trimmed.replace(/^http:\/\//i, "https://");

  const shouldProxy =
    normalized.includes("media-amazon.com") ||
    normalized.includes("ssl-images-amazon.com") ||
    normalized.includes("images-amazon.com") ||
    normalized.includes("imdb.com") ||
    normalized.includes("tvmaze.com") ||
    normalized.includes("tmdb.org") ||
    normalized.includes("themoviedb.org") ||
    normalized.includes("books.google.com") ||
    normalized.includes("googleusercontent.com") ||
    normalized.includes("openlibrary.org") ||
    normalized.includes("archive.org") ||
    normalized.includes("steamstatic.com") ||
    normalized.includes("steampowered.com") ||
    normalized.includes("akamaihd.net") ||
    normalized.includes("rawg.io") ||
    normalized.includes("igdb.com") ||
    normalized.includes("wikimedia.org");

  if (shouldProxy) {
    const loc = (globalThis as { location?: { hostname?: string } }).location;
    const isWorkersOrigin = Boolean(loc?.hostname?.endsWith(".workers.dev"));
    return isWorkersOrigin
      ? `/api/image-proxy?url=${encodeURIComponent(normalized)}`
      : `https://ack-deck-phone.ack-deck-cloud.workers.dev/api/image-proxy?url=${encodeURIComponent(normalized)}`;
  }
  return normalized;
}

export function getPosterFallbackUrls(url?: string): string[] {
  if (!url || typeof url !== "string") return [];
  const trimmed = url.trim();
  if (!trimmed) return [];
  const normalized = trimmed.replace(/^http:\/\//i, "https://");
  const candidates: string[] = [];

  // 1. Primary: edge-proxied URL
  const proxied = proxyPosterUrl(normalized);
  if (proxied && !candidates.includes(proxied)) candidates.push(proxied);

  // 2. Steam specific fallback: library_600x900 -> header
  if (normalized.includes("library_600x900.jpg")) {
    const headerUrl = normalized.replace("library_600x900.jpg", "header.jpg");
    const proxiedHeader = proxyPosterUrl(headerUrl);
    if (proxiedHeader && !candidates.includes(proxiedHeader)) candidates.push(proxiedHeader);
    if (!candidates.includes(headerUrl)) candidates.push(headerUrl);
  }

  // 3. Direct normalized URL (in case proxy has issues)
  if (!candidates.includes(normalized)) {
    candidates.push(normalized);
  }

  return candidates;
}

export async function fetchMediaRating(
  imdbId: string,
  signal?: AbortSignal,
): Promise<number | undefined> {
  const cleanId = (imdbId || "").trim();
  if (!/^tt\d{5,12}$/.test(cleanId)) return undefined;

  const params = `imdbId=${encodeURIComponent(cleanId)}`;
  const loc = (globalThis as { location?: { hostname?: string } }).location;
  const isWorkersOrigin = Boolean(loc?.hostname?.endsWith(".workers.dev"));
  const urls = isWorkersOrigin
    ? [`/api/media-rating?${params}`]
    : [
        `https://ack-deck-phone.ack-deck-cloud.workers.dev/api/media-rating?${params}`,
        `/api/media-rating?${params}`,
      ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { ok?: boolean; rating?: number };
      if (json?.ok && typeof json.rating === "number" && json.rating > 0) {
        return json.rating;
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return undefined;
    }
  }
  return undefined;
}
