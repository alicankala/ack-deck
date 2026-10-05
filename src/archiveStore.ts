export const ARCHIVE_CATEGORIES = ["Cihaz", "Belge", "Fatura", "Garanti", "Lisans", "Abonelik", "Proje", "Diğer"] as const;
export type ArchiveCategory = typeof ARCHIVE_CATEGORIES[number];
export type ArchiveFile = { path: string; fileName: string };
export type ArchiveEntry = {
  id: string;
  title: string;
  category: ArchiveCategory;
  description: string;
  date: string | null;
  tags: string[];
  file: ArchiveFile | null;
  createdAt: number;
  updatedAt: number;
};
export type ArchiveDraft = { title: string; category: ArchiveCategory; description: string; date: string; tagsText: string; file: ArchiveFile | null };
export type ArchiveLoad = { entries: ArchiveEntry[]; preserved: unknown[]; locked: boolean; warning: string | null };
const STORAGE_KEY = "ack-deck.archive.v1";

export function validArchiveDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isArchiveEntry(value: unknown): value is ArchiveEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ArchiveEntry>;
  const timestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
  return typeof item.id === "string" && !!item.id && typeof item.title === "string" && !!item.title.trim() &&
    ARCHIVE_CATEGORIES.includes(item.category as ArchiveCategory) && typeof item.description === "string" &&
    (item.date === null || validArchiveDate(item.date)) && Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === "string") &&
    (item.file === null || (typeof item.file === "object" && typeof item.file.path === "string" && !!item.file.path && typeof item.file.fileName === "string")) &&
    timestamp(item.createdAt) && timestamp(item.updatedAt);
}

export function loadArchive(): ArchiveLoad {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { entries: [], preserved: [], locked: false, warning: null };
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("invalid archive");
    const entries: ArchiveEntry[] = [];
    const preserved: unknown[] = [];
    const ids = new Set<string>();
    for (const value of parsed) {
      if (isArchiveEntry(value) && !ids.has(value.id)) { entries.push(value); ids.add(value.id); }
      else preserved.push(value);
    }
    return { entries, preserved, locked: false, warning: preserved.length ? "Bazı arşiv kayıtları okunamadı. Sağlam kayıtlar gösteriliyor; diğer kayıtlar korunuyor." : null };
  } catch {
    return { entries: [], preserved: [], locked: true, warning: "Arşiv okunamadı. Mevcut veriler korunuyor; kaydetme kapatıldı." };
  }
}

export function saveArchive(entries: ArchiveEntry[], loaded: ArchiveLoad): boolean {
  if (loaded.locked || !entries.every(isArchiveEntry) || new Set(entries.map((entry) => entry.id)).size !== entries.length) return false;
  try {
    // Preserve unreadable records instead of overwriting them with the visible subset.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, ...loaded.preserved]));
    return true;
  } catch { return false; }
}

export function parseArchiveTags(text: string): string[] {
  const seen = new Set<string>();
  return text.split(",").map((tag) => tag.trim()).filter((tag) => {
    const key = tag.toLocaleLowerCase("tr-TR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function makeArchiveEntry(draft: ArchiveDraft, previous?: ArchiveEntry, now = Date.now()): ArchiveEntry {
  return {
    id: previous?.id ?? crypto.randomUUID(), title: draft.title.trim(), category: draft.category,
    description: draft.description.trim(), date: draft.date || null, tags: parseArchiveTags(draft.tagsText),
    file: draft.file, createdAt: previous?.createdAt ?? now, updatedAt: now,
  };
}

export function filterArchive(entries: ArchiveEntry[], query: string, category: ArchiveCategory | "all"): ArchiveEntry[] {
  const search = query.trim().toLocaleLowerCase("tr-TR");
  return entries.filter((entry) => (category === "all" || entry.category === category) &&
    (entry.title + " " + entry.description + " " + entry.tags.join(" ") + " " + entry.category).toLocaleLowerCase("tr-TR").includes(search))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function archiveDateLabel(value: string | null): string {
  return value ? value.split("-").reverse().join(".") : "Tarih belirtilmedi";
}
