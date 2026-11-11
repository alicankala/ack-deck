import {
  completedTaskSortTime,
  completeOccurrence,
  isOccurrenceCompleted,
  nextOccurrence,
  scheduleDate,
  uncompleteOccurrence,
} from "../shared/recurrence";
import type { StudyBlock } from "../shared/studyPrograms";
import type { AttendanceEntry } from "../shared/studyAttendance";
import { offerUndo } from "./recordUndo";
import { filterTasks, loadTasks, localDateKey, saveTasks, taskDueAt, type Task, type TaskFilter } from "./taskStore";

export const TASK_FILTERS: [TaskFilter, string][] = [
  ["all", "Aktif"],
  ["today", "Bugün"],
  ["upcoming", "Yaklaşan"],
  ["undated", "Tarihsiz"],
  ["completed", "Tamamlanan"],
];

/** Filters and sorts desktop tasks consistently across Tasks page and Dashboard card. */
export function filterAndSortTasks(tasks: Task[], filter: TaskFilter, today = localDateKey()): Task[] {
  const filtered = filterTasks(tasks, filter, today);
  if (filter === "completed") {
    return [...filtered].sort((a, b) => completedTaskSortTime(b) - completedTaskSortTime(a));
  }
  const taskDate = (t: Task) => (t.recurrence ? scheduleDate(t) : t.dueDate) || "9999-99-99";
  const taskTime = (t: Task) => t.dueTime || "99:99";
  return [...filtered].sort((a, b) => {
    const dateDiff = taskDate(a).localeCompare(taskDate(b));
    if (dateDiff !== 0) return dateDiff;
    const timeDiff = taskTime(a).localeCompare(taskTime(b));
    if (timeDiff !== 0) return timeDiff;
    return a.text.localeCompare(b.text, "tr");
  });
}

/** Filters study blocks for the active task tab. */
export function filterLessonsForTaskTab(
  filter: TaskFilter,
  todayLessons: StudyBlock[],
  weekLessons: StudyBlock[],
  attendance: Record<string, AttendanceEntry>,
  today = localDateKey()
): StudyBlock[] {
  if (filter === "all" || filter === "today") return todayLessons;
  if (filter === "upcoming") return weekLessons.filter(b => b.date > today);
  if (filter === "completed") {
    return weekLessons
      .filter(b => Boolean(attendance[b.id]?.status))
      .sort((a, b) => (attendance[b.id]?.at ?? 0) - (attendance[a.id]?.at ?? 0));
  }
  return [];
}

/** Validates and persists a task editor draft, checking for cross-device conflicts and recurrence rules. */
export function saveTaskDraft(
  draft: Task,
  original: Task | null
): { ok: true; next: Task[] } | { ok: false; error: string } {
  if (!draft.text.trim()) {
    return { ok: false, error: "Görev metni boş olamaz." };
  }
  if (draft.reminder && taskDueAt(draft) === null) {
    return { ok: false, error: "Hatırlatma için geçerli bir tarih ve saat seçin." };
  }
  const loaded = loadTasks();
  if (loaded.locked) {
    return { ok: false, error: "Görevler okunamadı. Mevcut veriler korunuyor." };
  }
  const current = loaded.entries;
  let updated: Task = { ...draft, text: draft.text.trim() };
  const previous = current.find(t => t.id === draft.id);
  const stable = (t: Task | null | undefined) => {
    if (!t) return null;
    const { remindedFor: _, ...value } = t;
    return JSON.stringify(value);
  };
  if (original && stable(previous) !== stable(original)) {
    return {
      ok: false,
      error: "Bu görev başka bir cihazda değişti veya silindi. Taslağın burada korunuyor; güncel görevi yeniden açmadan kaydetme.",
    };
  }
  if (
    draft.recurrence &&
    (JSON.stringify(draft.recurrence) !== JSON.stringify(previous?.recurrence) ||
      draft.dueDate !== previous?.dueDate ||
      draft.dueTime !== previous?.dueTime)
  ) {
    if (!draft.dueDate || !draft.dueTime) {
      return { ok: false, error: "Tekrar için tarih ve saat seçin." };
    }
    const rule = { ...draft.recurrence, start: draft.dueDate, time: draft.dueTime };
    const first = nextOccurrence(rule, new Date(rule.start + "T00:00:00Z").getTime() - 86400000);
    if (!first) {
      return { ok: false, error: "Tekrar günlerini ve bitişini kontrol edin." };
    }
    updated = {
      ...updated,
      recurrence: rule,
      occurrenceAt: first.at,
      dueDate: first.date,
      dueTime: rule.time,
      snoozedUntil: null,
      remindedFor: null,
      completed: false,
    };
  }
  if (!draft.recurrence) {
    updated = {
      ...updated,
      recurrence: null,
      ...(previous?.recurrence || draft.dueDate !== previous?.dueDate || draft.dueTime !== previous?.dueTime
        ? { occurrenceAt: null, snoozedUntil: null, remindedFor: null }
        : {}),
    };
  }
  const next = current.some(task => task.id === draft.id)
    ? current.map(task => (task.id === draft.id ? updated : task))
    : [updated, ...current];
  if (!saveTasks(next, loaded)) {
    return { ok: false, error: "Görevler kaydedilemedi. Mevcut veriler korunuyor." };
  }
  return { ok: true, next };
}

/** Toggles completion status for a single-shot or recurring task. */
export function toggleTaskRecordCompletion(
  taskId: string
): { ok: true; next: Task[] } | { ok: false; error: string } {
  const loaded = loadTasks();
  if (loaded.locked) {
    return { ok: false, error: "Görevler okunamadı. Mevcut veriler korunuyor." };
  }
  const next = loaded.entries.map(item =>
    item.id === taskId ? (isOccurrenceCompleted(item) ? uncompleteOccurrence(item) : completeOccurrence(item)) : item
  );
  if (!saveTasks(next, loaded)) {
    return { ok: false, error: "Görev kaydedilemedi. Mevcut veriler korunuyor." };
  }
  return { ok: true, next };
}

/** Snoozes an active task's reminder by the given number of minutes. */
export function snoozeTaskRecord(
  task: Task,
  minutes: number
): { ok: true; next: Task[] } | { ok: false; error: string } {
  const loaded = loadTasks();
  if (loaded.locked) {
    return { ok: false, error: "Görevler okunamadı. Mevcut veriler korunuyor." };
  }
  const until = Date.now() + minutes * 60000;
  const next = loaded.entries.map(t =>
    t.id === task.id
      ? {
          ...t,
          reminder: true,
          snoozedUntil: until,
          occurrenceAt: t.recurrence ? t.occurrenceAt ?? taskDueAt(t) : null,
          remindedFor: null,
        }
      : t
  );
  if (!saveTasks(next, loaded)) {
    return { ok: false, error: "Görev kaydedilemedi. Mevcut veriler korunuyor." };
  }
  return { ok: true, next };
}

/** Deletes a task and registers an undo ticket. */
export function deleteTaskRecord(task: Task): { ok: true; next: Task[] } | { ok: false; error: string } {
  const loaded = loadTasks();
  if (loaded.locked) {
    return { ok: false, error: "Görevler okunamadı. Mevcut veriler korunuyor." };
  }
  const next = loaded.entries.filter(item => item.id !== task.id);
  if (!saveTasks(next, loaded)) {
    return { ok: false, error: "Görev silinemedi. Mevcut veriler korunuyor." };
  }
  offerUndo({ source: "tasks", record: task });
  return { ok: true, next };
}
