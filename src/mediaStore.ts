import type { MediaItem } from "../shared/media";
import { validMediaItem } from "../shared/media";

export const MEDIA_STORAGE_KEY = "ack-deck.media-entries.v1";

export type LoadedMedia = {
  entries: MediaItem[];
  preserved: unknown[];
  locked: boolean;
  warning?: string;
};

function coerceLegacyMedia(row: unknown): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const obj = row as Record<string, unknown>;
  const now = Date.now();
  return {
    ...obj,
    createdAt: typeof obj.createdAt === "number" && Number.isSafeInteger(obj.createdAt) ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === "number" && Number.isSafeInteger(obj.updatedAt) ? obj.updatedAt : now,
  };
}

export function loadMedia(): LoadedMedia {
  try {
    const raw = window.localStorage.getItem(MEDIA_STORAGE_KEY);
    if (raw === null) return { entries: [], preserved: [], locked: false };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid media array");
    const entries: MediaItem[] = [];
    const preserved: unknown[] = [];
    const ids = new Set<string>();
    for (const rawRow of parsed) {
      const candidate = coerceLegacyMedia(rawRow);
      if (validMediaItem(candidate) && !ids.has(candidate.id)) {
        entries.push(candidate);
        ids.add(candidate.id);
      } else {
        preserved.push(rawRow);
      }
    }
    return {
      entries,
      preserved,
      locked: false,
      ...(preserved.length ? { warning: "Bazı günlük kayıtları okunamadı; kayıtlar korunuyor." } : {}),
    };
  } catch {
    return { entries: [], preserved: [], locked: true, warning: "Medya kayıtları yüklenemedi; mevcut kayıtlar korunuyor." };
  }
}

export function saveMedia(
  items: MediaItem[],
  loaded: LoadedMedia = loadMedia()
): boolean {
  if (loaded.locked || items.length > 10000 || !items.every(validMediaItem) || new Set(items.map(m => m.id)).size !== items.length) {
    return false;
  }
  try {
    window.localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify([...items, ...loaded.preserved]));
    window.dispatchEvent(typeof CustomEvent !== "undefined" ? new CustomEvent("ack-media-changed", { detail: items }) : new Event("ack-media-changed"));
    window.dispatchEvent(new Event("ack-data-changed"));
    return true;
  } catch {
    return false;
  }
}
