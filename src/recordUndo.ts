import { loadSubscriptions, saveSubscriptions } from "./subscriptionStore";
import type { Subscription } from "../shared/subscriptions";
import { loadTasks, saveTasks, type Task } from "./taskStore";
import { loadNotes, saveNotes, type Note } from "./notesStore";
import { loadArchive, saveArchive, type ArchiveEntry } from "./archiveStore";
import { loadWorkspaces, saveWorkspaces, loadShortcuts, saveShortcuts, type Workspace, type Shortcut } from "./workHubStore";
type UndoRecord = { source: "subscriptions"; record: Subscription } | { source: "tasks"; record: Task } | { source: "notes"; record: Note } | { source: "archive"; record: ArchiveEntry } | { source: "workspaces"; record: Workspace } | { source: "shortcuts"; record: Shortcut };
export type UndoTicket = { id: string; expiresAt: number; label: string };
const pending = new Map<string, { ticket: UndoTicket; item: UndoRecord }>();
export function offerUndo(item: UndoRecord): UndoTicket {
  const ticket = { id: crypto.randomUUID(), expiresAt: Date.now() + 10000, label: "Silindi" }; pending.set(ticket.id, { ticket, item: JSON.parse(JSON.stringify(item)) });
  window.dispatchEvent(new Event("ack-undo-changed")); return ticket;
}
export function undoTickets(now = Date.now()): UndoTicket[] { for (const [id, entry] of pending) if (entry.ticket.expiresAt <= now) pending.delete(id); return [...pending.values()].map(entry => entry.ticket); }
export function clearUndo(): void { pending.clear(); window.dispatchEvent(new Event("ack-undo-changed")); }
export function undoRecord(id: string, now = Date.now()): boolean {
  const entry = pending.get(id); if (!entry || entry.ticket.expiresAt <= now || window.localStorage.getItem("ack-deck.restore-journal.v1") !== null) return false;
  const { item } = entry; let result = false;
  if(item.source==="subscriptions"){const loaded=loadSubscriptions();result=!loaded.entries.some(s=>s.id===item.record.id)&&saveSubscriptions([...loaded.entries,item.record],loaded);}
  if (item.source === "tasks") { const loaded = loadTasks(); result = !loaded.entries.some(record => record.id === item.record.id) && saveTasks([...loaded.entries, item.record], loaded); }
  if (item.source === "notes") { const loaded = loadNotes(); result = !loaded.error && !loaded.notes.some(record => record.id === item.record.id) && saveNotes([...loaded.notes, item.record]); }
  if (item.source === "archive") { const loaded = loadArchive(); result = !loaded.entries.some(record => record.id === item.record.id) && saveArchive([...loaded.entries, item.record], loaded); }
  if (item.source === "workspaces") { const loaded = loadWorkspaces(); result = !loaded.entries.some(record => record.id === item.record.id) && saveWorkspaces([...loaded.entries, item.record]); }
  if (item.source === "shortcuts") { const loaded = loadShortcuts(); result = !loaded.entries.some(record => record.id === item.record.id) && saveShortcuts([...loaded.entries, item.record]); }
  if (result) { pending.delete(id); window.dispatchEvent(new Event("ack-undo-changed")); } return result;
}
