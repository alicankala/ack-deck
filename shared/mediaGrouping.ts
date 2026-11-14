import type { MediaItem, MediaStatus, MediaType } from "./media";

export type MediaCollectionEntry =
  | { kind: "single"; item: MediaItem }
  | {
      kind: "series";
      key: string;
      title: string;
      type: MediaType;
      items: MediaItem[];
      posterUrl?: string;
      yearRange?: string;
    };

export type MediaStatusSection = {
  status: MediaStatus;
  label: string;
  entries: MediaCollectionEntry[];
  totalItems: number;
};

const SECTION_ORDER: Array<{ status: MediaStatus; label: string }> = [
  { status: "in_progress", label: "Devam Ediyor" },
  { status: "planned", label: "Listemde" },
  { status: "completed", label: "Bitirildi" },
];

function normalizeTitleKey(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/['’"“”.,!?()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts a candidate franchise/series base title from a media title.
 * Examples:
 * - "The Hunger Games: Catching Fire" -> "The Hunger Games"
 * - "John Wick - Chapter 2" -> "John Wick"
 * - "Dune: Part Two" -> "Dune"
 */
export function extractSeriesBaseTitle(title: string): string {
  const trimmed = title.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 2) {
    return trimmed.slice(0, colonIdx).trim();
  }
  const dashMatch = trimmed.match(/^(.{3,}?)\s+[-–—]\s+(?:Part|Bölüm|Chapter|Kitap|Sezon|Episode)\b/i);
  if (dashMatch?.[1]) {
    return dashMatch[1].trim();
  }
  const trailingPart = trimmed.match(/^(.{3,}?)\s+(?:Part|Bölüm|Chapter)\s+(?:\d+|[IVX]+|One|Two|Three|Four|Five)$/i);
  if (trailingPart?.[1]) {
    return trailingPart[1].trim();
  }
  const trailingNumber = trimmed.match(/^(.{3,}?)\s+(?:\d+|[II|III|IV|V|VI]+)$/);
  if (trailingNumber?.[1]) {
    return trailingNumber[1].trim();
  }
  return trimmed;
}

function parseYearNum(year?: string): number {
  if (!year) return Number.MAX_SAFE_INTEGER;
  const match = year.match(/\d{4}/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function sortChronologically(a: MediaItem, b: MediaItem): number {
  const ya = parseYearNum(a.year);
  const yb = parseYearNum(b.year);
  if (ya !== yb) return ya - yb;
  return a.title.localeCompare(b.title, "tr-TR");
}

/**
 * Groups items belonging to the same franchise/series (2+ items of the same type)
 * and sorts series members chronologically by release year.
 */
export function groupMediaSeries(items: MediaItem[]): MediaCollectionEntry[] {
  if (items.length <= 1) {
    return items.map((item) => ({ kind: "single", item }));
  }

  // Count normalized base titles per media type
  const baseCounts = new Map<string, { display: string; count: number }>();
  const exactTitlesByType = new Map<string, string>();

  for (const item of items) {
    const exactKey = `${item.type}::${normalizeTitleKey(item.title)}`;
    if (!exactTitlesByType.has(exactKey)) {
      exactTitlesByType.set(exactKey, item.title.trim());
    }
    const base = extractSeriesBaseTitle(item.title);
    const key = `${item.type}::${normalizeTitleKey(base)}`;
    const prev = baseCounts.get(key);
    if (prev) {
      prev.count += 1;
      if (base.length < prev.display.length) prev.display = base;
    } else {
      baseCounts.set(key, { display: base, count: 1 });
    }
  }

  const buckets = new Map<string, MediaItem[]>();
  const singles: MediaItem[] = [];
  const orderKeys: Array<{ type: "single"; item: MediaItem } | { type: "series"; key: string }> = [];
  const seenSeries = new Set<string>();

  for (const item of items) {
    const base = extractSeriesBaseTitle(item.title);
    const key = `${item.type}::${normalizeTitleKey(base)}`;
    const bucketInfo = baseCounts.get(key);

    if (bucketInfo && bucketInfo.count >= 2) {
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
      if (!seenSeries.has(key)) {
        seenSeries.add(key);
        orderKeys.push({ type: "series", key });
      }
    } else {
      singles.push(item);
      orderKeys.push({ type: "single", item });
    }
  }

  const result: MediaCollectionEntry[] = [];
  for (const entry of orderKeys) {
    if (entry.type === "single") {
      result.push({ kind: "single", item: entry.item });
    } else {
      const groupItems = [...(buckets.get(entry.key) ?? [])].sort(sortChronologically);
      const displayTitle = baseCounts.get(entry.key)?.display ?? groupItems[0]?.title ?? "Seri";
      const years = groupItems.map((i) => parseYearNum(i.year)).filter((y) => y < Number.MAX_SAFE_INTEGER);
      const yearRange =
        years.length >= 2 && years[0] !== years[years.length - 1]
          ? `${years[0]}–${years[years.length - 1]}`
          : years.length >= 1
            ? String(years[0])
            : undefined;
      const posterUrl = groupItems.find((i) => i.posterUrl)?.posterUrl;

      result.push({
        kind: "series",
        key: entry.key,
        title: displayTitle,
        type: groupItems[0].type,
        items: groupItems,
        posterUrl,
        yearRange,
      });
    }
  }

  return result;
}

/**
 * Splits media items into ordered status sections (Devam Ediyor -> Listemde -> Bitirildi)
 * and optionally groups multi-entry series inside each section.
 */
export function buildMediaSections(
  items: MediaItem[],
  options?: { groupSeries?: boolean }
): MediaStatusSection[] {
  const groupSeries = options?.groupSeries ?? true;
  const sections: MediaStatusSection[] = [];

  for (const { status, label } of SECTION_ORDER) {
    const matching = items.filter((item) => item.status === status);
    if (matching.length === 0) continue;
    const entries = groupSeries
      ? groupMediaSeries(matching)
      : matching.map((item): MediaCollectionEntry => ({ kind: "single", item }));
    sections.push({
      status,
      label,
      entries,
      totalItems: matching.length,
    });
  }

  return sections;
}
