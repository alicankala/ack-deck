import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import {
  MODE_LABELS,
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
import { localDateKey } from "../taskStore";

export type { PomodoroMode, PomodoroTarget };

function useTodayStudyTargets(): PomodoroTarget[] {
  const [studies, setStudies] = useState<PomodoroTarget[]>([]);

  useEffect(() => {
    function refresh() {
      const today = localDateKey();
      const programs = loadStudyPrograms().entries;
      const attendance = loadStudyAttendance();
      const blocks = studyBlocks(programs, new Date(), [today]);
      setStudies(
        blocks
          .filter(b => attendance[b.id]?.status !== "attended")
          .map(b => ({
            kind: "study",
            id: b.id,
            label: `${b.label}${b.topic ? ` · ${b.topic}` : ""}`,
            durationMinutes: b.minutes,
          }))
      );
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

  return studies;
}

export function PomodoroTimer() {
  const {
    mode,
    timeLeft,
    totalSeconds,
    isRunning,
    completedSessions,
    completedFocusMinutes,
    autoStartBreaks,
    target,
    targetRemainingSeconds,
    pendingConfirm,
    manualFreeFocus,
  } = usePomodoroStore();
  const studies = useTodayStudyTargets();

  useEffect(() => {
    if (
      !isRunning &&
      mode === "pomodoro" &&
      timeLeft === totalSeconds &&
      !target &&
      !pendingConfirm &&
      !manualFreeFocus &&
      studies.length > 0
    ) {
      setPomodoroTarget(studies[0]);
    }
  }, [isRunning, mode, timeLeft, totalSeconds, target, pendingConfirm, manualFreeFocus, studies]);

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
                ? `Hedef: ${target.label}${targetRemainingSeconds ? ` · Kalan ${Math.ceil(targetRemainingSeconds / 60)} dk` : ""}`
                : completedSessions > 0
                  ? `Bugün ${completedSessions} odak seansı tamamlandı (${completedFocusMinutes ?? completedSessions * 25} dk odak)`
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
              ✓ {pendingConfirm.kind === "study" ? "Çalıştım İşaretle" : "Tamamlandı İşaretle"}
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

        {/* Bugünün Ders Programı / Serbest Odak Hapları */}
        {(studies.length > 0 || target) && (
          <div className="pomodoro-target-pills" role="group" aria-label="Odak seçimi">
            <button
              type="button"
              className={`pomodoro-target-pill ${!target ? "is-active" : ""}`}
              onClick={() => setPomodoroTarget(undefined, true)}
              disabled={isRunning}
            >
              Serbest · 25 dk
            </button>
            {studies.map(s => (
              <button
                type="button"
                key={s.id}
                className={`pomodoro-target-pill ${target?.id === s.id ? "is-active" : ""}`}
                onClick={() => setPomodoroTarget(s)}
                disabled={isRunning}
              >
                {s.label}{s.durationMinutes ? ` · ${s.durationMinutes} dk` : ""}
              </button>
            ))}
            {target && !studies.some(s => s.id === target.id) && (
              <button
                type="button"
                className="pomodoro-target-pill is-active"
                disabled={isRunning}
              >
                {target.label}
              </button>
            )}
          </div>
        )}

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
