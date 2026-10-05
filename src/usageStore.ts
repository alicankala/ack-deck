export type UsageSource = "projects" | "notes" | "files" | "archive" | "workspaces" | "shortcuts";
export type Usage = { source: UsageSource; id: string; pinned: boolean; lastUsedAt: number; useCount: number };
export const USAGE_KEY = "ack-deck.usage.v1";
export function isUsage(v: unknown): v is Usage { if (!v || typeof v !== "object") return false; const i = v as Usage; return Object.keys(v).every(key => ["source", "id", "pinned", "lastUsedAt", "useCount"].includes(key)) && ["projects", "notes", "files", "archive", "workspaces", "shortcuts"].includes(i.source) && typeof i.id === "string" && !!i.id && i.id.length <= 512 && typeof i.pinned === "boolean" && [i.lastUsedAt, i.useCount].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 8.64e15); }
export function loadUsage(): { entries: Usage[]; locked: boolean } { try { const raw = window.localStorage.getItem(USAGE_KEY), v: unknown = raw ? JSON.parse(raw) : []; if (!Array.isArray(v) || !v.every(isUsage) || new Set(v.map(i => i.source + ":" + i.id)).size !== v.length) throw new Error(); return { entries: v, locked: false }; } catch { return { entries: [], locked: true }; } }
export function usageFor(source: string, id: string): Usage { return loadUsage().entries.find(v => v.source === source && v.id === id) ?? { source: source as UsageSource, id, pinned: false, lastUsedAt: 0, useCount: 0 }; }
export function updateUsage(source: UsageSource, id: string, pinned?: boolean, now = Date.now()): boolean {
  const loaded = loadUsage(); if (loaded.locked) return false;
  const previous = usageFor(source, id), item = { ...previous, ...(pinned === undefined ? { lastUsedAt: now, useCount: previous.useCount + 1 } : { pinned }) }; if (!isUsage(item)) return false;
  const entries = [item, ...loaded.entries.filter(v => v.source !== source || v.id !== id)].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastUsedAt - a.lastUsedAt); if (entries.filter(v => v.pinned).length > 500) return false;
  try { window.localStorage.setItem(USAGE_KEY, JSON.stringify(entries.slice(0, 500))); if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-data-changed")); return true; } catch { return false; }
}
export const normalizeHub = (v: string) => v.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i");
export function rankMatch(query: string, title: string, detail: string, usage: Pick<Usage, "pinned" | "lastUsedAt" | "useCount">, now = Date.now()): number {
  const q = normalizeHub(query.trim()), name = normalizeHub(title), text = normalizeHub(title + " " + detail), words = text.split(/\s+/); if (q && !q.split(/\s+/).every(term => text.includes(term))) return -1;
  const relevance = !q ? 0 : name === q ? 2000 : name.startsWith(q) ? 1500 : q.split(/\s+/).every(term => words.includes(term)) ? 1000 : 500;
  return relevance + (usage.pinned ? 120 : 0) + (usage.lastUsedAt ? Math.max(0, 60 - Math.max(0, now - usage.lastUsedAt) / 86400000 * 3) : 0) + Math.min(40, Math.log2(usage.useCount + 1) * 6);
}
