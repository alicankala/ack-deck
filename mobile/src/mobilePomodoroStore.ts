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
  completedFocusMinutes: number;
  autoStartBreaks: boolean;
  target?: MobilePomodoroTarget;
  targetRemainingSeconds?: number;
  pendingConfirm?: MobilePomodoroTarget;
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
    completedFocusMinutes: 0,
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
    const curFocusMinutes =
      typeof parsed.completedFocusMinutes === "number"
        ? parsed.completedFocusMinutes
        : curSessions * 25;
    const autoStartBreaks = typeof parsed.autoStartBreaks === "boolean" ? parsed.autoStartBreaks : true;
    const target: MobilePomodoroTarget | undefined =
      parsed.target && typeof parsed.target.id === "string" ? parsed.target : undefined;
    const targetRemainingSeconds =
      typeof parsed.targetRemainingSeconds === "number" && parsed.targetRemainingSeconds > 0
        ? parsed.targetRemainingSeconds
        : undefined;
    const pendingConfirm: MobilePomodoroTarget | undefined =
      parsed.pendingConfirm && typeof parsed.pendingConfirm.id === "string"
        ? parsed.pendingConfirm
        : undefined;
    const manualFreeFocus = typeof parsed.manualFreeFocus === "boolean" ? parsed.manualFreeFocus : undefined;
    const fallbackTotal =
      curMode === "pomodoro" && target?.durationMinutes
        ? nextChunkSeconds(target.durationMinutes * 60)
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
            completedFocusMinutes: curFocusMinutes + addedMin,
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
          completedSessions: curSessions,
          completedFocusMinutes: curFocusMinutes,
          autoStartBreaks,
          target,
          targetRemainingSeconds,
          pendingConfirm,
          manualFreeFocus,
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
        completedFocusMinutes: curFocusMinutes,
        autoStartBreaks,
        target,
        targetRemainingSeconds,
        pendingConfirm,
        manualFreeFocus,
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
        completedFocusMinutes: curFocusMinutes,
        autoStartBreaks,
        target,
        targetRemainingSeconds,
        pendingConfirm,
        manualFreeFocus,
      };
    }

    return {
      ...base,
      mode: curMode,
      timeLeft: totalSeconds,
      totalSeconds,
      completedSessions: curSessions,
      completedFocusMinutes: curFocusMinutes,
      autoStartBreaks,
      target,
      targetRemainingSeconds,
      pendingConfirm,
      manualFreeFocus,
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
    const addedMinutes = Math.max(1, Math.round(prev.totalSeconds / 60));
    const nextFocusMinutes = (prev.completedFocusMinutes ?? prev.completedSessions * 25) + addedMinutes;
    const isLong = nextSessions % 4 === 0;
    const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
    const nextDuration = MODE_DURATIONS[nextMode];
    const finishedTarget = prev.target;
    const nextRemaining = finishedTarget
      ? Math.max(0, (prev.targetRemainingSeconds ?? prev.totalSeconds) - prev.totalSeconds)
      : 0;
    const hasMoreStudy = Boolean(finishedTarget && nextRemaining > 0);

    triggerMobileAlert(
      finishedTarget
        ? hasMoreStudy
          ? "Odak bloğu tamamlandı! 🍅"
          : "Ders hedefi tamamlandı! 🍅"
        : "Odak seansı tamamlandı! 🍅",
      finishedTarget
        ? hasMoreStudy
          ? `${nextMode === "longBreak" ? "Uzun mola" : "Kısa mola"} zamanı! Kalan: ${Math.ceil(nextRemaining / 60)} dk.`
          : `${finishedTarget.label} süresi doldu. Çalıştım olarak işaretleyebilirsin.`
        : isLong
        ? "Harika iş! 15 dakika uzun mola zamanı."
        : "Tebrikler! 5 dakika kısa mola zamanı."
    );

    if (hasMoreStudy) {
      const shouldStartBreak = prev.autoStartBreaks;
      setState({
        ...prev,
        mode: nextMode,
        timeLeft: nextDuration,
        totalSeconds: nextDuration,
        completedSessions: nextSessions,
        completedFocusMinutes: nextFocusMinutes,
        isRunning: shouldStartBreak,
        endTimeMs: shouldStartBreak ? Date.now() + nextDuration * 1000 : null,
        target: finishedTarget,
        targetRemainingSeconds: nextRemaining,
        pendingConfirm: undefined,
      });
    } else {
      const shouldAutoStart = prev.autoStartBreaks && !finishedTarget;
      setState({
        ...prev,
        mode: nextMode,
        timeLeft: nextDuration,
        totalSeconds: nextDuration,
        completedSessions: nextSessions,
        completedFocusMinutes: nextFocusMinutes,
        isRunning: shouldAutoStart,
        endTimeMs: shouldAutoStart ? Date.now() + nextDuration * 1000 : null,
        target: undefined,
        targetRemainingSeconds: undefined,
        pendingConfirm: finishedTarget ?? prev.pendingConfirm,
      });
    }
  } else {
    const nextFocusDur =
      prev.target && prev.targetRemainingSeconds && prev.targetRemainingSeconds > 0
        ? nextChunkSeconds(prev.targetRemainingSeconds)
        : MODE_DURATIONS.pomodoro;
    triggerMobileAlert(
      "Mola bitti! ☕",
      prev.target
        ? `${prev.target.label} için sonraki ${Math.round(nextFocusDur / 60)} dk odak hazır.`
        : "Yeni bir odak seansına başlamaya hazırsın."
    );
    setState({
      ...prev,
      mode: "pomodoro",
      timeLeft: nextFocusDur,
      totalSeconds: nextFocusDur,
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
  const totalTargetSec =
    options?.durationSeconds && options.durationSeconds > 0
      ? options.durationSeconds
      : options?.target?.durationMinutes && options.target.durationMinutes > 0
      ? options.target.durationMinutes * 60
      : MODE_DURATIONS.pomodoro;
  const chunk = nextChunkSeconds(totalTargetSec);
  setState(prev => ({
    ...prev,
    mode: "pomodoro",
    timeLeft: chunk,
    totalSeconds: chunk,
    isRunning: true,
    endTimeMs: Date.now() + chunk * 1000,
    target: options?.target,
    targetRemainingSeconds: options?.target ? totalTargetSec : undefined,
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
      prev.mode === "pomodoro" && prev.target
        ? nextChunkSeconds(
            prev.targetRemainingSeconds ??
              (prev.target.durationMinutes ? prev.target.durationMinutes * 60 : undefined)
          )
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
    newMode === "pomodoro" && state.target
      ? nextChunkSeconds(
          state.targetRemainingSeconds ??
            (state.target.durationMinutes ? state.target.durationMinutes * 60 : undefined)
        )
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

export function setMobilePomodoroTarget(target?: MobilePomodoroTarget, manual = false) {
  setState(prev => {
    const totalTargetSec = target
      ? target.durationMinutes && target.durationMinutes > 0
        ? target.durationMinutes * 60
        : MODE_DURATIONS.pomodoro
      : undefined;
    const chunk = totalTargetSec ? nextChunkSeconds(totalTargetSec) : MODE_DURATIONS.pomodoro;
    if (prev.isRunning) {
      return {
        ...prev,
        target,
        targetRemainingSeconds: totalTargetSec,
        manualFreeFocus: target ? false : manual,
      };
    }
    return {
      ...prev,
      mode: "pomodoro",
      timeLeft: chunk,
      totalSeconds: chunk,
      target,
      targetRemainingSeconds: totalTargetSec,
      manualFreeFocus: target ? false : manual,
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
    targetRemainingSeconds: undefined,
  }));
}

export function extendMobilePomodoro(extraMinutes = 15) {
  const pending = state.pendingConfirm;
  const sec = extraMinutes * 60;
  setState(prev => {
    const nextTarget = pending ?? prev.target;
    return {
      ...prev,
      mode: "pomodoro",
      timeLeft: sec,
      totalSeconds: sec,
      isRunning: true,
      endTimeMs: Date.now() + sec * 1000,
      target: nextTarget,
      targetRemainingSeconds: nextTarget ? sec : undefined,
      pendingConfirm: undefined,
    };
  });
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
