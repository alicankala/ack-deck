import { loadProjectSnapshot } from "./projectStore";
import { loadNotes } from "./notesStore";
import { loadArchive } from "./archiveStore";
import { loadWorkspaces, loadShortcuts } from "./workHubStore";
import { updateUsage } from "./usageStore";
import type { NavigationTarget } from "./navigation";
export type RecentSource = "projects" | "notes" | "files" | "archive" | "workspaces" | "shortcuts";
export type RecentItem = { source: RecentSource; id: string; usedAt: number; mode?: "folder" | "vscode" };
export type ResolvedRecent = RecentItem & { title: string; target: NavigationTarget; label: string };
const KEY = "ack-deck.recent-items.v1";
export const isRecentItem = (item: unknown): item is RecentItem => {
  if (!item || typeof item !== "object") return false;
  const value = item as RecentItem;
  return ["projects", "notes", "files", "archive", "workspaces", "shortcuts"].includes(value.source) && typeof value.id === "string" && !!value.id && value.id.length <= 512 && typeof value.usedAt === "number" && Number.isFinite(value.usedAt) && value.usedAt >= 0 && value.usedAt <= 8.64e15 && (value.mode === undefined || value.source === "projects" && ["folder", "vscode"].includes(value.mode)) && Object.keys(item).every(key => ["source", "id", "usedAt", "mode"].includes(key));
};
export function loadRecents(): { entries: RecentItem[]; locked: boolean } {
  try { const raw = window.localStorage.getItem(KEY); if (raw === null) return { entries: [], locked: false }; const value = JSON.parse(raw); if (!Array.isArray(value) || !value.every(isRecentItem)) throw new Error(); return { entries: value.slice().sort((a, b) => b.usedAt - a.usedAt).slice(0, 20), locked: false }; }
  catch { return { entries: [], locked: true }; }
}
export function recordRecent(source: RecentSource, id: string, mode?: "folder" | "vscode", now = Date.now()): boolean {
  const item = { source, id, usedAt: now, ...(mode ? { mode } : {}) }, loaded = loadRecents();
  if (loaded.locked || !isRecentItem(item)) return false;
  try { window.localStorage.setItem(KEY, JSON.stringify([item, ...loaded.entries.filter(entry => entry.source !== source || entry.id !== id)].sort((a, b) => b.usedAt - a.usedAt).slice(0, 20))); updateUsage(source, id, undefined, now); if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-recents-changed")); return true; } catch { return false; }
}
export function resolveRecents(limit = 5): ResolvedRecent[] {
  const loaded = loadRecents(); if (loaded.locked) return [];
  const projects = loadProjectSnapshot().entries, notes = loadNotes().notes, files = loadShortcuts().entries.filter(v => v.legacy), archive = loadArchive().entries, workspaces = loadWorkspaces().entries, shortcuts = loadShortcuts().entries;
  // Existing note timestamps provide a truthful starting point, without fabricating project/file usage.
  const candidates: RecentItem[] = [...loaded.entries.map(item => item.source === "notes" ? { ...item, usedAt: Math.max(item.usedAt, notes.find(note => note.id === item.id)?.updatedAt ?? 0) } : item), ...notes.filter(note => !loaded.entries.some(item => item.source === "notes" && item.id === note.id)).map(note => ({ source: "notes" as const, id: note.id, usedAt: note.updatedAt }))];
  return candidates.sort((a, b) => b.usedAt - a.usedAt).flatMap((item): ResolvedRecent[] => {
    const record = item.source === "projects" ? projects.find(record => record.id === item.id) : item.source === "notes" ? notes.find(record => record.id === item.id) : item.source === "files" ? files.find(record => record.id === item.id) : item.source === "workspaces" ? workspaces.find(record => record.id === item.id) : item.source === "shortcuts" ? shortcuts.find(record => record.id === item.id) : archive.find(record => record.id === item.id);
    if (!record) return [];
    const title = "name" in record ? record.name : record.title;
    return [{ ...item, title: title.trim() || "Başlıksız not", target: { page: item.source === "shortcuts" ? "files" : item.source, id: item.id }, label: item.source === "projects" ? "Proje" : item.source === "notes" ? "Not · Son düzenleme" : item.source === "files" ? "Dosya" : item.source === "workspaces" ? "Çalışma Alanı" : item.source === "shortcuts" ? "Kısayol" : "Arşiv" }];
  }).slice(0, Math.min(20, Math.max(1, limit)));
}
