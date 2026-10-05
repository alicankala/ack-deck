export type FileKind = "file" | "folder";
export type FileMetadata = {
  path: string;
  fileName: string;
  kind: FileKind;
  extension: string | null;
  sizeBytes: number | null;
  modifiedAt: number | null;
};
export type FileEntry = FileMetadata & { id: string; name: string };
export type FileStatus = { path: string; state: "available" | "missing" | "unavailable"; metadata: FileMetadata | null };

const STORAGE_KEY = "ack-deck.files.v1";

export function isFileEntry(value: unknown): value is FileEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FileEntry>;
  return typeof item.id === "string" && !!item.id &&
    typeof item.name === "string" && typeof item.path === "string" && !!item.path &&
    typeof item.fileName === "string" && (item.kind === "file" || item.kind === "folder") &&
    (item.extension === null || typeof item.extension === "string") &&
    (item.sizeBytes === null || (typeof item.sizeBytes === "number" && Number.isSafeInteger(item.sizeBytes) && item.sizeBytes >= 0)) &&
    (item.modifiedAt === null || (typeof item.modifiedAt === "number" && Number.isFinite(item.modifiedAt) && item.modifiedAt >= 0 && item.modifiedAt <= 8.64e15));
}

export function loadFiles(): { entries: FileEntry[]; error: string | null } {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { entries: [], error: null };
    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every(isFileEntry) && new Set(parsed.map((item) => item.id)).size === parsed.length) {
      return { entries: parsed, error: null };
    }
    return { entries: [], error: "Kayıtlı dosya listesi okunamadı. Mevcut kayıtlar korunuyor." };
  } catch {
    return { entries: [], error: "Yerel dosya listesine erişilemedi. Mevcut kayıtlar korunuyor." };
  }
}

export function saveFiles(entries: FileEntry[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}
