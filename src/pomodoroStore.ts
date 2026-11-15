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
  autoStartBreaks: boolean;
  target?: PomodoroTarget;
  pendingConfirm?: PomodoroTarget;
};

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
    autoStartBreaks: true,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PomodoroState>;
    const mode: PomodoroMode = parsed.mode && MODE_DURATIONS[parsed.mode] ? parsed.mode : "pomodoro";
    const completedSessions = typeof parsed.completedSessions === "number" ? parsed.completedSessions : 0;
    const autoStartBreaks = typeof parsed.autoStartBreaks === "boolean" ? parsed.autoStartBreaks : true;
    const target = parsed.target && typeof parsed.target.id === "string" ? parsed.target : undefined;
    const pendingConfirm = parsed.pendingConfirm && typeof parsed.pendingConfirm.id === "string" ? parsed.pendingConfirm : undefined;
    const totalSeconds =
      typeof parsed.totalSeconds === "number" && parsed.totalSeconds > 0
        ? parsed.totalSeconds
        : MODE_DURATIONS[mode];

    if (parsed.isRunning && typeof parsed.endTimeMs === "number") {
      const now = Date.now();
      if (now >= parsed.endTimeMs) {
        if (mode === "pomodoro") {
          const nextSessions = completedSessions + 1;
          const nextMode: PomodoroMode = nextSessions % 4 === 0 ? "longBreak" : "shortBreak";
          return {
            mode: nextMode,
            timeLeft: MODE_DURATIONS[nextMode],
            totalSeconds: MODE_DURATIONS[nextMode],
            isRunning: false,
            endTimeMs: null,
            completedSessions: nextSessions,
            autoStartBreaks,
            target: undefined,
            pendingConfirm: target ?? pendingConfirm,
          };
        }
        return {
          mode: "pomodoro",
          timeLeft: MODE_DURATIONS.pomodoro,
          totalSeconds: MODE_DURATIONS.pomodoro,
          isRunning: false,
          endTimeMs: null,
          completedSessions,
          autoStartBreaks,
          target,
          pendingConfirm,
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
        autoStartBreaks,
        target,
        pendingConfirm,
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
      autoStartBreaks,
      target,
      pendingConfirm,
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
    const finishedTarget = state.target;
    const isLong = nextSessions % 4 === 0;
    const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
    const nextDur = MODE_DURATIONS[nextMode];

    notifyPomodoro(
      finishedTarget ? `Odak Tamamlandı: ${finishedTarget.label}` : "Pomodoro Tamamlandı!",
      finishedTarget
        ? `${nextMode === "longBreak" ? "Uzun mola" : "Kısa mola"} zamanı. Tamamlandı olarak işaretleyebilirsin.`
        : isLong
          ? "Harika iş! 4 tur tamamlandı, 15 dakikalık uzun mola zamanı."
          : "Odak seansı bitti! 5 dakikalık kısa bir mola ver."
    );

    if (state.autoStartBreaks && !finishedTarget) {
      state = {
        ...state,
        mode: nextMode,
        timeLeft: nextDur,
        totalSeconds: nextDur,
        isRunning: true,
        endTimeMs: Date.now() + nextDur * 1000,
        completedSessions: nextSessions,
        target: undefined,
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
        target: undefined,
        pendingConfirm: finishedTarget,
      };
    }
  } else {
    notifyPomodoro("Mola Bitti!", "Mola süresi doldu. Yeni bir odak turuna başlamaya hazır mısın?");
    state = {
      ...state,
      mode: "pomodoro",
      timeLeft: MODE_DURATIONS.pomodoro,
      totalSeconds: MODE_DURATIONS.pomodoro,
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
  const dur =
    options?.durationSeconds && options.durationSeconds > 0
      ? Math.round(options.durationSeconds)
      : options?.target?.durationMinutes && options.target.durationMinutes > 0
        ? Math.round(options.target.durationMinutes * 60)
        : MODE_DURATIONS.pomodoro;
  state = {
    ...state,
    mode: "pomodoro",
    timeLeft: dur,
    totalSeconds: dur,
    isRunning: true,
    endTimeMs: Date.now() + dur * 1000,
    target: options?.target ?? state.target,
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
    state.mode === "pomodoro" && state.target?.durationMinutes
      ? Math.round(state.target.durationMinutes * 60)
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
    mode === "pomodoro" && state.target?.durationMinutes
      ? Math.round(state.target.durationMinutes * 60)
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

export function setPomodoroTarget(target?: PomodoroTarget) {
  const nextDur =
    state.mode === "pomodoro" && !state.isRunning
      ? target?.durationMinutes
        ? Math.round(target.durationMinutes * 60)
        : MODE_DURATIONS.pomodoro
      : state.totalSeconds;
  state = {
    ...state,
    target,
    ...(state.mode === "pomodoro" && !state.isRunning
      ? { timeLeft: nextDur, totalSeconds: nextDur }
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
