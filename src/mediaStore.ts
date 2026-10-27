import type { MediaItem } from "../shared/media";
import { validMediaItem } from "../shared/media";

export const MEDIA_STORAGE_KEY = "ack-deck.media-entries.v1";

export function loadMedia(): { entries: MediaItem[]; warning?: string } {
  try {
    const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(validMediaItem);
      return { entries: valid };
    }
  } catch {
    return { entries: [], warning: "Medya kayıtları yüklenemedi." };
  }
  return { entries: [] };
}

export function saveMedia(
  items: MediaItem[],
  _previous?: { entries: MediaItem[] }
): boolean {
  try {
    const valid = items.filter(validMediaItem);
    localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(valid));
    window.dispatchEvent(new CustomEvent("ack-media-changed", { detail: valid }));
    window.dispatchEvent(new Event("ack-data-changed"));
    return true;
  } catch {
    return false;
  }
}
