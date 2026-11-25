import { useEffect, useState } from "react";
import { dateKey } from "../../shared/weeklyPlan";

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
  sessionDate?: string;
  autoStartBreaks: boolean;
  target?: MobilePomodoroTarget;
  targetRemainingSeconds?: number;
  pendingConfirm?: MobilePomodoroTarget;
  manualFreeFocus?: boolean;
};

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {}
  return null;
}

function isStaleStudyTarget(target: MobilePomodoroTarget | undefined, today: string): boolean {
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

function defaultState(today = dateKey(new Date())): MobilePomodoroState {
  return {
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
}

export function loadInitialMobilePomodoroState(now = Date.now()): MobilePomodoroState {
  const today = dateKey(new Date(now));
  const base = defaultState(today);
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY) ?? null;
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const curMode: PomodoroMode =
      parsed.mode && MODE_DURATIONS[parsed.mode as PomodoroMode] ? parsed.mode : "pomodoro";
    const isSameDay = parsed.sessionDate === today;
    const curSessions =
      isSameDay && typeof parsed.completedSessions === "number" ? parsed.completedSessions : 0;
    const curFocusMinutes = isSameDay
      ? typeof parsed.completedFocusMinutes === "number"
        ? parsed.completedFocusMinutes
        : curSessions * 25
      : 0;
    const autoStartBreaks = typeof parsed.autoStartBreaks === "boolean" ? parsed.autoStartBreaks : true;
    const rawTarget: MobilePomodoroTarget | undefined =
      parsed.target && typeof parsed.target.id === "string" ? parsed.target : undefined;
    const dropStaleTarget = !parsed.isRunning && isStaleStudyTarget(rawTarget, today);
    const target = dropStaleTarget ? undefined : rawTarget;
    const targetRemainingSeconds =
      !dropStaleTarget && typeof parsed.targetRemainingSeconds === "number" && parsed.targetRemainingSeconds > 0
        ? parsed.targetRemainingSeconds
        : undefined;
    const rawPending: MobilePomodoroTarget | undefined =
      parsed.pendingConfirm && typeof parsed.pendingConfirm.id === "string"
        ? parsed.pendingConfirm
        : undefined;
    const pendingConfirm = isStaleStudyTarget(rawPending, today) ? undefined : rawPending;
    const manualFreeFocus =
      isSameDay && typeof parsed.manualFreeFocus === "boolean" ? parsed.manualFreeFocus : undefined;
    const fallbackTotal =
      curMode === "pomodoro" && target?.durationMinutes
        ? nextChunkSeconds(target.durationMinutes * 60)
        : MODE_DURATIONS[curMode];
    const totalSeconds =
      typeof parsed.totalSeconds === "number" && parsed.totalSeconds > 0
        ? parsed.totalSeconds
        : fallbackTotal;

    if (parsed.isRunning && typeof parsed.endTimeMs === "number") {
      if (now >= parsed.endTimeMs) {
        if (curMode === "pomodoro") {
          const finishedToday = dateKey(new Date(parsed.endTimeMs)) === today;
          const nextSessions = finishedToday ? curSessions + 1 : 0;
          const addedMin = Math.max(1, Math.round(totalSeconds / 60));
          const nextFocusMinutes = finishedToday ? curFocusMinutes + addedMin : 0;
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
          completedSessions: curSessions,
          completedFocusMinutes: curFocusMinutes,
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
        mode: curMode,
        timeLeft: remaining,
        totalSeconds: Math.max(totalSeconds, remaining),
        isRunning: true,
        endTimeMs: parsed.endTimeMs,
        completedSessions: curSessions,
        completedFocusMinutes: curFocusMinutes,
        sessionDate: today,
        autoStartBreaks,
        target,
        targetRemainingSeconds,
        pendingConfirm,
        manualFreeFocus,
      };
    }

    const defaultIdleDur = MODE_DURATIONS[curMode];
    const timeLeft = dropStaleTarget
      ? defaultIdleDur
      : typeof parsed.timeLeft === "number" && parsed.timeLeft > 0
        ? parsed.timeLeft
        : defaultIdleDur;
    const effectiveTotal = dropStaleTarget ? defaultIdleDur : Math.max(totalSeconds, timeLeft);
    return {
      mode: curMode,
      timeLeft,
      totalSeconds: effectiveTotal,
      isRunning: false,
      endTimeMs: null,
      completedSessions: curSessions,
      completedFocusMinutes: curFocusMinutes,
      sessionDate: today,
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

let state: MobilePomodoroState = loadInitialMobilePomodoroState();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function persist(next: MobilePomodoroState) {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(next));
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

export function syncMobilePomodoroDay(now = Date.now()): boolean {
  const today = dateKey(new Date(now));
  if (state.sessionDate === today) return false;
  const dropStale = !state.isRunning && isStaleStudyTarget(state.target, today);
  const nextTarget = dropStale ? undefined : state.target;
  const nextRemaining = dropStale ? undefined : state.targetRemainingSeconds;
  const nextPending = isStaleStudyTarget(state.pendingConfirm, today) ? undefined : state.pendingConfirm;
  const resetDur = dropStale && state.mode === "pomodoro" ? MODE_DURATIONS.pomodoro : undefined;
  setState(prev => ({
    ...prev,
    completedSessions: 0,
    completedFocusMinutes: 0,
    sessionDate: today,
    manualFreeFocus: false,
    target: nextTarget,
    targetRemainingSeconds: nextRemaining,
    pendingConfirm: nextPending,
    ...(resetDur ? { timeLeft: resetDur, totalSeconds: resetDur } : {}),
  }));
  return true;
}

function finishPhase() {
  syncMobilePomodoroDay();
  const prev = state;
  const today = dateKey(new Date());
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
        sessionDate: today,
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
        sessionDate: today,
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
      sessionDate: today,
    });
  }
}

function tick() {
  syncMobilePomodoroDay();
  if (!state.isRunning || !state.endTimeMs) return;
  const remaining = Math.ceil((state.endTimeMs - Date.now()) / 1000);
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
  if (state.isRunning && state.endTimeMs && !intervalId) {
    intervalId = setInterval(tick, 500);
  } else if ((!state.isRunning || !state.endTimeMs) && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

syncInterval();

function currentFocusElapsedSeconds(now = Date.now()): number {
  if (state.mode !== "pomodoro") return 0;
  const liveLeft =
    state.isRunning && state.endTimeMs
      ? Math.max(0, Math.ceil((state.endTimeMs - now) / 1000))
      : state.timeLeft;
  return Math.max(0, state.totalSeconds - liveLeft);
}

export function useMobilePomodoroStore(): MobilePomodoroState {
  const [snap, setSnap] = useState<MobilePomodoroState>(() => {
    syncMobilePomodoroDay();
    return state;
  });
  useEffect(() => {
    const update = () => setSnap(state);
    listeners.add(update);
    syncMobilePomodoroDay();
    update();
    const dayTimer = setInterval(() => {
      syncMobilePomodoroDay();
    }, 30_000);
    return () => {
      listeners.delete(update);
      clearInterval(dayTimer);
    };
  }, []);
  return snap;
}

export function startMobilePomodoroFocus(options?: {
  target?: MobilePomodoroTarget;
  durationSeconds?: number;
}) {
  syncMobilePomodoroDay();
  const totalTargetSec =
    options?.durationSeconds && options.durationSeconds > 0
      ? Math.round(options.durationSeconds)
      : options?.target?.durationMinutes && options.target.durationMinutes > 0
      ? Math.round(options.target.durationMinutes * 60)
      : MODE_DURATIONS.pomodoro;
  const chunk = nextChunkSeconds(totalTargetSec);
  const nextTarget = options?.target ?? state.target;
  setState(prev => ({
    ...prev,
    mode: "pomodoro",
    timeLeft: chunk,
    totalSeconds: chunk,
    isRunning: true,
    endTimeMs: Date.now() + chunk * 1000,
    sessionDate: dateKey(new Date()),
    target: nextTarget,
    targetRemainingSeconds: nextTarget ? totalTargetSec : undefined,
    pendingConfirm: undefined,
  }));
}

export function toggleMobilePomodoroPause() {
  syncMobilePomodoroDay();
  setState(prev => {
    if (prev.isRunning) {
      const remaining = prev.endTimeMs
        ? Math.max(1, Math.ceil((prev.endTimeMs - Date.now()) / 1000))
        : prev.timeLeft;
      return { ...prev, timeLeft: remaining, isRunning: false, endTimeMs: null };
    }
    const dur = prev.timeLeft > 0 ? prev.timeLeft : MODE_DURATIONS[prev.mode];
    return {
      ...prev,
      timeLeft: dur,
      totalSeconds: Math.max(prev.totalSeconds, dur),
      isRunning: true,
      endTimeMs: Date.now() + dur * 1000,
      sessionDate: dateKey(new Date()),
      pendingConfirm: undefined,
    };
  });
}

export function resetMobilePomodoro() {
  syncMobilePomodoroDay();
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

export function switchMobilePomodoroMode(newMode: PomodoroMode, nowOrEvent?: number | unknown) {
  const now = typeof nowOrEvent === "number" ? nowOrEvent : Date.now();
  syncMobilePomodoroDay(now);

  let nextFocusMinutes = state.completedFocusMinutes;
  let nextTarget = state.target;
  let nextTargetRemaining = state.targetRemainingSeconds;
  let nextPendingConfirm = state.pendingConfirm;

  if (state.mode === "pomodoro" && newMode !== "pomodoro") {
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
    newMode === "pomodoro" && nextTarget
      ? nextChunkSeconds(
          nextTargetRemaining ??
            (nextTarget.durationMinutes ? nextTarget.durationMinutes * 60 : undefined)
        )
      : MODE_DURATIONS[newMode];
  setState(prev => ({
    ...prev,
    mode: newMode,
    timeLeft: dur,
    totalSeconds: dur,
    isRunning: false,
    endTimeMs: null,
    completedFocusMinutes: nextFocusMinutes,
    sessionDate: dateKey(new Date(now)),
    target: nextTarget,
    targetRemainingSeconds: nextTargetRemaining,
    pendingConfirm: nextPendingConfirm,
  }));
}

export function skipMobilePomodoroPhase() {
  if (state.mode === "pomodoro") {
    const nextMode: PomodoroMode = (state.completedSessions + 1) % 4 === 0 ? "longBreak" : "shortBreak";
    switchMobilePomodoroMode(nextMode);
  } else {
    switchMobilePomodoroMode("pomodoro");
  }
}

export function setMobilePomodoroTarget(target?: MobilePomodoroTarget, manual = false) {
  syncMobilePomodoroDay();
  setState(prev => {
    const isSameTargetWithProgress = Boolean(
      target &&
        prev.target?.id === target.id &&
        typeof prev.targetRemainingSeconds === "number" &&
        prev.targetRemainingSeconds > 0
    );
    const totalTargetSec = target
      ? isSameTargetWithProgress
        ? prev.targetRemainingSeconds
        : target.durationMinutes && target.durationMinutes > 0
          ? Math.round(target.durationMinutes * 60)
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
  syncMobilePomodoroDay();
  setState(prev => ({
    ...prev,
    mode: "pomodoro",
    timeLeft: MODE_DURATIONS.pomodoro,
    totalSeconds: MODE_DURATIONS.pomodoro,
    isRunning: false,
    endTimeMs: null,
    target: undefined,
    targetRemainingSeconds: undefined,
    pendingConfirm: undefined,
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
