import {
  completedTaskSortTime,
  isOccurrenceCompleted,
  scheduleDate,
  type RecurringFields,
} from "./recurrence";
import type { AttendanceEntry } from "./studyAttendance";
import type { StudyBlock } from "./studyPrograms";

export type SharedTaskFilter = "all" | "today" | "upcoming" | "undated" | "completed";

export const SHARED_TASK_FILTERS: [SharedTaskFilter, string][] = [
  ["all", "Aktif"],
  ["today", "Bugün"],
  ["upcoming", "Yaklaşan"],
  ["undated", "Tarihsiz"],
  ["completed", "Tamamlanan"],
];

export type FilterableTask = RecurringFields & {
  text: string;
  dueTime?: string | null;
};

/** Filters task-like records by the active tab relative to a YYYY-MM-DD local date. */
export function filterTaskItems<T extends FilterableTask>(
  tasks: T[],
  filter: SharedTaskFilter,
  today: string,
): T[] {
  const dayAnchor = new Date(today + "T12:00:00").getTime();
  return tasks.filter((task) => {
    const isCompleted = isOccurrenceCompleted(task);
    if (filter === "completed") return isCompleted;
    if (isCompleted) return false;
    const date = task.recurrence ? scheduleDate(task, dayAnchor) : task.dueDate;
    if (filter === "all") return true;
    if (filter === "today") return !!date && date <= today;
    if (filter === "upcoming") return !!date && date > today;
    return !date;
  });
}

/** Filters and sorts task-like records consistently across desktop and mobile. */
export function filterAndSortTaskItems<T extends FilterableTask>(
  tasks: T[],
  filter: SharedTaskFilter,
  today: string,
): T[] {
  const filtered = filterTaskItems(tasks, filter, today);
  if (filter === "completed") {
    return [...filtered].sort((a, b) => completedTaskSortTime(b) - completedTaskSortTime(a));
  }
  const taskDate = (t: T) => (t.recurrence ? scheduleDate(t) : t.dueDate) || "9999-99-99";
  const taskTime = (t: T) => t.dueTime || "99:99";
  return [...filtered].sort((a, b) => {
    const dateDiff = taskDate(a).localeCompare(taskDate(b));
    if (dateDiff !== 0) return dateDiff;
    const timeDiff = taskTime(a).localeCompare(taskTime(b));
    if (timeDiff !== 0) return timeDiff;
    return a.text.localeCompare(b.text, "tr");
  });
}

/** Filters study blocks for the active task tab across desktop and mobile. */
export function filterLessonsForTaskTab(
  filter: SharedTaskFilter,
  todayLessons: StudyBlock[],
  weekLessons: StudyBlock[],
  attendance: Record<string, AttendanceEntry>,
  today: string,
): StudyBlock[] {
  if (filter === "all" || filter === "today") return todayLessons;
  if (filter === "upcoming") return weekLessons.filter((b) => b.date > today);
  if (filter === "completed") {
    return weekLessons
      .filter((b) => Boolean(attendance[b.id]?.status))
      .sort((a, b) => (attendance[b.id]?.at ?? 0) - (attendance[a.id]?.at ?? 0));
  }
  return [];
}
