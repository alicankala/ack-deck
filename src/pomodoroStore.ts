import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { loadNotificationPreferences } from "./notificationStore";
import { setStudyBlockStatus } from "../shared/studyAttendance";
import { loadTasks, localDateKey } from "./taskStore";
import { isOccurrenceCompleted } from "../shared/recurrence";
import { toggleTaskRecordCompletion } from "./taskActions";

export type PomodoroMode = "pomodoro" | "shortBreak" | "longBreak";

export type PomodoroTarget = {
  kind: "study" | "task";
  id: string;
  label: string;
  durationMinutes?: number;
};

export type PomodoroState = {
  mode: PomodoroMode;
  timeLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  endTimeMs: number | null;
  completedSessions: number;
  completedFocusMinutes: number;
  sessionDate?: string;
  autoStartBreaks: boolean;
  target?: PomodoroTarget;
  targetRemainingSeconds?: number;
  pendingConfirm?: PomodoroTarget;
  manualFreeFocus?: boolean;
};

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Ignore restricted storage access
  }
  return null;
}

function isStaleStudyTarget(target: PomodoroTarget | undefined, today: string): boolean {
  return Boolean(target && target.kind === "study" && !target.id.endsWith(`:${today}`));
}

function nextChunkSeconds(remainingSeconds?: number): number {
  if (!remainingSeconds || remainingSeconds <= 0) return MODE_DURATIONS.pomodoro;
  return Math.min(MODE_DURATIONS.pomodoro, remainingSeconds);
}

export const MODE_DURATIONS: Record<PomodoroMode, number> = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

export const MODE_LABELS: Record<PomodoroMode, { title: string; icon: string }> = {
  pomodoro: { title: "Odak", icon: "🍅" },
  shortBreak: { title: "Kısa Mola", icon: "☕" },
  longBreak: { title: "Uzun Mola", icon: "🌴" },
};

const STORAGE_KEY = "ack-deck.pomodoro.v1";

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Ignore audio context errors in restricted environments
  }
}

function notifyPomodoro(title: string, body: string) {
  try {
    const prefs = loadNotificationPreferences();
    if (prefs.desktopPomodoro && isTauri()) {
      void invoke("send_notification", { title, body }).catch(() => {});
    }
  } catch {
    // Ignore notification errors
  }
}

export function loadInitialState(now = Date.now()): PomodoroState {
  const today = localDateKey(new Date(now));
  const fallback: PomodoroState = {
    mode: "pomodoro",
    timeLeft: MODE_DURATIONS.pomodoro,
    totalSeconds: MODE_DURATIONS.pomodoro,
    isRunning: false,
    endTimeMs: null,
    completedSessions: 0,
    completedFocusMinutes: 0,
    sessionDate: today,
    autoStartBreaks: true,
  };

  try {
    const raw = getStorage()?.getItem(STORAGE_KEY) ?? null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PomodoroState>;
    const mode: PomodoroMode = parsed.mode && MODE_DURATIONS[parsed.mode] ? parsed.mode : "pomodoro";
    const isSameDay = parsed.sessionDate === today;
    const completedSessions =
      isSameDay && typeof parsed.completedSessions === "number" ? parsed.completedSessions : 0;
    const completedFocusMinutes = isSameDay
      ? typeof parsed.completedFocusMinutes === "number"
        ? parsed.completedFocusMinutes
        : completedSessions * 25
      : 0;
    const autoStartBreaks = typeof parsed.autoStartBreaks === "boolean" ? parsed.autoStartBreaks : true;
    const rawTarget = parsed.target && typeof parsed.target.id === "string" ? parsed.target : undefined;
    const dropStaleTarget = !parsed.isRunning && isStaleStudyTarget(rawTarget, today);
    const target = dropStaleTarget ? undefined : rawTarget;
    const targetRemainingSeconds =
      !dropStaleTarget && typeof parsed.targetRemainingSeconds === "number" && parsed.targetRemainingSeconds > 0
        ? parsed.targetRemainingSeconds
        : undefined;
    const rawPending = parsed.pendingConfirm && typeof parsed.pendingConfirm.id === "string" ? parsed.pendingConfirm : undefined;
    const pendingConfirm = isStaleStudyTarget(rawPending, today) ? undefined : rawPending;
    const manualFreeFocus =
      isSameDay && typeof parsed.manualFreeFocus === "boolean" ? parsed.manualFreeFocus : undefined;
    const totalSeconds =
      typeof parsed.totalSeconds === "number" && parsed.totalSeconds > 0
        ? parsed.totalSeconds
        : MODE_DURATIONS[mode];

    if (parsed.isRunning && typeof parsed.endTimeMs === "number") {
      if (now >= parsed.endTimeMs) {
        if (mode === "pomodoro") {
          const finishedToday = localDateKey(new Date(parsed.endTimeMs)) === today;
          const nextSessions = finishedToday ? completedSessions + 1 : 0;
          const addedMin = Math.max(1, Math.round(totalSeconds / 60));
          const nextFocusMinutes = finishedToday ? completedFocusMinutes + addedMin : 0;
          const activeTarget = isStaleStudyTarget(target, today) ? undefined : target;
          const nextRemaining = activeTarget
            ? Math.max(0, (targetRemainingSeconds ?? totalSeconds) - totalSeconds)
            : 0;
          const hasMoreStudy = Boolean(activeTarget && nextRemaining > 0);
          const nextMode: PomodoroMode = nextSessions > 0 && nextSessions % 4 === 0 ? "longBreak" : "shortBreak";
          const breakDur = MODE_DURATIONS[nextMode];
          const breakAlsoElapsed = now >= parsed.endTimeMs + breakDur * 1000;
          const nextFocusDur = hasMoreStudy ? nextChunkSeconds(nextRemaining) : MODE_DURATIONS.pomodoro;
          return {
            mode: breakAlsoElapsed ? "pomodoro" : nextMode,
            timeLeft: breakAlsoElapsed ? nextFocusDur : breakDur,
            totalSeconds: breakAlsoElapsed ? nextFocusDur : breakDur,
            isRunning: false,
            endTimeMs: null,
            completedSessions: nextSessions,
            completedFocusMinutes: nextFocusMinutes,
            sessionDate: today,
            autoStartBreaks,
            target: hasMoreStudy ? activeTarget : undefined,
            targetRemainingSeconds: hasMoreStudy ? nextRemaining : undefined,
            pendingConfirm: hasMoreStudy ? undefined : (activeTarget ?? pendingConfirm),
            manualFreeFocus,
          };
        }
        const activeTarget = isStaleStudyTarget(target, today) ? undefined : target;
        const activeRemaining = activeTarget ? targetRemainingSeconds : undefined;
        const nextFocusDur =
          activeTarget && activeRemaining && activeRemaining > 0
            ? nextChunkSeconds(activeRemaining)
            : MODE_DURATIONS.pomodoro;
        return {
          mode: "pomodoro",
          timeLeft: nextFocusDur,
          totalSeconds: nextFocusDur,
          isRunning: false,
          endTimeMs: null,
          completedSessions,
          completedFocusMinutes,
          sessionDate: today,
          autoStartBreaks,
          target: activeTarget,
          targetRemainingSeconds: activeRemaining,
          pendingConfirm,
          manualFreeFocus,
        };
      }
      const remaining = Math.max(1, Math.round((parsed.endTimeMs - now) / 1000));
      return {
        mode,
        timeLeft: remaining,
        totalSeconds: Math.max(totalSeconds, remaining),
        isRunning: true,
        endTimeMs: parsed.endTimeMs,
        completedSessions,
        completedFocusMinutes,
        sessionDate: today,
        autoStartBreaks,
        target,
        targetRemainingSeconds,
        pendingConfirm,
        manualFreeFocus,
      };
    }

    const defaultIdleDur = mode === "pomodoro" ? MODE_DURATIONS.pomodoro : MODE_DURATIONS[mode];
    const timeLeft = dropStaleTarget
      ? defaultIdleDur
      : typeof parsed.timeLeft === "number" && parsed.timeLeft > 0
        ? parsed.timeLeft
        : defaultIdleDur;
    const effectiveTotal = dropStaleTarget ? defaultIdleDur : Math.max(totalSeconds, timeLeft);
    return {
      mode,
      timeLeft,
      totalSeconds: effectiveTotal,
      isRunning: false,
      endTimeMs: null,
      completedSessions,
      completedFocusMinutes,
      sessionDate: today,
      autoStartBreaks,
      target,
      targetRemainingSeconds,
      pendingConfirm,
      manualFreeFocus,
    };
  } catch {
    return fallback;
  }
}

let state: PomodoroState = loadInitialState();
const listeners = new Set<() => void>();
let intervalId: number | null = null;

export function syncPomodoroDay(now = Date.now()): boolean {
  const today = localDateKey(new Date(now));
  if (state.sessionDate === today) return false;
  const dropStale = !state.isRunning && isStaleStudyTarget(state.target, today);
  const nextTarget = dropStale ? undefined : state.target;
  const nextRemaining = dropStale ? undefined : state.targetRemainingSeconds;
  const nextPending = isStaleStudyTarget(state.pendingConfirm, today) ? undefined : state.pendingConfirm;
  const resetDur = dropStale && state.mode === "pomodoro" ? MODE_DURATIONS.pomodoro : undefined;
  state = {
    ...state,
    completedSessions: 0,
    completedFocusMinutes: 0,
    sessionDate: today,
    manualFreeFocus: false,
    target: nextTarget,
    targetRemainingSeconds: nextRemaining,
    pendingConfirm: nextPending,
    ...(resetDur ? { timeLeft: resetDur, totalSeconds: resetDur } : {}),
  };
  persistAndNotify();
  return true;
}

function persistAndNotify() {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
  syncInterval();
  for (const listener of listeners) {
    listener();
  }
}

function handleSessionComplete() {
  syncPomodoroDay();
  playBeep();

  if (state.mode === "pomodoro") {
    const today = localDateKey();
    const nextSessions = state.completedSessions + 1;
    const addedMinutes = Math.max(1, Math.round(state.totalSeconds / 60));
    const nextFocusMinutes = (state.completedFocusMinutes ?? state.completedSessions * 25) + addedMinutes;
    const finishedTarget = state.target;
    const nextRemaining = finishedTarget
      ? Math.max(0, (state.targetRemainingSeconds ?? state.totalSeconds) - state.totalSeconds)
      : 0;
    const hasMoreStudy = Boolean(finishedTarget && nextRemaining > 0);
    const isLong = nextSessions % 4 === 0;
    const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
    const nextDur = MODE_DURATIONS[nextMode];

    notifyPomodoro(
      finishedTarget
        ? hasMoreStudy
          ? `Odak Bloğu Bitti: ${finishedTarget.label}`
          : `Ders Hedefi Tamamlandı: ${finishedTarget.label}`
        : "Pomodoro Tamamlandı!",
      finishedTarget
        ? hasMoreStudy
          ? `${nextMode === "longBreak" ? "Uzun mola" : "Kısa mola"} zamanı! Kalan hedef: ${Math.ceil(nextRemaining / 60)} dk.`
          : `${finishedTarget.label} süresi doldu. Çalıştım olarak işaretleyebilirsin.`
        : isLong
          ? "Harika iş! 4 tur tamamlandı, 15 dakikalık uzun mola zamanı."
          : "Odak seansı bitti! 5 dakikalık kısa bir mola ver."
    );

    if (hasMoreStudy) {
      const shouldStartBreak = state.autoStartBreaks;
      state = {
        ...state,
        mode: nextMode,
        timeLeft: nextDur,
        totalSeconds: nextDur,
        isRunning: shouldStartBreak,
        endTimeMs: shouldStartBreak ? Date.now() + nextDur * 1000 : null,
        completedSessions: nextSessions,
        completedFocusMinutes: nextFocusMinutes,
        sessionDate: today,
        target: finishedTarget,
        targetRemainingSeconds: nextRemaining,
        pendingConfirm: undefined,
      };
    } else if (state.autoStartBreaks && !finishedTarget) {
      state = {
        ...state,
        mode: nextMode,
        timeLeft: nextDur,
        totalSeconds: nextDur,
        isRunning: true,
        endTimeMs: Date.now() + nextDur * 1000,
        completedSessions: nextSessions,
        completedFocusMinutes: nextFocusMinutes,
        sessionDate: today,
        target: undefined,
        targetRemainingSeconds: undefined,
        pendingConfirm: undefined,
      };
    } else {
      state = {
        ...state,
        mode: nextMode,
        timeLeft: nextDur,
        totalSeconds: nextDur,
        isRunning: false,
        endTimeMs: null,
        completedSessions: nextSessions,
        completedFocusMinutes: nextFocusMinutes,
        sessionDate: today,
        target: undefined,
        targetRemainingSeconds: undefined,
        pendingConfirm: finishedTarget,
      };
    }
  } else {
    const nextFocusDur =
      state.target && state.targetRemainingSeconds && state.targetRemainingSeconds > 0
        ? nextChunkSeconds(state.targetRemainingSeconds)
        : MODE_DURATIONS.pomodoro;
    notifyPomodoro(
      "Mola Bitti!",
      state.target
        ? `${state.target.label} için sonraki ${Math.round(nextFocusDur / 60)} dk odak hazır.`
        : "Mola süresi doldu. Yeni bir odak turuna başlamaya hazır mısın?"
    );
    state = {
      ...state,
      mode: "pomodoro",
      timeLeft: nextFocusDur,
      totalSeconds: nextFocusDur,
      isRunning: false,
      endTimeMs: null,
      sessionDate: localDateKey(),
    };
  }
  persistAndNotify();
}

function tick() {
  syncPomodoroDay();
  if (!state.isRunning || !state.endTimeMs) return;
  const remaining = Math.ceil((state.endTimeMs - Date.now()) / 1000);
  if (remaining <= 0) {
    handleSessionComplete();
    return;
  }
  if (remaining !== state.timeLeft) {
    state = { ...state, timeLeft: remaining };
    for (const listener of listeners) {
      listener();
    }
  }
}

function syncInterval() {
  if (typeof window === "undefined" || typeof window.setInterval !== "function") return;
  if (state.isRunning && state.endTimeMs && intervalId === null) {
    intervalId = window.setInterval(tick, 500);
  } else if ((!state.isRunning || !state.endTimeMs) && intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

syncInterval();

export function getPomodoroSnapshot(): PomodoroState {
  return state;
}

export function reloadPomodoroFromStorage(now = Date.now()): PomodoroState {
  state = loadInitialState(now);
  persistAndNotify();
  return state;
}

export function usePomodoroStore(): PomodoroState {
  const [snapshot, setSnapshot] = useState<PomodoroState>(() => {
    syncPomodoroDay();
    return state;
  });
  useEffect(() => {
    const update = () => setSnapshot(state);
    listeners.add(update);
    syncPomodoroDay();
    update();
    const dayTimer = window.setInterval(() => {
      syncPomodoroDay();
    }, 30_000);
    return () => {
      listeners.delete(update);
      window.clearInterval(dayTimer);
    };
  }, []);
  return snapshot;
}

function currentFocusElapsedSeconds(now = Date.now()): number {
  if (state.mode !== "pomodoro") return 0;
  const liveLeft =
    state.isRunning && state.endTimeMs
      ? Math.max(0, Math.ceil((state.endTimeMs - now) / 1000))
      : state.timeLeft;
  return Math.max(0, state.totalSeconds - liveLeft);
}

export function startPomodoroFocus(options?: { target?: PomodoroTarget; durationSeconds?: number }) {
  syncPomodoroDay();
  const totalTargetSec =
    options?.durationSeconds && options.durationSeconds > 0
      ? Math.round(options.durationSeconds)
      : options?.target?.durationMinutes && options.target.durationMinutes > 0
        ? Math.round(options.target.durationMinutes * 60)
        : MODE_DURATIONS.pomodoro;
  const chunk = nextChunkSeconds(totalTargetSec);
  const nextTarget = options?.target ?? state.target;
  state = {
    ...state,
    mode: "pomodoro",
    timeLeft: chunk,
    totalSeconds: chunk,
    isRunning: true,
    endTimeMs: Date.now() + chunk * 1000,
    sessionDate: localDateKey(),
    target: nextTarget,
    targetRemainingSeconds: nextTarget ? totalTargetSec : undefined,
    pendingConfirm: undefined,
  };
  persistAndNotify();
}

export function togglePomodoroPause() {
  syncPomodoroDay();
  if (state.isRunning) {
    const remaining = state.endTimeMs ? Math.max(1, Math.ceil((state.endTimeMs - Date.now()) / 1000)) : state.timeLeft;
    state = {
      ...state,
      timeLeft: remaining,
      isRunning: false,
      endTimeMs: null,
    };
  } else {
    const dur = state.timeLeft > 0 ? state.timeLeft : MODE_DURATIONS[state.mode];
    state = {
      ...state,
      timeLeft: dur,
      totalSeconds: Math.max(state.totalSeconds, dur),
      isRunning: true,
      endTimeMs: Date.now() + dur * 1000,
      sessionDate: localDateKey(),
      pendingConfirm: undefined,
    };
  }
  persistAndNotify();
}

export function resetPomodoro() {
  syncPomodoroDay();
  const baseDur =
    state.mode === "pomodoro" && state.target
      ? nextChunkSeconds(state.targetRemainingSeconds ?? (state.target.durationMinutes ? state.target.durationMinutes * 60 : undefined))
      : MODE_DURATIONS[state.mode];
  state = {
    ...state,
    timeLeft: baseDur,
    totalSeconds: baseDur,
    isRunning: false,
    endTimeMs: null,
  };
  persistAndNotify();
}

export function switchPomodoroMode(mode: PomodoroMode, now = Date.now()) {
  syncPomodoroDay(now);
  let nextFocusMinutes = state.completedFocusMinutes;
  let nextTarget = state.target;
  let nextTargetRemaining = state.targetRemainingSeconds;
  let nextPendingConfirm = state.pendingConfirm;

  if (state.mode === "pomodoro" && mode !== "pomodoro") {
    const elapsed = currentFocusElapsedSeconds(now);
    const workedMinutes = Math.floor(elapsed / 60);
    if (workedMinutes >= 1) {
      nextFocusMinutes = (state.completedFocusMinutes ?? 0) + workedMinutes;
      if (state.target) {
        const baseRem =
          state.targetRemainingSeconds ??
          (state.target.durationMinutes ? state.target.durationMinutes * 60 : state.totalSeconds);
        const rem = Math.max(0, baseRem - workedMinutes * 60);
        if (rem > 0) {
          nextTargetRemaining = rem;
        } else {
          nextTarget = undefined;
          nextTargetRemaining = undefined;
          nextPendingConfirm = state.target;
        }
      }
    }
  }

  const dur =
    mode === "pomodoro" && nextTarget
      ? nextChunkSeconds(nextTargetRemaining ?? (nextTarget.durationMinutes ? nextTarget.durationMinutes * 60 : undefined))
      : MODE_DURATIONS[mode];
  state = {
    ...state,
    mode,
    timeLeft: dur,
    totalSeconds: dur,
    isRunning: false,
    endTimeMs: null,
    completedFocusMinutes: nextFocusMinutes,
    sessionDate: localDateKey(new Date(now)),
    target: nextTarget,
    targetRemainingSeconds: nextTargetRemaining,
    pendingConfirm: nextPendingConfirm,
  };
  persistAndNotify();
}

export function setPomodoroTarget(target?: PomodoroTarget, manual = false) {
  syncPomodoroDay();
  const isSameTargetWithProgress = Boolean(
    target &&
      state.target?.id === target.id &&
      typeof state.targetRemainingSeconds === "number" &&
      state.targetRemainingSeconds > 0
  );
  const totalTargetSec = target
    ? isSameTargetWithProgress
      ? state.targetRemainingSeconds
      : target.durationMinutes
        ? Math.round(target.durationMinutes * 60)
        : MODE_DURATIONS.pomodoro
    : undefined;
  const nextChunk = totalTargetSec ? nextChunkSeconds(totalTargetSec) : MODE_DURATIONS.pomodoro;
  state = {
    ...state,
    target,
    targetRemainingSeconds: totalTargetSec,
    manualFreeFocus: target ? false : manual,
    ...(!state.isRunning
      ? { mode: "pomodoro" as PomodoroMode, timeLeft: nextChunk, totalSeconds: nextChunk }
      : {}),
  };
  persistAndNotify();
}

export function setPomodoroAutoBreaks(autoStartBreaks: boolean) {
  state = { ...state, autoStartBreaks };
  persistAndNotify();
}

export function clearPomodoroTargetAndReset() {
  syncPomodoroDay();
  state = {
    ...state,
    mode: "pomodoro",
    timeLeft: MODE_DURATIONS.pomodoro,
    totalSeconds: MODE_DURATIONS.pomodoro,
    isRunning: false,
    endTimeMs: null,
    target: undefined,
    targetRemainingSeconds: undefined,
    pendingConfirm: undefined,
  };
  persistAndNotify();
}

export function confirmPomodoroTargetDone(nowOrEvent?: number | unknown) {
  const now = typeof nowOrEvent === "number" ? nowOrEvent : Date.now();
  syncPomodoroDay(now);
  const item = state.pendingConfirm ?? state.target;
  if (!item) return;

  let nextFocusMinutes = state.completedFocusMinutes;
  if (!state.pendingConfirm && state.mode === "pomodoro") {
    const workedMinutes = Math.floor(currentFocusElapsedSeconds(now) / 60);
    if (workedMinutes >= 1) {
      nextFocusMinutes = (state.completedFocusMinutes ?? 0) + workedMinutes;
    }
  }

  if (item.kind === "study") {
    setStudyBlockStatus(item.id, "attended");
  } else {
    const loaded = loadTasks();
    const found = loaded.entries.find(t => t.id === item.id);
    if (found && !isOccurrenceCompleted(found)) {
      toggleTaskRecordCompletion(item.id);
    }
  }

  state = {
    ...state,
    isRunning: false,
    endTimeMs: null,
    timeLeft: MODE_DURATIONS.pomodoro,
    totalSeconds: MODE_DURATIONS.pomodoro,
    mode: "pomodoro",
    completedFocusMinutes: nextFocusMinutes,
    sessionDate: localDateKey(new Date(now)),
    target: undefined,
    targetRemainingSeconds: undefined,
    pendingConfirm: undefined,
  };
  persistAndNotify();
}

export function extendPomodoro(minutes = 15) {
  const extraSec = Math.max(60, Math.round(minutes * 60));
  const target = state.pendingConfirm ?? state.target;
  state = {
    ...state,
    mode: "pomodoro",
    timeLeft: extraSec,
    totalSeconds: extraSec,
    isRunning: true,
    endTimeMs: Date.now() + extraSec * 1000,
    target,
    targetRemainingSeconds: target ? extraSec : undefined,
    pendingConfirm: undefined,
  };
  persistAndNotify();
}

export function dismissPomodoroConfirm() {
  state = {
    ...state,
    pendingConfirm: undefined,
  };
  persistAndNotify();
}
