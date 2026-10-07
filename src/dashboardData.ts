import { loadTasks, localDateKey, taskDueAt, type Task } from "./taskStore";
import { loadRecents, resolveRecents } from "./recentStore";
import type { Project } from "./projectStore";
import { loadWorkspaces, loadShortcuts } from "./workHubStore";
import { usageFor, rankMatch } from "./usageStore";
import { loadNotes } from "./notesStore";
import { scheduleDate } from "../shared/recurrence";
export function todayTasks(tasks: Task[], now = new Date()): { task: Task; label: string }[] {
  const today = localDateKey(now), incomplete = tasks.filter(task => !task.completed && task.dueDate);
  const date = (task: Task) => scheduleDate(task, now.getTime())!;
  const overdue = (task: Task) => !task.recurrence && (date(task) < today || date(task) === today && taskDueAt(task) !== null && taskDueAt(task)! < now.getTime());
  const chronological = (a: Task, b: Task) => (date(a) + (a.dueTime ?? "23:59")).localeCompare(date(b) + (b.dueTime ?? "23:59"));
  const daily = incomplete.filter(task => date(task) <= today).sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || chronological(a, b));
  const next = incomplete.filter(task => date(task) > today).sort(chronological)[0];
  return [...daily, ...(next ? [next] : [])].slice(0, 5).map(task => ({ task, label: overdue(task) ? "Zamanı geçti" : date(task) === today ? "Bugün" : "Sıradaki · " + date(task).split("-").reverse().join(".") }));
}
export function dashboardProjects(projects: Project[]): Project[] {
  const recents = loadRecents().entries.filter(item => item.source === "projects"), order = new Map(recents.map((item, index) => [item.id, index]));
  return projects.slice().sort((a, b) => Number(usageFor("projects", b.id).pinned) - Number(usageFor("projects", a.id).pinned) || (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity)).slice(0, 3);
}
export function loadDashboardData() {
  const workspaces = loadWorkspaces().entries.slice().sort((a, b) => rankMatch("", b.name, "", usageFor("workspaces", b.id)) - rankMatch("", a.name, "", usageFor("workspaces", a.id))).slice(0, 3);
  const pinnedShortcuts = loadShortcuts().entries.filter(v => usageFor("shortcuts", v.id).pinned).slice(0, 4 - workspaces.length);
  const notes = loadNotes();
  return { tasks: loadTasks(), notesCount: notes.error ? null : notes.notes.length, recents: resolveRecents(), recentLocked: loadRecents().locked, workspaces, pinnedShortcuts };
}
export function relativeUseTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "Az önce"; if (minutes < 60) return minutes + " dakika önce";
  const date = new Date(timestamp), today = localDateKey(new Date(now));
  if (localDateKey(date) === today) return Math.floor(minutes / 60) + " saat önce";
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1); if (localDateKey(date) === localDateKey(yesterday)) return "Dün";
  return date.toLocaleDateString("tr-TR");
}
