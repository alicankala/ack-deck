export type InboxItem = {
  id: string;
  kind: string;
  title: string;
  content: string;
  mime: string | null;
  size: number | null;
  expiresAt: number | null;
  handled: number;
  createdAt: number;
};

export type InboxStatusTab = "pending" | "handled" | "all";
export type InboxTypeFilter = "all" | "text" | "link" | "audio" | "image" | "file";

export type InboxSummary = {
  total: number;
  pending: number;
  handled: number;
  counts: Record<Exclude<InboxTypeFilter, "all">, number>;
  expiringSoon: number;
  expiredCount: number;
  latestItem: InboxItem | null;
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export function isAudioInboxItem(item: InboxItem): boolean {
  return Boolean(item.mime?.startsWith("audio/"));
}

export function getInboxTypeCategory(item: InboxItem): Exclude<InboxTypeFilter, "all"> {
  if (item.kind === "file") {
    if (isAudioInboxItem(item)) return "audio";
    if (item.mime?.startsWith("image/")) return "image";
    return "file";
  }
  if (item.kind === "link") return "link";
  return "text";
}

export function getInboxTypeLabel(item: InboxItem): string {
  if (item.kind === "file") {
    if (isAudioInboxItem(item)) return "Sesli not";
    if (item.mime === "application/pdf") return "PDF";
    if (item.mime?.startsWith("image/")) return "Fotoğraf";
    return "Dosya";
  }
  if (item.kind === "link") return "Bağlantı";
  if (item.kind === "ai_prompt") return "ACK AI Mesajı";
  return "Metin";
}

export function resolveInitialInboxTab(items: InboxItem[], initialId?: string): InboxStatusTab {
  if (initialId) {
    const target = items.find(i => i.id === initialId);
    if (target) {
      return target.handled ? "all" : "pending";
    }
  }
  if (items.some(i => !i.handled)) return "pending";
  if (items.length > 0) return "all";
  return "pending";
}

export function summarizeInboxItems(items: InboxItem[], now = Date.now()): InboxSummary {
  const counts: Record<Exclude<InboxTypeFilter, "all">, number> = {
    text: 0,
    link: 0,
    audio: 0,
    image: 0,
    file: 0,
  };
  let pending = 0;
  let handled = 0;
  let expiringSoon = 0;
  let expiredCount = 0;
  let latestItem: InboxItem | null = null;

  for (const item of items) {
    if (item.handled) handled += 1;
    else pending += 1;

    counts[getInboxTypeCategory(item)] += 1;

    if (item.kind === "file" && item.expiresAt) {
      if (item.expiresAt <= now) expiredCount += 1;
      else if (item.expiresAt - now <= FIVE_DAYS_MS) expiringSoon += 1;
    }

    if (!latestItem || item.createdAt > latestItem.createdAt) {
      latestItem = item;
    }
  }

  return {
    total: items.length,
    pending,
    handled,
    counts,
    expiringSoon,
    expiredCount,
    latestItem,
  };
}

export function filterInboxItems(
  items: InboxItem[],
  tab: InboxStatusTab,
  typeFilter: InboxTypeFilter,
  query: string,
): {
  tabItems: InboxItem[];
  typeCounts: Record<InboxTypeFilter, number>;
  filteredItems: InboxItem[];
} {
  const tabItems =
    tab === "pending"
      ? items.filter(i => !i.handled)
      : tab === "handled"
      ? items.filter(i => !!i.handled)
      : items;

  const typeCounts: Record<InboxTypeFilter, number> = {
    all: tabItems.length,
    text: 0,
    link: 0,
    audio: 0,
    image: 0,
    file: 0,
  };

  for (const item of tabItems) {
    typeCounts[getInboxTypeCategory(item)] += 1;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

  const filteredItems = tabItems.filter(item => {
    if (typeFilter !== "all" && getInboxTypeCategory(item) !== typeFilter) {
      return false;
    }
    if (!normalizedQuery) return true;

    const haystack = [item.title, item.content, getInboxTypeLabel(item)]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    return haystack.includes(normalizedQuery);
  });

  return { tabItems, typeCounts, filteredItems };
}

export function formatInboxFileSize(size: number | null): string {
  if (!size || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatInboxSnippet(item: InboxItem, maxLength = 54): string {
  const raw = (item.content || item.title || getInboxTypeLabel(item)).replace(/\s+/g, " ").trim();
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength - 1).trimEnd()}…`;
}
