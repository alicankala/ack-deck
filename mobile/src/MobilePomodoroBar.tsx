import {
  MODE_LABELS,
  clearMobilePomodoroTargetAndReset,
  dismissMobilePomodoroConfirm,
  extendMobilePomodoro,
  requestMobilePomodoroConfirmDone,
  toggleMobilePomodoroPause,
  useMobilePomodoroStore,
} from "./mobilePomodoroStore";

export function MobilePomodoroBar() {
  const {
    mode,
    timeLeft,
    totalSeconds,
    isRunning,
    target,
    pendingConfirm,
  } = useMobilePomodoroStore();

  const hasProgress = isRunning || timeLeft < totalSeconds;

  if (!hasProgress && !pendingConfirm) return null;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  if (pendingConfirm) {
    return (
      <div className="mobile-pomodoro-mini-bar is-confirm" role="status">
        <span className="mobile-pomodoro-mini-text">
          🍅 <strong>{pendingConfirm.label}</strong> bitti
        </span>
        <div className="mobile-pomodoro-mini-actions">
          <button
            type="button"
            className="mobile-pomodoro-mini-btn is-confirm"
            onClick={requestMobilePomodoroConfirmDone}
          >
            {pendingConfirm.kind === "study" ? "✓ Çalıştım" : "✓ Tamam"}
          </button>
          <button
            type="button"
            className="mobile-pomodoro-mini-btn"
            onClick={() => extendMobilePomodoro(15)}
          >
            +15 dk
          </button>
          <button
            type="button"
            className="mobile-pomodoro-mini-btn"
            onClick={dismissMobilePomodoroConfirm}
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-pomodoro-mini-bar" role="status" aria-label="Aktif Pomodoro">
      <div className="mobile-pomodoro-mini-info">
        <span aria-hidden="true">{MODE_LABELS[mode].icon}</span>
        <span className="mobile-pomodoro-mini-time">{formatted}</span>
        <span className="mobile-pomodoro-mini-label">
          · {target ? target.label : MODE_LABELS[mode].title}
        </span>
      </div>
      <div className="mobile-pomodoro-mini-actions">
        <button
          type="button"
          className="mobile-pomodoro-mini-btn"
          onClick={toggleMobilePomodoroPause}
          aria-label={isRunning ? "Duraklat" : "Devam et"}
        >
          {isRunning ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className="mobile-pomodoro-mini-btn"
          onClick={clearMobilePomodoroTargetAndReset}
          aria-label="Pomodoro'yu sıfırla"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
