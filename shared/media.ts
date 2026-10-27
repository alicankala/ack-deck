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

export function validMediaItem(v: unknown): v is MediaItem {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const item = v as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id.trim()) return false;
  if (!["movie", "series", "book", "game"].includes(String(item.type))) return false;
  if (!["completed", "in_progress", "planned"].includes(String(item.status))) return false;
  if (typeof item.title !== "string" || !item.title.trim()) return false;
  if (item.rating !== undefined && (typeof item.rating !== "number" || item.rating < 0 || item.rating > 10)) return false;
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
