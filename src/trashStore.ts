import { loadTasks, saveTasks, isTask, type Task } from "./taskStore";
import { loadNotes, saveNotes, validNoteAttachments, type Note } from "./notesStore";
import { loadArchive, saveArchive, isArchiveEntry, type ArchiveEntry } from "./archiveStore";
import { loadWorkspaces, saveWorkspaces, loadShortcuts, saveShortcuts, isWorkspace, isShortcut, type Workspace, type Shortcut } from "./workHubStore";
import { loadSubscriptions, saveSubscriptions } from "./subscriptionStore";
import { validSubscription, type Subscription } from "../shared/subscriptions";
import { validLinks } from "../shared/productivity";
export const TRASH_KEY = "ack-deck.trash.v1", TRASH_RETENTION = 30 * 86400000;
export type TrashSource = "tasks" | "notes" | "archive" | "workspaces" | "shortcuts" | "subscriptions";
export type TrashItem = { id: string; source: TrashSource; deletedAt: number; record: Task | Note | ArchiveEntry | Workspace | Shortcut | Subscription };
export function validTrashItem(v: unknown): v is TrashItem {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const t = v as TrashItem, r = t.record as Note;
  if (Object.keys(t).sort().join() !== ["id", "source", "deletedAt", "record"].sort().join() || typeof t.id !== "string" || !t.id || !Number.isSafeInteger(t.deletedAt) || t.deletedAt < 0 || t.deletedAt > 8.64e15) return false;
  return t.source === "tasks" ? isTask(r) : t.source === "archive" ? isArchiveEntry(r) : t.source === "workspaces" ? isWorkspace(r) : t.source === "shortcuts" ? isShortcut(r) : t.source === "subscriptions" ? validSubscription(r) : t.source === "notes" && !!r && typeof r.id === "string" && !!r.id && typeof r.title === "string" && typeof r.content === "string" && Number.isFinite(r.updatedAt) && Math.abs(r.updatedAt) <= 8.64e15 && validLinks(r) && (r.attachments === undefined || validNoteAttachments(r.attachments));
}
export function loadTrash(): { entries: TrashItem[]; locked: boolean } {
  try { const raw = window.localStorage.getItem(TRASH_KEY), rows: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.every(validTrashItem) || new Set(rows.map(r => r.id)).size !== rows.length) throw Error();
    return { entries: rows, locked: false };
  } catch { return { entries: [], locked: true }; }
}
function writeTrash(rows: TrashItem[]): boolean {
  if (window.localStorage.getItem("ack-deck.restore-journal.v1") !== null) return false;
  try { window.localStorage.setItem(TRASH_KEY, JSON.stringify(rows)); window.dispatchEvent(new Event("ack-trash-changed")); return true; } catch { return false; }
}
// Save a recovery copy before the active store deletes anything. Failed/quota
// writes block deletion. Interrupted/failed deletions leave a harmless copy;
// the recovery UI excludes records that are still in the active store.
export function captureDeleted(source: TrashSource, before: { id: string }[], after: { id: string }[], now = Date.now()): boolean {
  const removed = before.filter(r => !after.some(v => v.id === r.id)); if (!removed.length) return true;
  const loaded = loadTrash(); if (loaded.locked) return false;
  const additions = removed.map(record => ({ id: crypto.randomUUID(), source, record, deletedAt: now } as TrashItem));
  if (!additions.every(validTrashItem)) return false;
  const ids = new Set(removed.map(r => r.id));
  return writeTrash([...additions, ...loaded.entries.filter(t => t.deletedAt > now - TRASH_RETENTION && !(t.source === source && ids.has(t.record.id)))]);
}
export function trashRecordExists(t: TrashItem): boolean {
  if (t.source === "tasks") return loadTasks().entries.some(r => r.id === t.record.id);
  if (t.source === "notes") return loadNotes().notes.some(r => r.id === t.record.id);
  if (t.source === "archive") return loadArchive().entries.some(r => r.id === t.record.id);
  if (t.source === "workspaces") return loadWorkspaces().entries.some(r => r.id === t.record.id);
  if (t.source === "shortcuts") return loadShortcuts().entries.some(r => r.id === t.record.id);
  return loadSubscriptions().entries.some(r => r.id === t.record.id);
}
export function removeTrash(id: string): boolean { const loaded = loadTrash(); return !loaded.locked && writeTrash(loaded.entries.filter(t => t.id !== id)); }
export function restoreTrash(id: string, now = Date.now()): boolean {
  const loaded = loadTrash(), t = loaded.entries.find(t => t.id === id);
  if (loaded.locked || !t || t.deletedAt <= now - TRASH_RETENTION || trashRecordExists(t) || window.localStorage.getItem("ack-deck.restore-journal.v1") !== null) return false;
  let ok = false;
  if (t.source === "tasks") { const s = loadTasks(); ok = saveTasks([...s.entries, t.record as Task], s); }
  if (t.source === "notes") { const s = loadNotes(); ok = !s.error && saveNotes([...s.notes, { ...t.record as Note, updatedAt: now }]); }
  if (t.source === "archive") { const s = loadArchive(); ok = saveArchive([...s.entries, { ...t.record as ArchiveEntry, updatedAt: now }], s); }
  if (t.source === "workspaces") ok = saveWorkspaces([...loadWorkspaces().entries, t.record as Workspace]);
  if (t.source === "shortcuts") ok = saveShortcuts([...loadShortcuts().entries, t.record as Shortcut]);
  if (t.source === "subscriptions") { const s = loadSubscriptions(); ok = saveSubscriptions([...s.entries, t.record as Subscription], s); }
  if (ok) { removeTrash(id); window.dispatchEvent(new Event("ack-data-changed")); } return ok;
}
