import type { MediaSearchCandidate } from "../../shared/mediaSearch";
import type { MediaType } from "../../shared/media";

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

async function searchImdb(
  q: string,
  fetcher: typeof fetch,
): Promise<MediaSearchCandidate[]> {
  const clean = encodeURIComponent(q.toLowerCase().trim());
  const url = `https://v3.sg.media-imdb.com/suggestion/x/${clean}.json`;
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { d?: Array<Record<string, unknown>> };
    if (!Array.isArray(data?.d)) return [];
    return data.d
      .filter((entry) => typeof entry.l === "string")
      .map((entry) => {
        const qid = typeof entry.qid === "string" ? entry.qid : "";
        const qDesc = typeof entry.q === "string" ? entry.q : "";
        let suggestedType: MediaType | undefined;
        if (qid === "movie" || qid === "tvMovie" || qid === "short" || qDesc.includes("feature")) {
          suggestedType = "movie";
        } else if (qid === "tvSeries" || qid === "tvMiniSeries" || qDesc.includes("series")) {
          suggestedType = "series";
        } else if (qid === "videoGame") {
          suggestedType = "game";
        }

        const rawImg = (entry.i as { imageUrl?: string } | undefined)?.imageUrl;
        const posterUrl = rawImg
          ? toHttps(rawImg.replace(/\._V1_.*\./, "._V1_QL75_UX400."))
          : undefined;

        const year = typeof entry.yr === "string" && entry.yr
          ? entry.yr
          : typeof entry.y === "number" && entry.y > 1800
          ? String(entry.y)
          : undefined;

        const creator = typeof entry.s === "string" ? entry.s.slice(0, 140) : undefined;

        return {
          title: String(entry.l).slice(0, 160),
          year,
          creator,
          posterUrl,
          suggestedType,
        };
      });
  } catch {
    return [];
  }
}

export async function searchPublicMedia(
  type: string,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<MediaSearchCandidate[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];

  if (type === "movie" || type === "series") {
    const imdbItems = await searchImdb(q, fetcher);

    let tvMazeItems: MediaSearchCandidate[] = [];
    if (type === "series" || imdbItems.length === 0) {
      try {
        const tmUrl = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;
        const res = await fetcher(tmUrl, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = (await res.json()) as Array<{ show?: Record<string, unknown> }>;
          tvMazeItems = (Array.isArray(data) ? data : [])
            .map((entry) => entry.show)
            .filter((s): s is Record<string, unknown> => !!s && typeof s.name === "string")
            .slice(0, 5)
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
                posterUrl: toHttps(imgObj?.original ?? imgObj?.medium),
                progressHint: avgRuntime,
                suggestedType: "series" as MediaType,
              };
            });
        }
      } catch {}
    }

    // Enrich IMDb items with TVMaze runtime if available
    for (const item of imdbItems) {
      if (item.suggestedType === "series" && !item.progressHint) {
        const tmMatch = tvMazeItems.find((tm) => tm.title.toLowerCase() === item.title.toLowerCase());
        if (tmMatch?.progressHint) item.progressHint = tmMatch.progressHint;
      }
    }

    const combined: MediaSearchCandidate[] = [];
    const seenTitles = new Set<string>();

    const addCand = (c: MediaSearchCandidate) => {
      const norm = `${c.title.toLowerCase().trim()}#${c.year ?? ""}`;
      if (!seenTitles.has(norm)) {
        seenTitles.add(norm);
        combined.push(c);
      }
    };

    // Pass 1: exact requested type
    for (const item of imdbItems) {
      if (item.suggestedType === type) addCand(item);
    }
    if (type === "series") {
      for (const tm of tvMazeItems) addCand(tm);
    }

    // Pass 2: cross-type matches (e.g. user selected movie but searched Breaking Bad, or vice versa)
    for (const item of imdbItems) {
      if (item.suggestedType && item.suggestedType !== type) addCand(item);
    }

    // Pass 3: untyped franchise/general matches
    for (const item of imdbItems) {
      if (!item.suggestedType) addCand(item);
    }

    if (combined.length > 0) {
      return combined.slice(0, 6);
    }
  }

  if (type === "book") {
    const gUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=6&printType=books`;
    try {
      const res = await fetcher(gUrl, { signal: AbortSignal.timeout(6000) });
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
              suggestedType: "book" as MediaType,
            };
          });
        }
      }
    } catch {}

    const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6`;
    const olRes = await fetcher(olUrl, { signal: AbortSignal.timeout(6000) });
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
          suggestedType: "book" as MediaType,
        };
      });
  }

  if (type === "game") {
    // 1. Steam store search
    try {
      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=turkish&cc=TR`;
      const res = await fetcher(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
        const items = (data.items ?? []).filter((i) => typeof i.name === "string");
        if (items.length > 0) {
          return items.slice(0, 6).map((i) => {
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
              suggestedType: "game" as MediaType,
            };
          });
        }
      }
    } catch {}

    // 2. IMDb game fallback
    const imdbItems = await searchImdb(q, fetcher);
    const gameItems = imdbItems.filter((i) => i.suggestedType === "game");
    if (gameItems.length > 0) return gameItems.slice(0, 6);
  }

  return [];
}
