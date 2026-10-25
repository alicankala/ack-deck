import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { invoke, isTauri } from "@tauri-apps/api/core";

type Mode = "pomodoro" | "shortBreak" | "longBreak";

const MODE_DURATIONS: Record<Mode, number> = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const MODE_LABELS: Record<Mode, { title: string; icon: string }> = {
  pomodoro: { title: "Odak", icon: "🍅" },
  shortBreak: { title: "Kısa Mola", icon: "☕" },
  longBreak: { title: "Uzun Mola", icon: "🌴" },
};

const STORAGE_KEY = "ack-deck.pomodoro.v1";

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

export function PomodoroTimer() {
  const [mode, setMode] = useState<Mode>("pomodoro");
  const [timeLeft, setTimeLeft] = useState<number>(MODE_DURATIONS.pomodoro);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);

  // Load saved state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.mode && MODE_DURATIONS[parsed.mode as Mode]) {
          setMode(parsed.mode);
        }
        if (typeof parsed.completedSessions === "number") {
          setCompletedSessions(parsed.completedSessions);
        }
        if (typeof parsed.timeLeft === "number" && parsed.timeLeft > 0) {
          setTimeLeft(parsed.timeLeft);
        }
      }
    } catch {}
  }, []);

  // Save state
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode, timeLeft, completedSessions })
      );
    } catch {}
  }, [mode, timeLeft, completedSessions]);

  const targetMode = useRef(mode);
  targetMode.current = mode;

  // Timer interval
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsRunning(false);
          playBeep();

          const currentMode = targetMode.current;
          if (currentMode === "pomodoro") {
            setCompletedSessions(c => c + 1);
            if (isTauri()) {
              void invoke("notify_desktop", {
                title: "🍅 Pomodoro Tamamlandı!",
                body: "Tebrikler, 25 dakikalık odak seansını bitirdin. Şimdi mola zamanı!",
                target: null,
              }).catch(() => {});
            }
            return MODE_DURATIONS.shortBreak;
          } else {
            if (isTauri()) {
              void invoke("notify_desktop", {
                title: "☕ Mola Bitti!",
                body: "Mola süresi doldu. Yeni bir odak seansına hazır mısın?",
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

  function switchMode(newMode: Mode) {
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
          {(["pomodoro", "shortBreak", "longBreak"] as Mode[]).map(m => (
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
          <span className="pomodoro-mode-badge">{MODE_LABELS[mode].title}</span>
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
        </div>

        {/* Sessions Counter Dots */}
        <div className="pomodoro-sessions-track" title={`${completedSessions} seans tamamlandı`}>
          <span className="pomodoro-session-label">Seanslar:</span>
          {Array.from({ length: Math.max(4, (Math.floor(completedSessions / 4) + 1) * 4) }).map((_, i) => (
            <span
              key={i}
              className={`pomodoro-dot ${i < completedSessions ? "is-done" : ""}`}
              aria-hidden="true"
            >
              {i < completedSessions ? "🍅" : "○"}
            </span>
          ))}
        </div>
      </div>

      {/* Progress Bar at Bottom of Card */}
      <div className="pomodoro-progress-bar" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="pomodoro-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>
    </section>
  );
}
