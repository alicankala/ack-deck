import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { invoke, isTauri } from "@tauri-apps/api/core";

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
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

export function PomodoroTimer() {
  const [mode, setMode] = useState<PomodoroMode>("pomodoro");
  const [timeLeft, setTimeLeft] = useState<number>(MODE_DURATIONS.pomodoro);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [autoStartBreaks, setAutoStartBreaks] = useState(true);

  // Load saved state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.mode && MODE_DURATIONS[parsed.mode as PomodoroMode]) {
          setMode(parsed.mode);
        }
        if (typeof parsed.completedSessions === "number") {
          setCompletedSessions(parsed.completedSessions);
        }
        if (typeof parsed.timeLeft === "number" && parsed.timeLeft > 0) {
          setTimeLeft(parsed.timeLeft);
        }
        if (typeof parsed.autoStartBreaks === "boolean") {
          setAutoStartBreaks(parsed.autoStartBreaks);
        }
      }
    } catch {}
  }, []);

  // Save state on change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode, timeLeft, completedSessions, autoStartBreaks })
      );
    } catch {}
  }, [mode, timeLeft, completedSessions, autoStartBreaks]);

  // Keep references to current state so the timer interval can cleanly transition
  const stateRef = useRef({ mode, completedSessions, autoStartBreaks });
  stateRef.current = { mode, completedSessions, autoStartBreaks };

  // Timer interval countdown
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time is up! Handle mode transition
          const { mode: curMode, completedSessions: curSessions, autoStartBreaks: autoStart } = stateRef.current;
          playBeep();

          if (curMode === "pomodoro") {
            const nextSessions = curSessions + 1;
            setCompletedSessions(nextSessions);
            const isLong = nextSessions % 4 === 0;
            const nextMode: PomodoroMode = isLong ? "longBreak" : "shortBreak";
            const nextDuration = MODE_DURATIONS[nextMode];

            setMode(nextMode);
            setIsRunning(autoStart); // Auto-start the break if enabled

            if (isTauri()) {
              void invoke("notify_desktop", {
                title: "🍅 Pomodoro Tamamlandı!",
                body: isLong
                  ? "Tebrikler, 4 seansı tamamladın! 15 dakikalık uzun mola başladı."
                  : "Tebrikler, 25 dakikalık odak seansını bitirdin. 5 dakikalık mola başladı!",
                target: null,
              }).catch(() => {});
            }

            return nextDuration;
          } else {
            // Break is over -> return to focus mode and pause until user clicks start
            setMode("pomodoro");
            setIsRunning(false);

            if (isTauri()) {
              void invoke("notify_desktop", {
                title: "☕ Mola Bitti!",
                body: "Mola süresi doldu. Yeni bir odak seansına hazır olduğunda Başlat'a tıkla!",
                target: null,
              }).catch(() => {});
            }

            return MODE_DURATIONS.pomodoro;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  function switchMode(newMode: PomodoroMode) {
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(MODE_DURATIONS[newMode]);
  }

  function resetTimer() {
    setIsRunning(false);
    setTimeLeft(MODE_DURATIONS[mode]);
  }

  function toggleRunning() {
    setIsRunning(!isRunning);
  }

  function skipPhase() {
    setIsRunning(false);
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

  return (
    <section className="dashboard-pomodoro surface" aria-labelledby="pomodoro-heading">
      <div className="dashboard-section-top">
        <div className="pomodoro-title-wrap">
          <span className="overview-icon-small">
            <Icon name="spark" size={17} />
          </span>
          <div>
            <h2 id="pomodoro-heading">Pomodoro Odak Sayacı</h2>
            <small>
              {completedSessions > 0
                ? `Bugün ${completedSessions} odak seansı tamamlandı (${completedSessions * 25} dk odak)`
                : "25 dakika odaklan, 5 dakika mola ver"}
            </small>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="pomodoro-modes" role="tablist" aria-label="Pomodoro modları">
          {(["pomodoro", "shortBreak", "longBreak"] as PomodoroMode[]).map(m => (
            <button
              type="button"
              key={m}
              className={`pomodoro-mode-btn ${mode === m ? "is-active" : ""}`}
              onClick={() => switchMode(m)}
              role="tab"
              aria-selected={mode === m}
            >
              <span>{MODE_LABELS[m].icon}</span>
              <span>{MODE_LABELS[m].title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pomodoro-body">
        {/* Big Time Display */}
        <div className="pomodoro-timer-display">
          <span className="pomodoro-digits">{timeFormatted}</span>
          <span className={`pomodoro-mode-badge mode-${mode}`}>{MODE_LABELS[mode].title}</span>
        </div>

        {/* Action Controls */}
        <div className="pomodoro-controls">
          <button
            type="button"
            className={`button ${isRunning ? "button-secondary" : "button-primary"} pomodoro-action-btn`}
            onClick={toggleRunning}
            aria-label={isRunning ? "Sayacı duraklat" : "Sayacı başlat"}
          >
            {isRunning ? "Duraklat" : "Başlat"}
          </button>
          <button
            type="button"
            className="button button-secondary pomodoro-reset-btn"
            onClick={resetTimer}
            title="Sayacı sıfırla"
          >
            Sıfırla
          </button>
          <button
            type="button"
            className="button button-secondary pomodoro-skip-btn"
            onClick={skipPhase}
            title={mode === "pomodoro" ? "Molaya geç" : "Odağa geç"}
          >
            {mode === "pomodoro" ? "Molaya Geç" : "Odağa Dön"}
          </button>
        </div>

        {/* Sessions Counter & Auto-break Checkbox */}
        <div className="pomodoro-footer-options">
          <div className="pomodoro-sessions-track" title={`${completedSessions} seans tamamlandı (Her 4 seansta bir uzun mola)`}>
            <span className="pomodoro-session-label">Döngü:</span>
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={`pomodoro-dot ${i < (completedSessions % 4) ? "is-done" : ""}`}
                aria-hidden="true"
              >
                {i < (completedSessions % 4) ? "🍅" : "○"}
              </span>
            ))}
            <span className="pomodoro-total-badge">Toplam {completedSessions}</span>
          </div>

          <label className="pomodoro-autobreak-label" title="25 dakika bittiğinde 5 dakikalık molayı otomatik başlatır">
            <input
              type="checkbox"
              checked={autoStartBreaks}
              onChange={e => setAutoStartBreaks(e.target.checked)}
            />
            <span>Otomatik molaya geç</span>
          </label>
        </div>
      </div>

      {/* Progress Bar at Bottom of Card */}
      <div className="pomodoro-progress-bar" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className={`pomodoro-progress-fill mode-${mode}`} style={{ width: `${progressPercent}%` }} />
      </div>
    </section>
  );
}
