import { useEffect, useRef, useState } from "react";

export type PomodoroMode = "pomodoro" | "shortBreak" | "longBreak";

const MODE_DURATIONS: Record<PomodoroMode, number> = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const MODE_LABELS: Record<PomodoroMode, { title: string; icon: string }> = {
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
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
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
  // If browser has notification permission, show local notification
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      void navigator.serviceWorker.ready.then(reg => {
        return reg.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "ack-pomodoro-alert",
        });
      }).catch(() => {});
    } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  } catch {}
}

export function MobilePomodoroCard({
  isCollapsed,
  onToggleCollapse,
}: {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
} = {}) {
  const [mode, setMode] = useState<PomodoroMode>("pomodoro");
  const [timeLeft, setTimeLeft] = useState<number>(MODE_DURATIONS.pomodoro);
  const [isRunning, setIsRunning] = useState(false);
  const [endTimeMs, setEndTimeMs] = useState<number | null>(null);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [autoStartBreaks, setAutoStartBreaks] = useState(true);

  // Load saved state on mount and handle timestamp-based time progression
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        let curMode: PomodoroMode = "pomodoro";
        if (parsed.mode && MODE_DURATIONS[parsed.mode as PomodoroMode]) {
          curMode = parsed.mode;
          setMode(curMode);
        }
        let curSessions = 0;
        if (typeof parsed.completedSessions === "number") {
          curSessions = parsed.completedSessions;
          setCompletedSessions(curSessions);
        }
        if (typeof parsed.autoStartBreaks === "boolean") {
          setAutoStartBreaks(parsed.autoStartBreaks);
        }

        // Real-time resume check using target timestamp (even if phone was locked or app was minimized)
        if (parsed.isRunning && typeof parsed.endTimeMs === "number") {
          const now = Date.now();
          if (now >= parsed.endTimeMs) {
            // Timer expired while app was locked / in background!
            if (curMode === "pomodoro") {
              const nextSessions = curSessions + 1;
              setCompletedSessions(nextSessions);
              const isLong = nextSessions % 4 === 0;
              const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
              setMode(nextMode);
              setTimeLeft(MODE_DURATIONS[nextMode]);
              setIsRunning(false);
              setEndTimeMs(null);
            } else {
              setMode("pomodoro");
              setTimeLeft(MODE_DURATIONS.pomodoro);
              setIsRunning(false);
              setEndTimeMs(null);
            }
          } else {
            // Still running! Calculate exact seconds remaining
            const remaining = Math.max(1, Math.round((parsed.endTimeMs - now) / 1000));
            setTimeLeft(remaining);
            setIsRunning(true);
            setEndTimeMs(parsed.endTimeMs);
          }
        } else if (typeof parsed.timeLeft === "number" && parsed.timeLeft > 0) {
          setTimeLeft(parsed.timeLeft);
          setIsRunning(false);
          setEndTimeMs(null);
        }
      }
    } catch {}
  }, []);

  // Save state on change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          timeLeft,
          completedSessions,
          autoStartBreaks,
          isRunning,
          endTimeMs,
        })
      );
    } catch {}
  }, [mode, timeLeft, completedSessions, autoStartBreaks, isRunning, endTimeMs]);

  // Keep references to current state so the timer interval can cleanly transition
  const stateRef = useRef({ mode, completedSessions, autoStartBreaks, endTimeMs, isRunning });
  stateRef.current = { mode, completedSessions, autoStartBreaks, endTimeMs, isRunning };

  // Timer interval countdown & background resume handler
  useEffect(() => {
    if (!isRunning) return;

    function checkProgress() {
      const { mode: curMode, completedSessions: curSessions, autoStartBreaks: autoStart, endTimeMs: targetEnd } = stateRef.current;
      const now = Date.now();

      if (!targetEnd || now >= targetEnd) {
        // Time is up! Handle mode transition
        if (curMode === "pomodoro") {
          const nextSessions = curSessions + 1;
          setCompletedSessions(nextSessions);
          const isLong = nextSessions % 4 === 0;
          const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
          const nextDuration = MODE_DURATIONS[nextMode];

          triggerMobileAlert(
            "🍅 Pomodoro Tamamlandı!",
            isLong
              ? "Tebrikler, 4 seansı tamamladın! 15 dakikalık uzun mola başladı."
              : "25 dakikalık odak seansını bitirdin. 5 dakikalık mola başladı!"
          );

          setMode(nextMode);
          setTimeLeft(nextDuration);
          if (autoStart) {
            const nextEnd = Date.now() + nextDuration * 1000;
            setEndTimeMs(nextEnd);
            setIsRunning(true);
          } else {
            setEndTimeMs(null);
            setIsRunning(false);
          }
        } else {
          // Break is over -> return to focus mode
          triggerMobileAlert(
            "☕ Mola Bitti!",
            "Mola süresi doldu. Yeni bir odak seansına hazır olduğunda Başlat'a bas!"
          );

          setMode("pomodoro");
          setTimeLeft(MODE_DURATIONS.pomodoro);
          setIsRunning(false);
          setEndTimeMs(null);
        }
      } else {
        const remaining = Math.max(0, Math.round((targetEnd - now) / 1000));
        setTimeLeft(remaining);
      }
    }

    const timer = setInterval(checkProgress, 500);

    // CRITICAL FOR MOBILE: Sync immediately when user unlocks the phone or returns to the browser
    const handleVisibilitySync = () => {
      if (document.visibilityState === "visible") {
        checkProgress();
      }
    };

    window.addEventListener("focus", handleVisibilitySync);
    document.addEventListener("visibilitychange", handleVisibilitySync);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleVisibilitySync);
      document.removeEventListener("visibilitychange", handleVisibilitySync);
    };
  }, [isRunning]);

  // Screen Wake Lock API: Keep screen awake while focusing if user leaves screen on
  useEffect(() => {
    let wakeLock: { release: () => Promise<void> } | null = null;
    if (isRunning && "wakeLock" in navigator) {
      (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
        .request("screen")
        .then(lock => {
          wakeLock = lock;
        })
        .catch(() => {});
    }
    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [isRunning]);

  function switchMode(newMode: PomodoroMode) {
    setIsRunning(false);
    setEndTimeMs(null);
    setMode(newMode);
    setTimeLeft(MODE_DURATIONS[newMode]);
  }

  function resetTimer() {
    setIsRunning(false);
    setEndTimeMs(null);
    setTimeLeft(MODE_DURATIONS[mode]);
  }

  function toggleRunning() {
    if (isRunning) {
      // Pause
      setIsRunning(false);
      setEndTimeMs(null);
    } else {
      // Start: ask for notification permission on first interaction if not yet prompted
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      const target = Date.now() + timeLeft * 1000;
      setEndTimeMs(target);
      setIsRunning(true);
    }
  }

  function skipPhase() {
    setIsRunning(false);
    setEndTimeMs(null);
    if (mode === "pomodoro") {
      const nextSessions = completedSessions + 1;
      setCompletedSessions(nextSessions);
      const isLong = nextSessions % 4 === 0;
      const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
      setMode(nextMode);
      setTimeLeft(MODE_DURATIONS[nextMode]);
    } else {
      setMode("pomodoro");
      setTimeLeft(MODE_DURATIONS.pomodoro);
    }
  }

  const totalTime = MODE_DURATIONS[mode];
  const progressPercent = Math.min(100, Math.max(0, ((totalTime - timeLeft) / totalTime) * 100));
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (isCollapsed) {
    return (
      <div
        className="mobile-collapsed-card"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        title="Pomodoro kartını genişletmek için tıkla"
      >
        <div className="mobile-collapsed-left">
          <span className="mobile-collapsed-icon" aria-hidden="true">🍅</span>
          <span className="mobile-collapsed-title">Pomodoro:</span>
          <span className="mobile-collapsed-text">
            {timeFormatted} · {MODE_LABELS[mode].title} ({isRunning ? "Çalışıyor" : "Duraklatıldı"}) · Toplam {completedSessions}
          </span>
        </div>
        <span className="mobile-collapsed-arrow" aria-hidden="true">⌄</span>
      </div>
    );
  }

  return (
    <article className="mobile-pomodoro-card" aria-label="Pomodoro Odak Sayacı">
      {/* Header */}
      <div className="mobile-pomodoro-header">
        <div className="mobile-pomodoro-title-group">
          <span className="mobile-pomodoro-icon" aria-hidden="true">🍅</span>
          <div>
            <h3>Pomodoro Odak Sayacı</h3>
            <span className="mobile-pomodoro-sub">
              {completedSessions > 0
                ? `Bugün ${completedSessions} seans tamamlandı (${completedSessions * 25} dk odak)`
                : "25 dk odaklan, 5 dk mola ver"}
            </span>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            className="mobile-card-collapse-btn"
            onClick={onToggleCollapse}
            title="Kartı daralt"
            aria-label="Pomodoro kartını daralt"
          >
            ⌃
          </button>
        )}
      </div>

      {/* Mode Selector Segment */}
      <div className="mobile-pomodoro-modes" role="tablist" aria-label="Pomodoro modları">
        {(["pomodoro", "shortBreak", "longBreak"] as PomodoroMode[]).map(m => (
          <button
            type="button"
            key={m}
            className={`mobile-pomodoro-mode-btn ${mode === m ? "is-active" : ""}`}
            onClick={() => switchMode(m)}
            role="tab"
            aria-selected={mode === m}
          >
            <span>{MODE_LABELS[m].icon}</span>
            <span>{MODE_LABELS[m].title}</span>
          </button>
        ))}
      </div>

      {/* Timer Display */}
      <div className="mobile-pomodoro-display">
        <span className="mobile-pomodoro-digits">{timeFormatted}</span>
        <span className={`mobile-pomodoro-badge mode-${mode}`}>{MODE_LABELS[mode].title}</span>
      </div>

      {/* Main Action Controls */}
      <div className="mobile-pomodoro-controls">
        <button
          type="button"
          className={`mobile-pomodoro-action-btn ${isRunning ? "is-running" : ""}`}
          onClick={toggleRunning}
        >
          {isRunning ? "Duraklat" : "Başlat"}
        </button>
        <button
          type="button"
          className="mobile-pomodoro-sec-btn"
          onClick={resetTimer}
          title="Sıfırla"
        >
          Sıfırla
        </button>
        <button
          type="button"
          className="mobile-pomodoro-sec-btn"
          onClick={skipPhase}
          title={mode === "pomodoro" ? "Molaya geç" : "Odağa geç"}
        >
          {mode === "pomodoro" ? "Molaya Geç" : "Odağa Dön"}
        </button>
      </div>

      {/* Footer Info: Cycle Dots + Auto Break Toggle */}
      <div className="mobile-pomodoro-footer">
        <div className="mobile-pomodoro-track">
          <span className="mobile-pomodoro-track-label">Döngü:</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={`mobile-pomodoro-dot ${i < (completedSessions % 4) ? "is-done" : ""}`}
              aria-hidden="true"
            >
              {i < (completedSessions % 4) ? "🍅" : "○"}
            </span>
          ))}
          <span className="mobile-pomodoro-total-badge">Toplam {completedSessions}</span>
        </div>

        <label className="mobile-pomodoro-autobreak">
          <input
            type="checkbox"
            checked={autoStartBreaks}
            onChange={e => setAutoStartBreaks(e.target.checked)}
          />
          <span>Oto mola</span>
        </label>
      </div>

      {/* Progress Bar at Bottom of Card */}
      <div className="mobile-pomodoro-progress-bar" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className={`mobile-pomodoro-progress-fill mode-${mode}`} style={{ width: `${progressPercent}%` }} />
      </div>
    </article>
  );
}
