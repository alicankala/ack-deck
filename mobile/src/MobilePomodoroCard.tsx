import { useEffect } from "react";
import {
  MODE_LABELS,
  dismissMobilePomodoroConfirm,
  extendMobilePomodoro,
  requestMobilePomodoroConfirmDone,
  resetMobilePomodoro,
  setMobilePomodoroAutoBreaks,
  setMobilePomodoroTarget,
  skipMobilePomodoroPhase,
  switchMobilePomodoroMode,
  toggleMobilePomodoroPause,
  useMobilePomodoroStore,
  type MobilePomodoroTarget,
  type PomodoroMode,
} from "./mobilePomodoroStore";
import type { StudyBlock } from "../../shared/studyPrograms";
import type { AttendanceEntry } from "../../shared/studyAttendance";

export type { PomodoroMode, MobilePomodoroTarget };

export function MobilePomodoroCard({
  isCollapsed,
  onToggleCollapse,
  todayStudyBlocks = [],
  attendance = {},
}: {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  todayStudyBlocks?: StudyBlock[];
  attendance?: Record<string, AttendanceEntry>;
} = {}) {
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
  } = useMobilePomodoroStore();

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const progressPercent =
    totalSeconds > 0 ? Math.min(100, Math.round(((totalSeconds - timeLeft) / totalSeconds) * 100)) : 0;

  const studyTargets: MobilePomodoroTarget[] = todayStudyBlocks
    .filter(b => attendance[b.id]?.status !== "attended")
    .map(b => ({
      kind: "study",
      id: b.id,
      label: `${b.label}${b.topic ? ` · ${b.topic}` : ""}`,
      durationMinutes: b.minutes,
    }));

  const studySignature = studyTargets.map(s => `${s.id}:${s.durationMinutes}:${s.label}`).join("|");
  useEffect(() => {
    if (!isRunning && mode === "pomodoro" && timeLeft === totalSeconds && !pendingConfirm) {
      if (!target && !manualFreeFocus && studyTargets.length > 0) {
        setMobilePomodoroTarget(studyTargets[0]);
      } else if (target) {
        const updated = studyTargets.find(s => s.id === target.id);
        if (updated && (updated.durationMinutes !== target.durationMinutes || updated.label !== target.label)) {
          setMobilePomodoroTarget(updated);
        }
      }
    }
  }, [isRunning, mode, timeLeft, totalSeconds, target, pendingConfirm, manualFreeFocus, studySignature]);

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
            {isRunning
              ? `${timeFormatted} · ${target ? target.label : MODE_LABELS[mode].title}`
              : completedSessions > 0
              ? `${completedSessions} seans tamamlandı`
              : "25 dk odak"}
          </span>
        </div>
        <span className="mobile-collapsed-arrow" aria-hidden="true">⌄</span>
      </div>
    );
  }

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

  return (
    <article className="mobile-pomodoro-card" aria-label="Pomodoro Odak Sayacı">
      <div className="mobile-pomodoro-header">
        <div className="mobile-pomodoro-title-group">
          <span className="mobile-pomodoro-icon" aria-hidden="true">🍅</span>
          <div>
            <h3>Pomodoro Odak Sayacı</h3>
            <span className="mobile-pomodoro-sub">
              {target
                ? `Hedef: ${target.label}${targetRemainingLabel}`
                : completedSessions > 0
                ? `Bugün ${completedSessions} seans tamamlandı (${completedFocusMinutes ?? completedSessions * 25} dk odak)`
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

      {/* Bugünün Ders Programı / Serbest Odak Hapları */}
      {(studyTargets.length > 0 || target) && (
        <div className="mobile-pomodoro-target-pills" role="group" aria-label="Odak seçimi">
          <button
            type="button"
            className={`mobile-pomodoro-target-pill ${!target ? "is-active" : ""}`}
            onClick={() => setMobilePomodoroTarget(undefined, true)}
            disabled={isRunning}
          >
            Serbest · 25 dk
          </button>
          {studyTargets.map(s => (
            <button
              type="button"
              key={s.id}
              className={`mobile-pomodoro-target-pill ${target?.id === s.id ? "is-active" : ""}`}
              onClick={() => setMobilePomodoroTarget(s)}
              disabled={isRunning}
            >
              {s.label}{s.durationMinutes ? ` · ${s.durationMinutes} dk` : ""}
            </button>
          ))}
          {target && !studyTargets.some(s => s.id === target.id) && (
            <button
              type="button"
              className="mobile-pomodoro-target-pill is-active"
              disabled={isRunning}
            >
              {target.label}
            </button>
          )}
        </div>
      )}

      {/* Süre Bitimi Onay Şeridi */}
      {pendingConfirm && (
        <div className="mobile-pomodoro-confirm-banner" role="status">
          <span>
            <strong>{pendingConfirm.label}</strong> süresi doldu.
          </span>
          <div className="mobile-pomodoro-confirm-actions">
            <button
              type="button"
              className="mobile-pomodoro-confirm-btn"
              onClick={requestMobilePomodoroConfirmDone}
            >
              {pendingConfirm.kind === "study" ? "✓ Çalıştım İşaretle" : "✓ Tamamlandı"}
            </button>
            <button
              type="button"
              className="mobile-pomodoro-extend-btn"
              onClick={() => extendMobilePomodoro(15)}
            >
              +15 dk
            </button>
            <button
              type="button"
              className="mobile-pomodoro-dismiss-btn"
              onClick={dismissMobilePomodoroConfirm}
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Mod Seçici */}
      <div className="mobile-pomodoro-modes" role="tablist" aria-label="Pomodoro modları">
        {(["pomodoro", "shortBreak", "longBreak"] as PomodoroMode[]).map(m => (
          <button
            type="button"
            key={m}
            className={`mobile-pomodoro-mode-btn ${mode === m ? "is-active" : ""}`}
            onClick={() => switchMobilePomodoroMode(m)}
            role="tab"
            aria-selected={mode === m}
          >
            <span>{MODE_LABELS[m].icon}</span>
            <span>{MODE_LABELS[m].title}</span>
          </button>
        ))}
      </div>

      {/* Sayaç Göstergesi */}
      <div className="mobile-pomodoro-display">
        <span className="mobile-pomodoro-digits">{timeFormatted}</span>
        <span className={`mobile-pomodoro-badge mode-${mode}`}>{MODE_LABELS[mode].title}</span>
      </div>

      {/* Ana Kontroller */}
      <div className="mobile-pomodoro-controls">
        <button
          type="button"
          className={`mobile-pomodoro-action-btn ${isRunning ? "is-running" : ""}`}
          onClick={toggleMobilePomodoroPause}
        >
          {isRunning ? "Duraklat" : "Başlat"}
        </button>
        <button
          type="button"
          className="mobile-pomodoro-sec-btn"
          onClick={resetMobilePomodoro}
          title="Sıfırla"
        >
          Sıfırla
        </button>
        <button
          type="button"
          className="mobile-pomodoro-sec-btn"
          onClick={skipMobilePomodoroPhase}
          title={mode === "pomodoro" ? "Molaya geç" : "Odağa geç"}
        >
          {mode === "pomodoro" ? "Molaya Geç" : "Odağa Dön"}
        </button>
      </div>

      {/* Döngü ve Oto Mola */}
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
            onChange={e => setMobilePomodoroAutoBreaks(e.target.checked)}
          />
          <span>Oto mola</span>
        </label>
      </div>

      <div
        className="mobile-pomodoro-progress-bar"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`mobile-pomodoro-progress-fill mode-${mode}`} style={{ width: `${progressPercent}%` }} />
      </div>
    </article>
  );
}
