import { recordChanges } from "./activityStore";
import { validLinks, validChecklist, type ChecklistItem, type RecordLinks } from "../shared/productivity";
import { validRecurrence, zonedAt, scheduleDate, type Recurrence } from "../shared/recurrence";
export type Task = RecordLinks & { checklist?: ChecklistItem[]; reminderLeadMinutes?: number; id: string; text: string; completed: boolean; dueDate?: string | null; dueTime?: string | null; priority?: "normal" | "important"; reminder?: boolean; recurrence?: Recurrence | null; dueAt?: number | null; occurrenceAt?: number | null; lastCompletedAt?: number | null; snoozedUntil?: number | null; timezone?: string; remindedFor?: string | null };
export type TaskLoad = { entries: Task[]; preserved: unknown[]; locked: boolean; warning: string | null };
const KEY = "ack-deck.tasks.v1";
// Retained only to read old user data safely; the obsolete project folder is never accessed.
const LEGACY_KEY = "kontrol-merkezi.tasks.v1";
export function validTaskDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const validTaskTime = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export const isTask = (value: unknown): value is Task => {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<Task>;
  return validLinks(task as Record<string, unknown>) && (task.checklist === undefined || validChecklist(task.checklist)) && (task.reminderLeadMinutes === undefined || Number.isInteger(task.reminderLeadMinutes) && task.reminderLeadMinutes >= 0 && task.reminderLeadMinutes <= 10080) && typeof task.id === "string" && !!task.id && typeof task.text === "string" && typeof task.completed === "boolean" &&
    (task.dueDate == null || validTaskDate(task.dueDate)) && (task.dueTime == null || validTaskTime(task.dueTime)) &&
    (task.priority === undefined || task.priority === "normal" || task.priority === "important") &&
    (task.reminder === undefined || typeof task.reminder === "boolean") &&
    (task.recurrence == null || validRecurrence(task.recurrence) && !!task.dueDate && !!task.dueTime) &&
    [task.dueAt,task.occurrenceAt,task.lastCompletedAt,task.snoozedUntil].every(v=>v==null||Number.isSafeInteger(v)&&v>=0&&v<=8.64e15) &&
    (task.timezone===undefined || (()=>{try {new Intl.DateTimeFormat("tr",{timeZone:task.timezone});return true;}catch{return false;}})()) &&
    (task.remindedFor == null || typeof task.remindedFor === "string") && (!task.reminder || (!!task.dueDate && !!task.dueTime));
};
export function loadTasks(): TaskLoad {
  try {
    const saved = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (saved === null) return { entries: [], preserved: [], locked: false, warning: null };
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) throw new Error("invalid tasks");
    const entries: Task[] = []; const preserved: unknown[] = []; const ids = new Set<string>();
    for (const task of value) {
      if (isTask(task) && !ids.has(task.id)) { entries.push({ ...task, priority: task.priority ?? "normal", dueDate: task.dueDate ?? null, dueTime: task.dueTime ?? null, reminder: task.reminder ?? false }); ids.add(task.id); } else preserved.push(task);
    }
    return { entries, preserved, locked: false, warning: preserved.length ? "Bazı görevler okunamadı. Diğer kayıtlar korunuyor." : null };
  } catch { return { entries: [], preserved: [], locked: true, warning: "Görevler okunamadı. Mevcut kayıtlar korunuyor." }; }
}
export function saveTasks(entries: Task[], loaded: TaskLoad): boolean {
  if (loaded.locked || !entries.every(isTask) || new Set(entries.map((task) => task.id)).size !== entries.length) return false;
  try { window.localStorage.setItem(KEY, JSON.stringify([...entries, ...loaded.preserved])); recordChanges("tasks", loaded.entries, entries); if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-data-changed")); return true; } catch { return false; }
}
export function localDateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function taskDueAt(task: Task): number | null {
  if (!task.dueDate || !task.dueTime || !validTaskDate(task.dueDate) || !validTaskTime(task.dueTime)) return null;
  if(task.snoozedUntil!=null)return task.snoozedUntil;
  if(task.recurrence)return task.occurrenceAt ?? zonedAt(task.dueDate,task.dueTime,task.recurrence.timezone);
  if(task.timezone)return zonedAt(task.dueDate,task.dueTime,task.timezone);
  const date = new Date(task.dueDate + "T" + task.dueTime + ":00");
  return Number.isFinite(date.getTime()) && localDateKey(date) === task.dueDate && `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` === task.dueTime ? date.getTime() : null;
}
export function reminderKey(task: Task): string | null { const due = taskDueAt(task); return due === null ? null : task.id + "|" + (due-(task.snoozedUntil?0:(task.reminderLeadMinutes??0)*60000)); }
export type TaskFilter = "all" | "today" | "upcoming" | "undated" | "completed";
export function filterTasks(tasks: Task[], filter: TaskFilter, today = localDateKey()): Task[] {
  return tasks.filter((task) => { const date = task.recurrence ? scheduleDate(task, new Date(today + "T12:00:00").getTime()) : task.dueDate; return filter === "completed" ? task.completed : !task.completed && (filter === "all" || (filter === "today" ? !!date && date <= today : filter === "upcoming" ? !!date && date > today : !date)); });
}
