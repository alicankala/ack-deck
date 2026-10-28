import { hasCredentials } from "./privacy";

export type MediaType = "movie" | "series" | "book" | "game";
export type MediaStatus = "completed" | "in_progress" | "planned";

export type MediaItem = {
  id: string;
  type: MediaType;
  title: string;
  status: MediaStatus;
  rating?: number; // 1-10
  review?: string;
  progress?: string;
  completedDate?: string; // YYYY-MM-DD
  posterUrl?: string;
  year?: string;
  creator?: string;
  createdAt: number;
  updatedAt: number;
};

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  movie: "Film",
  series: "Dizi",
  book: "Kitap",
  game: "Oyun",
};

export const MEDIA_TYPE_ICONS: Record<MediaType, string> = {
  movie: "🎬",
  series: "📺",
  book: "📚",
  game: "🎮",
};

export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  completed: "Bitirildi",
  in_progress: "Devam Ediyor",
  planned: "Listemde",
};

const MEDIA_ALLOWED_KEYS = new Set([
  "id",
  "type",
  "title",
  "status",
  "rating",
  "review",
  "progress",
  "completedDate",
  "posterUrl",
  "year",
  "creator",
  "createdAt",
  "updatedAt",
]);

function safeHttpsPoster(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || value.length > 600 || hasCredentials(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

const safeMediaText = (value: unknown, max: number, required = false): value is string =>
  typeof value === "string" &&
  value.length <= max &&
  (!required || !!value.trim()) &&
  !hasCredentials(value) &&
  !/[A-Za-z]:[\\/]|\\\\/.test(value);

const safeTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;

export function validMediaItem(v: unknown): v is MediaItem {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const item = v as Record<string, unknown>;
  if (!Object.keys(item).every((k) => MEDIA_ALLOWED_KEYS.has(k))) return false;
  if (typeof item.id !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(item.id)) return false;
  if (!["movie", "series", "book", "game"].includes(String(item.type))) return false;
  if (!["completed", "in_progress", "planned"].includes(String(item.status))) return false;
  if (!safeMediaText(item.title, 300, true)) return false;
  if (item.rating !== undefined && (typeof item.rating !== "number" || !Number.isFinite(item.rating) || item.rating < 0 || item.rating > 10)) return false;
  if (item.review !== undefined && !safeMediaText(item.review, 5000)) return false;
  if (item.progress !== undefined && !safeMediaText(item.progress, 200)) return false;
  if (item.completedDate !== undefined && item.completedDate !== "" && (typeof item.completedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.completedDate))) return false;
  if (!safeHttpsPoster(item.posterUrl)) return false;
  if (item.year !== undefined && !safeMediaText(item.year, 24)) return false;
  if (item.creator !== undefined && !safeMediaText(item.creator, 160)) return false;
  if (!safeTimestamp(item.createdAt) || !safeTimestamp(item.updatedAt)) return false;
  return true;
}

export function newMediaItem(type: MediaType = "movie"): MediaItem {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m-${Date.now()}`,
    type,
    title: "",
    status: "completed",
    rating: 8,
    review: "",
    progress: "",
    completedDate: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
