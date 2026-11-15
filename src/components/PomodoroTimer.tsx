import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import {
  MODE_LABELS,
  clearPomodoroTargetAndReset,
  confirmPomodoroTargetDone,
  dismissPomodoroConfirm,
  extendPomodoro,
  resetPomodoro,
  setPomodoroAutoBreaks,
  setPomodoroTarget,
  switchPomodoroMode,
  togglePomodoroPause,
  usePomodoroStore,
  type PomodoroMode,
  type PomodoroTarget,
} from "../pomodoroStore";
import { loadStudyPrograms } from "../studyProgramStore";
import { loadStudyAttendance } from "../../shared/studyAttendance";
import { studyBlocks } from "../../shared/studyPrograms";
import { loadTasks, localDateKey } from "../taskStore";
import { isOccurrenceCompleted } from "../../shared/recurrence";

export type { PomodoroMode, PomodoroTarget };

function useAvailableTargets() {
  const [targets, setTargets] = useState<{ studies: PomodoroTarget[]; tasks: PomodoroTarget[] }>({
    studies: [],
    tasks: [],
  });

  useEffect(() => {
    function refresh() {
      const today = localDateKey();
      const programs = loadStudyPrograms().entries;
      const attendance = loadStudyAttendance();
      const blocks = studyBlocks(programs, new Date(), [today]);
      const studies: PomodoroTarget[] = blocks
        .filter(b => attendance[b.id]?.status !== "attended")
        .map(b => ({
          kind: "study",
          id: b.id,
          label: `${b.label}${b.topic ? ` · ${b.topic}` : ""}`,
          durationMinutes: b.minutes,
        }));

      const tasks: PomodoroTarget[] = loadTasks()
        .entries.filter(t => !isOccurrenceCompleted(t))
        .slice(0, 12)
        .map(t => ({
          kind: "task",
          id: t.id,
          label: t.text,
        }));

      setTargets({ studies, tasks });
    }

    refresh();
    window.addEventListener("ack-data-changed", refresh);
    window.addEventListener("ack-study-attendance-changed", refresh);
    window.addEventListener("ack-study-programs-changed", refresh);
    return () => {
      window.removeEventListener("ack-data-changed", refresh);
      window.removeEventListener("ack-study-attendance-changed", refresh);
      window.removeEventListener("ack-study-programs-changed", refresh);
    };
  }, []);

  return targets;
}

export function PomodoroTimer() {
  const {
    mode,
    timeLeft,
    totalSeconds,
    isRunning,
    completedSessions,
    autoStartBreaks,
    target,
    pendingConfirm,
  } = usePomodoroStore();
  const { studies, tasks } = useAvailableTargets();

  function skipPhase() {
    if (mode === "pomodoro") {
      const nextMode: PomodoroMode = (completedSessions + 1) % 4 === 0 ? "longBreak" : "shortBreak";
      switchPomodoroMode(nextMode);
    } else {
      switchPomodoroMode("pomodoro");
    }
  }

  const progressPercent = Math.min(100, Math.max(0, ((totalSeconds - timeLeft) / Math.max(1, totalSeconds)) * 100));
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const selectedValue = target ? `${target.kind}:${target.id}` : "";

  function handleTargetChange(val: string) {
    if (!val) {
      setPomodoroTarget(undefined);
      return;
    }
    const [kind, ...rest] = val.split(":");
    const id = rest.join(":");
    const match =
      kind === "study"
        ? studies.find(s => s.id === id)
        : tasks.find(t => t.id === id);
    if (match) {
      setPomodoroTarget(match);
    }
  }

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
              {target
                ? `Hedef: ${target.label}`
                : completedSessions > 0
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
              onClick={() => switchPomodoroMode(m)}
              role="tab"
              aria-selected={mode === m}
            >
              <span>{MODE_LABELS[m].icon}</span>
              <span>{MODE_LABELS[m].title}</span>
            </button>
          ))}
        </div>
      </div>

      {pendingConfirm && (
        <div className="pomodoro-confirm-banner" role="status">
          <span>
            <strong>{pendingConfirm.label}</strong> seansı bitti.
          </span>
          <div className="pomodoro-confirm-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={confirmPomodoroTargetDone}
            >
              ✓ {pendingConfirm.kind === "study" ? "Katıldım İşaretle" : "Tamamlandı İşaretle"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => extendPomodoro(15)}
            >
              +15 dk Uzat
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={dismissPomodoroConfirm}
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      <div className="pomodoro-body">
        {/* Big Time Display */}
        <div className="pomodoro-timer-display">
          <span className="pomodoro-digits">{timeFormatted}</span>
          <span className={`pomodoro-mode-badge mode-${mode}`}>{MODE_LABELS[mode].title}</span>
        </div>

        {/* Target Selector */}
        <div className="pomodoro-target-row">
          <select
            className="pomodoro-target-select"
            value={selectedValue}
            onChange={e => handleTargetChange(e.target.value)}
            aria-label="Odak hedefi seç"
            disabled={isRunning}
          >
            <option value="">Serbest Odak (25 dk)</option>
            {studies.length > 0 && (
              <optgroup label="Bugünkü Dersler">
                {studies.map(s => (
                  <option key={s.id} value={`study:${s.id}`}>
                    📚 {s.label}{s.durationMinutes ? ` (${s.durationMinutes} dk)` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {tasks.length > 0 && (
              <optgroup label="Açık Görevler">
                {tasks.map(t => (
                  <option key={t.id} value={`task:${t.id}`}>
                    ✓ {t.label.length > 52 ? `${t.label.slice(0, 52)}…` : t.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {target && !isRunning && (
            <button
              type="button"
              className="button button-secondary"
              onClick={clearPomodoroTargetAndReset}
              title="Hedefi temizle"
              style={{ padding: "0.35rem 0.65rem", fontSize: "0.78rem" }}
            >
              Temizle
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="pomodoro-controls">
          <button
            type="button"
            className={`button ${isRunning ? "button-secondary" : "button-primary"} pomodoro-action-btn`}
            onClick={togglePomodoroPause}
            aria-label={isRunning ? "Sayacı duraklat" : "Sayacı başlat"}
          >
            {isRunning ? "Duraklat" : "Başlat"}
          </button>
          <button
            type="button"
            className="button button-secondary pomodoro-reset-btn"
            onClick={resetPomodoro}
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
              onChange={e => setPomodoroAutoBreaks(e.target.checked)}
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
