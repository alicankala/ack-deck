import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { loadNotificationPreferences } from "./notificationStore";
import { setStudyBlockStatus } from "../shared/studyAttendance";
import { loadTasks } from "./taskStore";
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
  autoStartBreaks: boolean;
  target?: PomodoroTarget;
  targetRemainingSeconds?: number;
  pendingConfirm?: PomodoroTarget;
  manualFreeFocus?: boolean;
};

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

function loadInitialState(): PomodoroState {
  const fallback: PomodoroState = {
    mode: "pomodoro",
    timeLeft: MODE_DURATIONS.pomodoro,
    totalSeconds: MODE_DURATIONS.pomodoro,
    isRunning: false,
    endTimeMs: null,
    completedSessions: 0,
    completedFocusMinutes: 0,
    autoStartBreaks: true,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PomodoroState>;
    const mode: PomodoroMode = parsed.mode && MODE_DURATIONS[parsed.mode] ? parsed.mode : "pomodoro";
    const completedSessions = typeof parsed.completedSessions === "number" ? parsed.completedSessions : 0;
    const completedFocusMinutes =
      typeof parsed.completedFocusMinutes === "number"
        ? parsed.completedFocusMinutes
        : completedSessions * 25;
    const autoStartBreaks = typeof parsed.autoStartBreaks === "boolean" ? parsed.autoStartBreaks : true;
    const target = parsed.target && typeof parsed.target.id === "string" ? parsed.target : undefined;
    const targetRemainingSeconds =
      typeof parsed.targetRemainingSeconds === "number" && parsed.targetRemainingSeconds > 0
        ? parsed.targetRemainingSeconds
        : undefined;
    const pendingConfirm = parsed.pendingConfirm && typeof parsed.pendingConfirm.id === "string" ? parsed.pendingConfirm : undefined;
    const manualFreeFocus = typeof parsed.manualFreeFocus === "boolean" ? parsed.manualFreeFocus : undefined;
    const totalSeconds =
      typeof parsed.totalSeconds === "number" && parsed.totalSeconds > 0
        ? parsed.totalSeconds
        : MODE_DURATIONS[mode];

    if (parsed.isRunning && typeof parsed.endTimeMs === "number") {
      const now = Date.now();
      if (now >= parsed.endTimeMs) {
        if (mode === "pomodoro") {
          const nextSessions = completedSessions + 1;
          const addedMin = Math.max(1, Math.round(totalSeconds / 60));
          const nextMode: PomodoroMode = nextSessions % 4 === 0 ? "longBreak" : "shortBreak";
          const nextRemaining = target
            ? Math.max(0, (targetRemainingSeconds ?? totalSeconds) - totalSeconds)
            : 0;
          const hasMoreStudy = Boolean(target && nextRemaining > 0);
          return {
            mode: nextMode,
            timeLeft: MODE_DURATIONS[nextMode],
            totalSeconds: MODE_DURATIONS[nextMode],
            isRunning: false,
            endTimeMs: null,
            completedSessions: nextSessions,
            completedFocusMinutes: completedFocusMinutes + addedMin,
            autoStartBreaks,
            target: hasMoreStudy ? target : undefined,
            targetRemainingSeconds: hasMoreStudy ? nextRemaining : undefined,
            pendingConfirm: hasMoreStudy ? undefined : (target ?? pendingConfirm),
            manualFreeFocus,
          };
        }
        const nextFocusDur =
          target && targetRemainingSeconds && targetRemainingSeconds > 0
            ? nextChunkSeconds(targetRemainingSeconds)
            : MODE_DURATIONS.pomodoro;
        return {
          mode: "pomodoro",
          timeLeft: nextFocusDur,
          totalSeconds: nextFocusDur,
          isRunning: false,
          endTimeMs: null,
          completedSessions,
          completedFocusMinutes,
          autoStartBreaks,
          target,
          targetRemainingSeconds,
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
        autoStartBreaks,
        target,
        targetRemainingSeconds,
        pendingConfirm,
        manualFreeFocus,
      };
    }

    const timeLeft =
      typeof parsed.timeLeft === "number" && parsed.timeLeft > 0 ? parsed.timeLeft : MODE_DURATIONS[mode];
    return {
      mode,
      timeLeft,
      totalSeconds: Math.max(totalSeconds, timeLeft),
      isRunning: false,
      endTimeMs: null,
      completedSessions,
      completedFocusMinutes,
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

function persistAndNotify() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
  syncInterval();
  for (const listener of listeners) {
    listener();
  }
}

function handleSessionComplete() {
  playBeep();

  if (state.mode === "pomodoro") {
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
    };
  }
  persistAndNotify();
}

function tick() {
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
  if (state.isRunning && state.endTimeMs && intervalId === null) {
    intervalId = window.setInterval(tick, 500);
  } else if ((!state.isRunning || !state.endTimeMs) && intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

syncInterval();

export function usePomodoroStore(): PomodoroState {
  const [snapshot, setSnapshot] = useState<PomodoroState>(() => state);
  useEffect(() => {
    const update = () => setSnapshot(state);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return snapshot;
}

export function startPomodoroFocus(options?: { target?: PomodoroTarget; durationSeconds?: number }) {
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
    target: nextTarget,
    targetRemainingSeconds: nextTarget ? totalTargetSec : undefined,
    pendingConfirm: undefined,
  };
  persistAndNotify();
}

export function togglePomodoroPause() {
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
      pendingConfirm: undefined,
    };
  }
  persistAndNotify();
}

export function resetPomodoro() {
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

export function switchPomodoroMode(mode: PomodoroMode) {
  const dur =
    mode === "pomodoro" && state.target
      ? nextChunkSeconds(state.targetRemainingSeconds ?? (state.target.durationMinutes ? state.target.durationMinutes * 60 : undefined))
      : MODE_DURATIONS[mode];
  state = {
    ...state,
    mode,
    timeLeft: dur,
    totalSeconds: dur,
    isRunning: false,
    endTimeMs: null,
  };
  persistAndNotify();
}

export function setPomodoroTarget(target?: PomodoroTarget, manual = false) {
  const totalTargetSec = target
    ? target.durationMinutes
      ? Math.round(target.durationMinutes * 60)
      : MODE_DURATIONS.pomodoro
    : undefined;
  const nextChunk = totalTargetSec ? nextChunkSeconds(totalTargetSec) : MODE_DURATIONS.pomodoro;
  state = {
    ...state,
    target,
    targetRemainingSeconds: totalTargetSec,
    manualFreeFocus: target ? false : manual,
    ...(state.mode === "pomodoro" && !state.isRunning
      ? { timeLeft: nextChunk, totalSeconds: nextChunk }
      : {}),
  };
  persistAndNotify();
}

export function setPomodoroAutoBreaks(autoStartBreaks: boolean) {
  state = { ...state, autoStartBreaks };
  persistAndNotify();
}

export function clearPomodoroTargetAndReset() {
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

export function confirmPomodoroTargetDone() {
  const item = state.pendingConfirm ?? state.target;
  if (!item) return;

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
