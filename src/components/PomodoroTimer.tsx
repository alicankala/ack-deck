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
    if (pendingConfirm) return;
    if (target) {
      const updated = studies.find(s => s.id === target.id);
      if (updated && (updated.durationMinutes !== target.durationMinutes || updated.label !== target.label)) {
        setPomodoroTarget(updated, false, true);
      }
      return;
    }
    if (!isRunning && mode === "pomodoro" && timeLeft === totalSeconds && !manualFreeFocus && studies.length > 0) {
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
  const elapsedInCurrentFocus = mode === "pomodoro" ? Math.max(0, totalSeconds - timeLeft) : 0;
  const hasTargetRemaining = Boolean(target && targetRemainingSeconds && targetRemainingSeconds > 0);
  const liveTargetRemainingSeconds = hasTargetRemaining
    ? Math.max(0, (targetRemainingSeconds ?? 0) - elapsedInCurrentFocus)
    : 0;
  const showLiveTargetSeconds = mode === "pomodoro" && (isRunning || timeLeft < totalSeconds);
  const targetRemainingLabel = hasTargetRemaining
    ? showLiveTargetSeconds
      ? ` · Kalan ${String(Math.floor(liveTargetRemainingSeconds / 60)).padStart(2, "0")}:${String(liveTargetRemainingSeconds % 60).padStart(2, "0")}`
      : ` · Kalan ${Math.ceil(liveTargetRemainingSeconds / 60)} dk`
    : "";

  const ringRadius = 72;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (progressPercent / 100);

  return (
    <section className="dashboard-pomodoro surface" aria-labelledby="pomodoro-heading">
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

      <div className="dashboard-section-top">
        <div className="pomodoro-title-wrap">
          <span className="overview-icon-small">
            <Icon name="spark" size={17} />
          </span>
          <div>
            <h2 id="pomodoro-heading">Pomodoro Odak Sayacı</h2>
            <small>
              {target
                ? `Hedef: ${target.label}${targetRemainingLabel}`
                : mode === "shortBreak"
                  ? "Kısa mola · 5 dakika dinlen"
                  : mode === "longBreak"
                    ? "Uzun mola · 15 dakika dinlen"
                    : "Hedef: Serbest Odak · 25 dk"}
            </small>
          </div>
        </div>

        {Boolean(studies.length > 0 || target) && (
          <div className="pomodoro-target-pills pomodoro-header-targets" role="group" aria-label="Odak seçimi">
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

      <div className="pomodoro-cockpit">
        {/* Left: Circular SVG Progress Ring (fixed slot prevents layout shift) */}
        <div className="pomodoro-ring-slot">
          <div
            className={`pomodoro-ring-wrap ${isRunning ? "is-running" : ""}`}
            role="progressbar"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Pomodoro ilerleme durumu"
          >
            <svg className="pomodoro-ring-svg" viewBox="0 0 160 160" aria-hidden="true">
              <circle className="pomodoro-ring-track" cx="80" cy="80" r={ringRadius} />
              <circle
                className={`pomodoro-ring-arc mode-${mode}`}
                cx="80"
                cy="80"
                r={ringRadius}
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringDashOffset}
              />
            </svg>
            <div className="pomodoro-ring-center">
              <span className="pomodoro-digits">{timeFormatted}</span>
              <span className={`pomodoro-mode-badge mode-${mode}`}>{MODE_LABELS[mode].title}</span>
            </div>
          </div>
        </div>

        {/* Center: Action Controls */}
        <div className="pomodoro-center-col">
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
        </div>

        {/* Right: Compact Cycle & Stats Card */}
        <div className="pomodoro-stats-box">
          <div className="pomodoro-stat-row" title={`${completedSessions} seans tamamlandı (Her 4 seansta bir uzun mola)`}>
            <span className="pomodoro-stat-key">Döngü</span>
            <div className="pomodoro-sessions-track">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={`pomodoro-dot ${i < (completedSessions % 4) ? "is-done" : ""}`}
                  aria-hidden="true"
                >
                  {i < (completedSessions % 4) ? "🍅" : "○"}
                </span>
              ))}
            </div>
          </div>

          <div className="pomodoro-stat-row">
            <span className="pomodoro-stat-key">Bugün</span>
            <span className="pomodoro-stat-val">
              {completedSessions} seans · {completedFocusMinutes ?? completedSessions * 25} dk
            </span>
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
    </section>
  );
}
