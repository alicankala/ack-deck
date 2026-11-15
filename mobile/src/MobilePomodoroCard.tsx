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
import { isOccurrenceCompleted } from "../../shared/recurrence";
import type { CloudRecord, PhoneTask } from "../../shared/phone";
import type { StudyBlock } from "../../shared/studyPrograms";
import type { AttendanceEntry } from "../../shared/studyAttendance";

export type { PomodoroMode, MobilePomodoroTarget };

export function MobilePomodoroCard({
  isCollapsed,
  onToggleCollapse,
  todayStudyBlocks = [],
  tasks = [],
  attendance = {},
}: {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  todayStudyBlocks?: StudyBlock[];
  tasks?: CloudRecord[];
  attendance?: Record<string, AttendanceEntry>;
} = {}) {
  const {
    mode,
    timeLeft,
    totalSeconds,
    isRunning,
    completedSessions,
    autoStartBreaks,
    target,
    pendingConfirm,
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

  const taskTargets: MobilePomodoroTarget[] = tasks
    .filter(row => !isOccurrenceCompleted(row.data as PhoneTask))
    .slice(0, 12)
    .map(row => ({
      kind: "task",
      id: row.id,
      label: (row.data as PhoneTask).text,
    }));

  const selectedValue = target ? `${target.kind}:${target.id}` : "";

  function handleTargetChange(val: string) {
    if (!val) {
      setMobilePomodoroTarget(undefined);
      return;
    }
    const [kind, ...rest] = val.split(":");
    const id = rest.join(":");
    if (kind === "study") {
      const found = studyTargets.find(s => s.id === id);
      if (found) setMobilePomodoroTarget(found);
    } else if (kind === "task") {
      const found = taskTargets.find(t => t.id === id);
      if (found) setMobilePomodoroTarget(found);
    }
  }

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

  return (
    <article className="mobile-pomodoro-card" aria-label="Pomodoro Odak Sayacı">
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

      {/* Hedef Seçici */}
      <div className="mobile-pomodoro-target-row">
        <label className="mobile-pomodoro-target-label" htmlFor="mobile-pomodoro-target-select">
          Odak Hedefi
        </label>
        <select
          id="mobile-pomodoro-target-select"
          className="mobile-pomodoro-target-select"
          value={selectedValue}
          onChange={e => handleTargetChange(e.target.value)}
        >
          <option value="">Serbest Odak (25 dk)</option>
          {studyTargets.length > 0 && (
            <optgroup label="Bugünkü Dersler">
              {studyTargets.map(s => (
                <option key={s.id} value={`study:${s.id}`}>
                  📚 {s.label} ({s.durationMinutes ?? 25} dk)
                </option>
              ))}
            </optgroup>
          )}
          {taskTargets.length > 0 && (
            <optgroup label="Açık Görevler">
              {taskTargets.map(t => (
                <option key={t.id} value={`task:${t.id}`}>
                  ✓ {t.label}
                </option>
              ))}
            </optgroup>
          )}
          {target &&
            !studyTargets.some(s => s.id === target.id) &&
            !taskTargets.some(t => t.id === target.id) && (
              <option value={`${target.kind}:${target.id}`}>
                {target.kind === "study" ? "📚" : "✓"} {target.label}
              </option>
            )}
        </select>
      </div>

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
