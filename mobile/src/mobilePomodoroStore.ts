import { useEffect, useState } from "react";

export type PomodoroMode = "pomodoro" | "shortBreak" | "longBreak";

export type MobilePomodoroTarget = {
  kind: "study" | "task";
  id: string;
  label: string;
  durationMinutes?: number;
};

export type MobilePomodoroState = {
  mode: PomodoroMode;
  timeLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  endTimeMs: number | null;
  completedSessions: number;
  autoStartBreaks: boolean;
  target?: MobilePomodoroTarget;
  pendingConfirm?: MobilePomodoroTarget;
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
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function triggerMobileAlert(title: string, body: string) {
  playBeep();
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate([200, 100, 200, 100, 400]);
    } catch {}
  }
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      void navigator.serviceWorker.ready
        .then(reg =>
          reg.showNotification(title, {
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: "ack-pomodoro-alert",
          })
        )
        .catch(() => {});
    } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  } catch {}
}

function defaultState(): MobilePomodoroState {
  return {
    mode: "pomodoro",
    timeLeft: MODE_DURATIONS.pomodoro,
    totalSeconds: MODE_DURATIONS.pomodoro,
    isRunning: false,
    endTimeMs: null,
    completedSessions: 0,
    autoStartBreaks: true,
  };
}

function loadInitialState(): MobilePomodoroState {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const curMode: PomodoroMode =
      parsed.mode && MODE_DURATIONS[parsed.mode as PomodoroMode] ? parsed.mode : "pomodoro";
    const curSessions = typeof parsed.completedSessions === "number" ? parsed.completedSessions : 0;
    const autoStartBreaks = typeof parsed.autoStartBreaks === "boolean" ? parsed.autoStartBreaks : true;
    const target: MobilePomodoroTarget | undefined =
      parsed.target && typeof parsed.target.id === "string" ? parsed.target : undefined;
    const pendingConfirm: MobilePomodoroTarget | undefined =
      parsed.pendingConfirm && typeof parsed.pendingConfirm.id === "string"
        ? parsed.pendingConfirm
        : undefined;
    const fallbackTotal =
      curMode === "pomodoro" && target?.durationMinutes
        ? target.durationMinutes * 60
        : MODE_DURATIONS[curMode];
    const totalSeconds =
      typeof parsed.totalSeconds === "number" && parsed.totalSeconds > 0
        ? parsed.totalSeconds
        : fallbackTotal;

    if (parsed.isRunning && typeof parsed.endTimeMs === "number") {
      const now = Date.now();
      if (now >= parsed.endTimeMs) {
        if (curMode === "pomodoro") {
          const nextSessions = curSessions + 1;
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
          completedSessions: curSessions,
          autoStartBreaks,
          target,
          pendingConfirm,
        };
      }
      const remaining = Math.max(1, Math.round((parsed.endTimeMs - now) / 1000));
      return {
        mode: curMode,
        timeLeft: remaining,
        totalSeconds,
        isRunning: true,
        endTimeMs: parsed.endTimeMs,
        completedSessions: curSessions,
        autoStartBreaks,
        target,
        pendingConfirm,
      };
    }

    if (typeof parsed.timeLeft === "number" && parsed.timeLeft > 0) {
      return {
        mode: curMode,
        timeLeft: parsed.timeLeft,
        totalSeconds,
        isRunning: false,
        endTimeMs: null,
        completedSessions: curSessions,
        autoStartBreaks,
        target,
        pendingConfirm,
      };
    }

    return {
      ...base,
      mode: curMode,
      timeLeft: totalSeconds,
      totalSeconds,
      completedSessions: curSessions,
      autoStartBreaks,
      target,
      pendingConfirm,
    };
  } catch {
    return base;
  }
}

let state: MobilePomodoroState = loadInitialState();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function persist(next: MobilePomodoroState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function notify() {
  for (const l of listeners) l();
}

function setState(updater: MobilePomodoroState | ((prev: MobilePomodoroState) => MobilePomodoroState)) {
  state = typeof updater === "function" ? updater(state) : updater;
  persist(state);
  syncInterval();
  notify();
}

function finishPhase() {
  const prev = state;
  if (prev.mode === "pomodoro") {
    const nextSessions = prev.completedSessions + 1;
    const isLong = nextSessions % 4 === 0;
    const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
    const nextDuration = MODE_DURATIONS[nextMode];
    const finishedTarget = prev.target;

    triggerMobileAlert(
      "Odak seansı tamamlandı! 🍅",
      finishedTarget
        ? `${finishedTarget.label} tamamlandı mı?`
        : isLong
        ? "Harika iş! 15 dakika uzun mola zamanı."
        : "Tebrikler! 5 dakika kısa mola zamanı."
    );

    const shouldAutoStart = prev.autoStartBreaks && !finishedTarget;
    setState({
      ...prev,
      mode: nextMode,
      timeLeft: nextDuration,
      totalSeconds: nextDuration,
      completedSessions: nextSessions,
      isRunning: shouldAutoStart,
      endTimeMs: shouldAutoStart ? Date.now() + nextDuration * 1000 : null,
      target: undefined,
      pendingConfirm: finishedTarget ?? prev.pendingConfirm,
    });
  } else {
    triggerMobileAlert("Mola bitti! ☕", "Yeni bir odak seansına başlamaya hazırsın.");
    setState({
      ...prev,
      mode: "pomodoro",
      timeLeft: MODE_DURATIONS.pomodoro,
      totalSeconds: MODE_DURATIONS.pomodoro,
      isRunning: false,
      endTimeMs: null,
    });
  }
}

function tick() {
  if (!state.isRunning || !state.endTimeMs) return;
  const remaining = Math.round((state.endTimeMs - Date.now()) / 1000);
  if (remaining <= 0) {
    finishPhase();
    return;
  }
  if (remaining !== state.timeLeft) {
    state = { ...state, timeLeft: remaining };
    persist(state);
    notify();
  }
}

function syncInterval() {
  if (state.isRunning && !intervalId) {
    intervalId = setInterval(tick, 1000);
  } else if (!state.isRunning && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

syncInterval();

export function useMobilePomodoroStore(): MobilePomodoroState {
  const [snap, setSnap] = useState<MobilePomodoroState>(state);
  useEffect(() => {
    const update = () => setSnap(state);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return snap;
}

export function startMobilePomodoroFocus(options?: {
  target?: MobilePomodoroTarget;
  durationSeconds?: number;
}) {
  const duration =
    options?.durationSeconds && options.durationSeconds > 0
      ? options.durationSeconds
      : options?.target?.durationMinutes && options.target.durationMinutes > 0
      ? options.target.durationMinutes * 60
      : MODE_DURATIONS.pomodoro;
  setState(prev => ({
    ...prev,
    mode: "pomodoro",
    timeLeft: duration,
    totalSeconds: duration,
    isRunning: true,
    endTimeMs: Date.now() + duration * 1000,
    target: options?.target,
    pendingConfirm: undefined,
  }));
}

export function toggleMobilePomodoroPause() {
  setState(prev => {
    if (prev.isRunning) {
      return { ...prev, isRunning: false, endTimeMs: null };
    }
    return {
      ...prev,
      isRunning: true,
      endTimeMs: Date.now() + prev.timeLeft * 1000,
    };
  });
}

export function resetMobilePomodoro() {
  setState(prev => {
    const dur =
      prev.mode === "pomodoro" && prev.target?.durationMinutes
        ? prev.target.durationMinutes * 60
        : MODE_DURATIONS[prev.mode];
    return {
      ...prev,
      isRunning: false,
      endTimeMs: null,
      timeLeft: dur,
      totalSeconds: dur,
    };
  });
}

export function switchMobilePomodoroMode(newMode: PomodoroMode) {
  const dur =
    newMode === "pomodoro" && state.target?.durationMinutes
      ? state.target.durationMinutes * 60
      : MODE_DURATIONS[newMode];
  setState(prev => ({
    ...prev,
    mode: newMode,
    timeLeft: dur,
    totalSeconds: dur,
    isRunning: false,
    endTimeMs: null,
  }));
}

export function skipMobilePomodoroPhase() {
  const nextMode: PomodoroMode = state.mode === "pomodoro" ? "shortBreak" : "pomodoro";
  switchMobilePomodoroMode(nextMode);
}

export function setMobilePomodoroTarget(target?: MobilePomodoroTarget) {
  setState(prev => {
    if (prev.isRunning) {
      return { ...prev, target };
    }
    const dur =
      target?.durationMinutes && target.durationMinutes > 0
        ? target.durationMinutes * 60
        : MODE_DURATIONS.pomodoro;
    return {
      ...prev,
      mode: "pomodoro",
      timeLeft: dur,
      totalSeconds: dur,
      target,
    };
  });
}

export function setMobilePomodoroAutoBreaks(autoStartBreaks: boolean) {
  setState(prev => ({ ...prev, autoStartBreaks }));
}

export function clearMobilePomodoroTargetAndReset() {
  setState(prev => ({
    ...prev,
    mode: "pomodoro",
    timeLeft: MODE_DURATIONS.pomodoro,
    totalSeconds: MODE_DURATIONS.pomodoro,
    isRunning: false,
    endTimeMs: null,
    target: undefined,
  }));
}

export function extendMobilePomodoro(extraMinutes = 15) {
  const pending = state.pendingConfirm;
  const sec = extraMinutes * 60;
  setState(prev => ({
    ...prev,
    mode: "pomodoro",
    timeLeft: sec,
    totalSeconds: sec,
    isRunning: true,
    endTimeMs: Date.now() + sec * 1000,
    target: pending ?? prev.target,
    pendingConfirm: undefined,
  }));
}

export function dismissMobilePomodoroConfirm() {
  setState(prev => ({ ...prev, pendingConfirm: undefined }));
}

export function requestMobilePomodoroConfirmDone() {
  const target = state.pendingConfirm;
  if (!target) return;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ack-mobile-pomodoro-confirm", { detail: target }));
  }
  setState(prev => ({ ...prev, pendingConfirm: undefined }));
}
