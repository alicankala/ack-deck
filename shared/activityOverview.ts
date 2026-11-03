import { TRACKED_PRAYERS, type PrayerLogDay } from "./prayerTimes";

export type ActivityGoals = {
  prayerTarget: number; // default: 5 (vakit)
  pomodoroTarget: number; // default: 4 (seans)
  tasksTarget: number; // default: 3 (görev)
};

export const DEFAULT_ACTIVITY_GOALS: ActivityGoals = {
  prayerTarget: 5,
  pomodoroTarget: 4,
  tasksTarget: 3,
};

export const ACTIVITY_GOALS_KEY = "ack-deck.activity-goals.v1";
export const POMODORO_HISTORY_KEY = "ack-deck.pomodoro.history.v1";

export function loadActivityGoals(): ActivityGoals {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { ...DEFAULT_ACTIVITY_GOALS };
    }
    const raw = window.localStorage.getItem(ACTIVITY_GOALS_KEY);
    if (!raw) return { ...DEFAULT_ACTIVITY_GOALS };
    const parsed = JSON.parse(raw);
    return {
      prayerTarget: typeof parsed.prayerTarget === "number" && parsed.prayerTarget >= 1 && parsed.prayerTarget <= 5 ? parsed.prayerTarget : DEFAULT_ACTIVITY_GOALS.prayerTarget,
      pomodoroTarget: typeof parsed.pomodoroTarget === "number" && parsed.pomodoroTarget >= 1 && parsed.pomodoroTarget <= 30 ? parsed.pomodoroTarget : DEFAULT_ACTIVITY_GOALS.pomodoroTarget,
      tasksTarget: typeof parsed.tasksTarget === "number" && parsed.tasksTarget >= 1 && parsed.tasksTarget <= 50 ? parsed.tasksTarget : DEFAULT_ACTIVITY_GOALS.tasksTarget,
    };
  } catch {
    return { ...DEFAULT_ACTIVITY_GOALS };
  }
}

export function saveActivityGoals(goals: ActivityGoals): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const sanitized: ActivityGoals = {
      prayerTarget: Math.min(5, Math.max(1, Math.round(goals.prayerTarget || 5))),
      pomodoroTarget: Math.min(30, Math.max(1, Math.round(goals.pomodoroTarget || 4))),
      tasksTarget: Math.min(50, Math.max(1, Math.round(goals.tasksTarget || 3))),
    };
    window.localStorage.setItem(ACTIVITY_GOALS_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new Event("ack-data-changed"));
    window.dispatchEvent(new Event("ack-activity-goals-changed"));
    return true;
  } catch {
    return false;
  }
}

export type PomodoroDayLog = {
  sessions: number;
  minutes: number;
};

export function loadPomodoroHistory(): Record<string, PomodoroDayLog> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    const raw = window.localStorage.getItem(POMODORO_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, PomodoroDayLog>;
    }
    return {};
  } catch {
    return {};
  }
}

export function recordPomodoroSession(minutes = 25, atTimestamp = Date.now()): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const date = new Date(atTimestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const history = loadPomodoroHistory();
    const current = history[key] || { sessions: 0, minutes: 0 };
    history[key] = {
      sessions: current.sessions + 1,
      minutes: current.minutes + Math.max(1, Math.round(minutes)),
    };
    window.localStorage.setItem(POMODORO_HISTORY_KEY, JSON.stringify(history));
    window.dispatchEvent(new Event("ack-data-changed"));
    window.dispatchEvent(new Event("ack-pomodoro-history-changed"));
  } catch {}
}

export type ActivityRingData = {
  label: string;
  current: number;
  target: number;
  unit: string;
  minutes?: number;
  progress: number; // 0 to 1 (capped at 1 for rendering circle)
  rawProgress: number; // can exceed 1 (e.g. 1.25 for 125%)
  color: string;
  bgColor: string;
};

export type DayActivitySummary = {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "Pzt", "Bugün"
  fullDateLabel: string; // e.g. "4 Kasım 2026, Çarşamba"
  rings: {
    prayer: ActivityRingData;
    pomodoro: ActivityRingData;
    tasks: ActivityRingData;
  };
  allGoalsMet: boolean;
  overallScore: number; // 0 to 100
  notes?: string[];
};

export type MinimalTask = {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string | null;
  lastCompletedAt?: number | null;
};

export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calculateDaySummary(
  dateStr: string,
  prayerLogs: PrayerLogDay[],
  pomodoroHistory: Record<string, PomodoroDayLog>,
  tasks: MinimalTask[],
  goals: ActivityGoals = DEFAULT_ACTIVITY_GOALS
): DayActivitySummary {
  // 1. Prayer count
  const prayerLog = prayerLogs.find(l => l.date === dateStr);
  let prayerCount = 0;
  if (prayerLog) {
    for (const tp of TRACKED_PRAYERS) {
      if (prayerLog.prayers[tp.name] === "prayed") {
        prayerCount++;
      }
    }
  }

  // 2. Pomodoro count
  const pomoDay = pomodoroHistory[dateStr];
  const pomoCount = pomoDay?.sessions ?? 0;
  const pomoMinutes = pomoDay?.minutes ?? pomoCount * 25;

  // 3. Tasks completed on this day
  // Check if completed and lastCompletedAt matches dateStr, or dueDate matches dateStr
  let taskCount = 0;
  for (const t of tasks) {
    if (!t.completed) continue;
    let completedOnThisDay = false;
    if (t.lastCompletedAt) {
      const cDate = localDateString(new Date(t.lastCompletedAt));
      if (cDate === dateStr) completedOnThisDay = true;
    } else if (t.dueDate === dateStr) {
      completedOnThisDay = true;
    }
    if (completedOnThisDay) taskCount++;
  }

  const pTarget = Math.max(1, goals.prayerTarget);
  const pomoTarget = Math.max(1, goals.pomodoroTarget);
  const tTarget = Math.max(1, goals.tasksTarget);

  const pRaw = prayerCount / pTarget;
  const pomoRaw = pomoCount / pomoTarget;
  const tRaw = taskCount / tTarget;

  const prayerRing: ActivityRingData = {
    label: "Namaz",
    current: prayerCount,
    target: pTarget,
    unit: "vakit",
    progress: Math.min(1, pRaw),
    rawProgress: pRaw,
    color: "#10b981", // Emerald green
    bgColor: "rgba(16, 185, 129, 0.15)",
  };

  const pomodoroRing: ActivityRingData = {
    label: "Odak",
    current: pomoCount,
    target: pomoTarget,
    unit: "seans",
    minutes: pomoMinutes,
    progress: Math.min(1, pomoRaw),
    rawProgress: pomoRaw,
    color: "#f97316", // Sunset orange
    bgColor: "rgba(249, 115, 22, 0.15)",
  };

  const tasksRing: ActivityRingData = {
    label: "Görevler",
    current: taskCount,
    target: tTarget,
    unit: "görev",
    progress: Math.min(1, tRaw),
    rawProgress: tRaw,
    color: "#06b6d4", // Cyan
    bgColor: "rgba(6, 182, 212, 0.15)",
  };

  const allGoalsMet = prayerCount >= pTarget && pomoCount >= pomoTarget && taskCount >= tTarget;
  const overallScore = Math.round(((Math.min(1, pRaw) + Math.min(1, pomoRaw) + Math.min(1, tRaw)) / 3) * 100);

  const dateObj = new Date(dateStr + "T12:00:00");
  const todayKey = localDateString(new Date());
  const isToday = dateStr === todayKey;
  const dayLabel = isToday ? "Bugün" : dateObj.toLocaleDateString("tr-TR", { weekday: "short" });
  const fullDateLabel = dateObj.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });

  return {
    date: dateStr,
    dayLabel,
    fullDateLabel,
    rings: {
      prayer: prayerRing,
      pomodoro: pomodoroRing,
      tasks: tasksRing,
    },
    allGoalsMet,
    overallScore,
  };
}

export function getWeeklySummaries(
  anchorDateStr: string,
  prayerLogs: PrayerLogDay[],
  pomodoroHistory: Record<string, PomodoroDayLog>,
  tasks: MinimalTask[],
  goals: ActivityGoals
): DayActivitySummary[] {
  const summaries: DayActivitySummary[] = [];
  const anchor = new Date(anchorDateStr + "T12:00:00");
  
  // Find Monday of the week (Monday = 1, Sunday = 7)
  const dayOfWeek = (anchor.getDay() + 6) % 7; // 0 for Monday, 6 for Sunday
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - dayOfWeek);

  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const key = localDateString(current);
    summaries.push(calculateDaySummary(key, prayerLogs, pomodoroHistory, tasks, goals));
  }

  return summaries;
}

export function getMonthlySummaries(
  year: number,
  month: number, // 1 to 12
  prayerLogs: PrayerLogDay[],
  pomodoroHistory: Record<string, PomodoroDayLog>,
  tasks: MinimalTask[],
  goals: ActivityGoals
): DayActivitySummary[] {
  const summaries: DayActivitySummary[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    summaries.push(calculateDaySummary(key, prayerLogs, pomodoroHistory, tasks, goals));
  }

  return summaries;
}

export function calculateStreaks(summaries: DayActivitySummary[]): {
  currentStreak: number;
  bestStreak: number;
  totalGoalsMetDays: number;
} {
  let bestStreak = 0;
  let tempStreak = 0;
  let totalGoalsMetDays = 0;

  // Sort summaries ascending by date
  const sorted = [...summaries].sort((a, b) => a.date.localeCompare(b.date));

  for (const day of sorted) {
    if (day.allGoalsMet) {
      tempStreak++;
      totalGoalsMetDays++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Calculate current streak backwards from today or yesterday
  const todayStr = localDateString(new Date());
  let currentStreak = 0;
  const sortedDesc = [...sorted].reverse();
  
  // If today is completed, count it; if not completed yet, streak might still be intact from yesterday
  for (const day of sortedDesc) {
    if (day.date > todayStr) continue;
    if (day.date === todayStr) {
      if (day.allGoalsMet) {
        currentStreak++;
      }
      continue;
    }
    if (day.allGoalsMet) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    bestStreak,
    totalGoalsMetDays,
  };
}
