import type { MediaSearchCandidate } from "../../shared/mediaSearch";

function toHttps(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  const normalized = url.trim().replace(/^http:\/\//i, "https://");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    return parsed.toString().slice(0, 580);
  } catch {
    return undefined;
  }
}

export async function searchPublicMedia(type: string, query: string, fetcher: typeof fetch = fetch): Promise<MediaSearchCandidate[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];

  if (type === "movie") {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=movie&country=tr&limit=6`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    return (data.results ?? [])
      .filter((r) => typeof r.trackName === "string")
      .slice(0, 6)
      .map((r) => {
        const rawArt = typeof r.artworkUrl100 === "string" ? r.artworkUrl100.replace(/100x100bb/g, "400x400bb") : undefined;
        const year = typeof r.releaseDate === "string" ? r.releaseDate.slice(0, 4) : undefined;
        const mins = typeof r.trackTimeMillis === "number" && r.trackTimeMillis > 0 ? `${Math.round(r.trackTimeMillis / 60000)} dk` : undefined;
        return {
          title: String(r.trackName).slice(0, 160),
          year: year && /^\d{4}$/.test(year) ? year : undefined,
          creator: typeof r.artistName === "string" ? r.artistName.slice(0, 140) : undefined,
          posterUrl: toHttps(rawArt),
          progressHint: mins,
        };
      });
  }

  if (type === "series") {
    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ show?: Record<string, unknown> }>;
    return (Array.isArray(data) ? data : [])
      .map((entry) => entry.show)
      .filter((s): s is Record<string, unknown> => !!s && typeof s.name === "string")
      .slice(0, 6)
      .map((show) => {
        const premiered = typeof show.premiered === "string" ? show.premiered.slice(0, 4) : "";
        const ended = typeof show.ended === "string" ? show.ended.slice(0, 4) : "";
        const year = premiered ? (ended && ended !== premiered ? `${premiered}-${ended}` : premiered) : undefined;
        const imgObj = show.image as { medium?: string; original?: string } | null | undefined;
        const networkObj = (show.network ?? show.webChannel) as { name?: string } | null | undefined;
        const genres = Array.isArray(show.genres) ? show.genres.slice(0, 2).join(", ") : "";
        const creator = [networkObj?.name, genres].filter(Boolean).join(" · ").slice(0, 140) || undefined;
        const avgRuntime = typeof show.averageRuntime === "number" && show.averageRuntime > 0 ? `~${show.averageRuntime} dk/bölüm` : undefined;
        return {
          title: String(show.name).slice(0, 160),
          year,
          creator,
          posterUrl: toHttps(imgObj?.medium ?? imgObj?.original),
          progressHint: avgRuntime,
        };
      });
  }

  if (type === "book") {
    const gUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=6&printType=books`;
    try {
      const res = await fetcher(gUrl, { signal: AbortSignal.timeout(7000) });
      if (res.ok) {
        const data = (await res.json()) as { items?: Array<{ volumeInfo?: Record<string, unknown> }> };
        const items = (data.items ?? [])
          .map((i) => i.volumeInfo)
          .filter((v): v is Record<string, unknown> => !!v && typeof v.title === "string");
        if (items.length > 0) {
          return items.slice(0, 6).map((v) => {
            const authors = Array.isArray(v.authors) ? v.authors.slice(0, 2).join(", ") : undefined;
            const pub = typeof v.publishedDate === "string" ? v.publishedDate.slice(0, 4) : undefined;
            const imgLinks = v.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
            const pages = typeof v.pageCount === "number" && v.pageCount > 0 ? `${v.pageCount} sayfa` : undefined;
            return {
              title: String(v.title).slice(0, 160),
              year: pub && /^\d{4}$/.test(pub) ? pub : undefined,
              creator: authors?.slice(0, 140),
              posterUrl: toHttps(imgLinks?.thumbnail ?? imgLinks?.smallThumbnail),
              progressHint: pages,
            };
          });
        }
      }
    } catch {}

    // Fallback to OpenLibrary if Google Books is rate-limited
    const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6`;
    const olRes = await fetcher(olUrl, { signal: AbortSignal.timeout(7000) });
    if (!olRes.ok) return [];
    const olData = (await olRes.json()) as { docs?: Array<Record<string, unknown>> };
    return (olData.docs ?? [])
      .filter((d) => typeof d.title === "string")
      .slice(0, 6)
      .map((d) => {
        const authors = Array.isArray(d.author_name) ? d.author_name.slice(0, 2).join(", ") : undefined;
        const year = typeof d.first_publish_year === "number" ? String(d.first_publish_year) : undefined;
        const coverId = typeof d.cover_i === "number" ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined;
        const pages = typeof d.number_of_pages_median === "number" && d.number_of_pages_median > 0 ? `${d.number_of_pages_median} sayfa` : undefined;
        return {
          title: String(d.title).slice(0, 160),
          year,
          creator: authors?.slice(0, 140),
          posterUrl: toHttps(coverId),
          progressHint: pages,
        };
      });
  }

  if (type === "game") {
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=turkish&cc=TR`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    return (data.items ?? [])
      .filter((i) => typeof i.name === "string")
      .slice(0, 6)
      .map((i) => {
        const appId = typeof i.id === "number" ? i.id : undefined;
        const headerImg = appId
          ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`
          : typeof i.tiny_image === "string"
          ? i.tiny_image
          : undefined;
        return {
          title: String(i.name).slice(0, 160),
          creator: "Steam",
          posterUrl: toHttps(headerImg),
        };
      });
  }

  return [];
}
