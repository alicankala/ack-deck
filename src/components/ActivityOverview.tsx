import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import { ActivityRings } from "./ActivityRings";
import {
  loadActivityGoals,
  saveActivityGoals,
  loadPomodoroHistory,
  calculateDaySummary,
  getWeeklySummaries,
  getMonthlySummaries,
  calculateStreaks,
  localDateString,
  type ActivityGoals,
} from "../../shared/activityOverview";
import { loadPrayerLogs } from "../prayerStore";
import { phoneRequest } from "../phoneClient";
import { loadTasks } from "../taskStore";
import { TRACKED_PRAYERS } from "../../shared/prayerTimes";
import "./activityOverview.css";

export function ActivityOverview({ onBack }: { onBack?: () => void }) {
  const [goals, setGoals] = useState<ActivityGoals>(loadActivityGoals);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState<ActivityGoals>(goals);

  const [todayStr, setTodayStr] = useState(() => localDateString(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => localDateString(new Date()));

  // Active month for monthly heatmap
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  // Data states
  const [prayerLogs, setPrayerLogs] = useState(() => loadPrayerLogs().entries);
  const [pomodoroHistory, setPomodoroHistory] = useState(loadPomodoroHistory);
  const [tasks, setTasks] = useState(() => loadTasks().entries);

  // Sync data listener
  useEffect(() => {
    function refreshData() {
      setGoals(loadActivityGoals());
      setPrayerLogs(loadPrayerLogs().entries);
      setPomodoroHistory(loadPomodoroHistory());
      setTasks(loadTasks().entries);
      setTodayStr(localDateString(new Date()));
    }

    window.addEventListener("ack-data-changed", refreshData);
    window.addEventListener("ack-activity-goals-changed", refreshData);
    window.addEventListener("ack-pomodoro-history-changed", refreshData);

    return () => {
      window.removeEventListener("ack-data-changed", refreshData);
      window.removeEventListener("ack-activity-goals-changed", refreshData);
      window.removeEventListener("ack-pomodoro-history-changed", refreshData);
    };
  }, []);

  // Today summary
  const todaySummary = calculateDaySummary(todayStr, prayerLogs, pomodoroHistory, tasks, goals);
  // Selected day summary
  const selectedSummary = selectedDate === todayStr ? todaySummary : calculateDaySummary(selectedDate, prayerLogs, pomodoroHistory, tasks, goals);
  const isSelectedToday = selectedDate === todayStr;
  const activeSummary = selectedSummary;

  // Weekly summaries
  const weeklySummaries = getWeeklySummaries(todayStr, prayerLogs, pomodoroHistory, tasks, goals);

  // Monthly summaries
  const monthlySummaries = getMonthlySummaries(calendarMonth.year, calendarMonth.month, prayerLogs, pomodoroHistory, tasks, goals);

  // Calculate streaks across all monthly + weekly days
  const streaks = calculateStreaks(monthlySummaries);

  function handleSaveGoals(e: React.FormEvent) {
    e.preventDefault();
    if (saveActivityGoals(draftGoals)) {
      setGoals(draftGoals);
      setEditingGoals(false);
      try {
        void phoneRequest("activity-goals", { activityGoals: draftGoals }).catch(() => {});
      } catch {}
    }
  }

  function shiftMonth(delta: number) {
    setCalendarMonth(prev => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m > 12) {
        m = 1;
        y += 1;
      } else if (m < 1) {
        m = 12;
        y -= 1;
      }
      return { year: y, month: m };
    });
  }

  const monthNamesTr = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
  ];
  const monthTitle = `${monthNamesTr[calendarMonth.month - 1]} ${calendarMonth.year}`;

  // Calendar cells with empty leading days for proper weekday alignment (Monday = 1)
  const firstDayOfMonth = new Date(calendarMonth.year, calendarMonth.month - 1, 1);
  const leadingBlanks = (firstDayOfMonth.getDay() + 6) % 7; // 0 for Monday

  // Selected date prayer log & tasks
  const selectedPrayerLog = prayerLogs.find(l => l.date === selectedDate);
  const selectedDayTasks = tasks.filter(t => {
    if (!t.completed) return false;
    if (t.lastCompletedAt) {
      return localDateString(new Date(t.lastCompletedAt)) === selectedDate;
    }
    return t.dueDate === selectedDate;
  });

  return (
    <div className="activity-overview-page" role="region" aria-label="Genel Aktivite ve Alışkanlık Özeti">
      {/* Header */}
      <div className="overview-header">
        <div className="overview-header-title">
          {onBack && (
            <button
              type="button"
              className="overview-back-btn"
              onClick={onBack}
              title="Geri Dön"
              aria-label="Geri Dön"
            >
              <Icon name="back" size={17} />
              <span>Geri Dön</span>
            </button>
          )}
          <span className="overview-header-icon" aria-hidden="true">📊</span>
          <div>
            <h1>Genel Aktivite & Alışkanlık Özeti</h1>
            <p>Apple Fitness tarzı 3'lü aktivite halkaları, haftalık trendler ve disiplin karnesi</p>
          </div>
        </div>
        <div className="overview-header-actions">
          <button
            type="button"
            className="overview-goals-btn"
            onClick={() => {
              setDraftGoals(goals);
              setEditingGoals(true);
            }}
            title="Günlük hedefleri özelleştir"
          >
            <span>⚙️</span>
            <span>Hedefleri Düzenle</span>
          </button>
          {onBack && (
            <button
              type="button"
              className="overview-close-icon-btn"
              onClick={onBack}
              title="Kapat"
              aria-label="Kapat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Hero Card: Selected Day's 3 Rings & Metrics */}
      <div className="overview-hero-card">
        <div className="hero-rings-col">
          <ActivityRings rings={activeSummary.rings} size={150} />
          <div className="hero-badge-wrap">
            <span className="hero-rings-badge">
              {isSelectedToday
                ? (activeSummary.allGoalsMet ? "🎉 Bugün Tüm Hedefler Kapandı!" : "Bugün Devam Ediyor")
                : `📅 ${activeSummary.fullDateLabel} (%${activeSummary.overallScore})`}
            </span>
            {!isSelectedToday && (
              <button
                type="button"
                className="hero-today-return-btn"
                onClick={() => setSelectedDate(todayStr)}
                title="Bugünün özetine geri dön"
              >
                ↺ Bugüne Dön
              </button>
            )}
          </div>
        </div>

        <div className="hero-metrics-col">
          {/* Prayer Metric */}
          <div className="metric-bar-item">
            <div className="metric-item-top">
              <span className="metric-item-label" style={{ color: "#10b981" }}>
                <span className="metric-dot" style={{ background: "#10b981" }} />
                <span>🕌 Maneviyat (Namaz)</span>
              </span>
              <span className="metric-item-val" style={{ color: "#10b981" }}>
                <span>{activeSummary.rings.prayer.current}</span>
                <small>/ {activeSummary.rings.prayer.target} vakit (%{Math.round(activeSummary.rings.prayer.rawProgress * 100)})</small>
              </span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{
                  width: `${Math.min(100, Math.round(activeSummary.rings.prayer.rawProgress * 100))}%`,
                  background: "#10b981",
                }}
              />
            </div>
          </div>

          {/* Pomodoro Metric */}
          <div className="metric-bar-item">
            <div className="metric-item-top">
              <span className="metric-item-label" style={{ color: "#f97316" }}>
                <span className="metric-dot" style={{ background: "#f97316" }} />
                <span>⏱️ Odaklanma (Pomodoro)</span>
              </span>
              <span className="metric-item-val" style={{ color: "#f97316" }}>
                <span>{activeSummary.rings.pomodoro.current}</span>
                <small>/ {activeSummary.rings.pomodoro.target} seans ({activeSummary.rings.pomodoro.current * 25} dk)</small>
              </span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{
                  width: `${Math.min(100, Math.round(activeSummary.rings.pomodoro.rawProgress * 100))}%`,
                  background: "#f97316",
                }}
              />
            </div>
          </div>

          {/* Tasks Metric */}
          <div className="metric-bar-item">
            <div className="metric-item-top">
              <span className="metric-item-label" style={{ color: "#06b6d4" }}>
                <span className="metric-dot" style={{ background: "#06b6d4" }} />
                <span>✅ Üretkenlik (Görevler)</span>
              </span>
              <span className="metric-item-val" style={{ color: "#06b6d4" }}>
                <span>{activeSummary.rings.tasks.current}</span>
                <small>/ {activeSummary.rings.tasks.target} görev (%{Math.round(activeSummary.rings.tasks.rawProgress * 100)})</small>
              </span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{
                  width: `${Math.min(100, Math.round(activeSummary.rings.tasks.rawProgress * 100))}%`,
                  background: "#06b6d4",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Streaks & Highlights Row */}
      <div className="overview-streaks-row">
        <div className="streak-card">
          <span className="streak-icon" aria-hidden="true">🔥</span>
          <div className="streak-info">
            <strong>{streaks.currentStreak} Gün</strong>
            <small>Aktif Kesintisiz Seri</small>
          </div>
        </div>

        <div className="streak-card">
          <span className="streak-icon" aria-hidden="true">🏆</span>
          <div className="streak-info">
            <strong>{streaks.bestStreak} Gün</strong>
            <small>En Uzun Seri Rekoru</small>
          </div>
        </div>

        <div className="streak-card">
          <span className="streak-icon" aria-hidden="true">⭐</span>
          <div className="streak-info">
            <strong>{streaks.totalGoalsMetDays} Gün</strong>
            <small>Bu Ay Kusursuz Tamamlanan</small>
          </div>
        </div>
      </div>

      {/* Weekly View */}
      <div className="overview-section-box">
        <div className="section-box-header">
          <h2>Bu Haftanın Durumu (Pzt ➔ Paz)</h2>
          <small>Haftalık ortalama: %{Math.round(weeklySummaries.reduce((acc, d) => acc + d.overallScore, 0) / 7)}</small>
        </div>

        <div className="weekly-grid">
          {weeklySummaries.map(day => {
            const isSelected = selectedDate === day.date;
            return (
              <button
                key={day.date}
                type="button"
                className={`weekly-day-card ${isSelected ? "is-selected" : ""} ${day.allGoalsMet ? "is-full-goals" : ""}`}
                onClick={() => setSelectedDate(day.date)}
                title={`${day.fullDateLabel}: %${day.overallScore} tamamlandı`}
              >
                {day.allGoalsMet && <span className="weekly-star-badge" title="Tüm hedefler kapandı!">⭐</span>}
                <span className="weekly-card-name">{day.dayLabel}</span>
                <ActivityRings rings={day.rings} size={46} showCenterText={false} strokeWidth={4} />
                <span className="weekly-card-score">%{day.overallScore}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Monthly Calendar Heatmap */}
      <div className="overview-section-box">
        <div className="section-box-header">
          <h2>Aylık Disiplin Takvimi</h2>
          <div className="monthly-nav-controls">
            <button
              type="button"
              className="month-arrow-btn"
              onClick={() => shiftMonth(-1)}
              aria-label="Önceki ay"
            >
              ‹
            </button>
            <span className="month-title">{monthTitle}</span>
            <button
              type="button"
              className="month-arrow-btn"
              onClick={() => shiftMonth(1)}
              aria-label="Sonraki ay"
            >
              ›
            </button>
          </div>
        </div>

        <div className="calendar-weekdays-row" aria-hidden="true">
          <span>Pzt</span>
          <span>Sal</span>
          <span>Çar</span>
          <span>Per</span>
          <span>Cum</span>
          <span>Cmt</span>
          <span>Paz</span>
        </div>

        <div className="calendar-days-grid" role="grid" aria-label={`${monthTitle} aktivite takvimi`}>
          {/* Leading empty blanks */}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="calendar-cell is-empty" aria-hidden="true" />
          ))}

          {/* Actual days */}
          {monthlySummaries.map(day => {
            const isToday = day.date === todayStr;
            const isSelected = selectedDate === day.date;
            const dayNum = parseInt(day.date.split("-")[2], 10);

            return (
              <button
                key={day.date}
                type="button"
                className={`calendar-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                onClick={() => setSelectedDate(day.date)}
                title={`${day.fullDateLabel}: %${day.overallScore}`}
                aria-label={`${day.fullDateLabel}: Namaz ${day.rings.prayer.current}/${day.rings.prayer.target}, Pomodoro ${day.rings.pomodoro.current}, Görevler ${day.rings.tasks.current}`}
              >
                <span className="cell-day-num">{dayNum}</span>
                <div className="cell-mini-rings">
                  <ActivityRings rings={day.rings} size={30} showCenterText={false} strokeWidth={3} />
                </div>
                <div className="cell-score-indicator">
                  <span
                    className="cell-score-dot"
                    style={{
                      background: day.allGoalsMet
                        ? "#10b981"
                        : day.overallScore > 0
                        ? "#38bdf8"
                        : "rgba(255, 255, 255, 0.15)",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Day Details Panel */}
        <div className="day-detail-panel" role="region" aria-label="Seçilen gün detayları">
          <div className="day-detail-header">
            <strong>📅 {selectedSummary.fullDateLabel}</strong>
            <span>Genel Başarı: %{selectedSummary.overallScore}</span>
          </div>

          <div className="day-detail-items">
            {/* Prayer Detail */}
            <div className="day-detail-card">
              <h3 style={{ color: "#10b981" }}>🕌 Namaz ({selectedSummary.rings.prayer.current}/{selectedSummary.rings.prayer.target})</h3>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                {TRACKED_PRAYERS.map(tp => {
                  const done = selectedPrayerLog?.prayers[tp.name] === "prayed";
                  return (
                    <span
                      key={tp.name}
                      style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "6px",
                        background: done ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.04)",
                        color: done ? "#10b981" : "#94a3b8",
                        border: `1px solid ${done ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      }}
                    >
                      {tp.label} {done ? "✓" : "○"}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Pomodoro Detail */}
            <div className="day-detail-card">
              <h3 style={{ color: "#f97316" }}>⏱️ Odaklanma ({selectedSummary.rings.pomodoro.current}/{selectedSummary.rings.pomodoro.target})</h3>
              <p style={{ margin: "4px 0 0", color: "#cbd5e1" }}>
                {selectedSummary.rings.pomodoro.current > 0
                  ? `Toplam ${selectedSummary.rings.pomodoro.current} seans (${selectedSummary.rings.pomodoro.current * 25} dakika) odaklanıldı.`
                  : "Bu tarihte kayıtlı odaklanma seansı bulunmuyor."}
              </p>
            </div>

            {/* Tasks Detail */}
            <div className="day-detail-card">
              <h3 style={{ color: "#06b6d4" }}>✅ Görevler ({selectedSummary.rings.tasks.current}/{selectedSummary.rings.tasks.target})</h3>
              {selectedDayTasks.length > 0 ? (
                <ul style={{ margin: "4px 0 0", paddingLeft: "16px", color: "#cbd5e1" }}>
                  {selectedDayTasks.map(t => (
                    <li key={t.id}>{t.text}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: "4px 0 0", color: "#94a3b8" }}>
                  Bu tarihte tamamlanan görev bulunmuyor.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Goals Edit Modal */}
      {editingGoals && (
        <div className="goals-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="goals-modal-title">
          <div className="goals-modal-box">
            <div className="goals-modal-title">
              <h2 id="goals-modal-title">Günlük Hedefleri Düzenle</h2>
              <button
                type="button"
                className="goals-close-btn"
                onClick={() => setEditingGoals(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveGoals} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="goals-form-group">
                <label htmlFor="goal-prayer">
                  <span>🕌 Günlük Namaz Hedefi:</span>
                </label>
                <select
                  id="goal-prayer"
                  value={draftGoals.prayerTarget}
                  onChange={e => setDraftGoals({ ...draftGoals, prayerTarget: Number(e.target.value) })}
                  className="goals-form-input"
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} vakit</option>
                  ))}
                </select>
              </div>

              <div className="goals-form-group">
                <label htmlFor="goal-pomodoro">
                  <span>⏱️ Günlük Odaklanma (Pomodoro):</span>
                </label>
                <select
                  id="goal-pomodoro"
                  value={draftGoals.pomodoroTarget}
                  onChange={e => setDraftGoals({ ...draftGoals, pomodoroTarget: Number(e.target.value) })}
                  className="goals-form-input"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                    <option key={n} value={n}>{n} seans ({n * 25} dk)</option>
                  ))}
                </select>
              </div>

              <div className="goals-form-group">
                <label htmlFor="goal-tasks">
                  <span>✅ Günlük Görev Hedefi:</span>
                </label>
                <select
                  id="goal-tasks"
                  value={draftGoals.tasksTarget}
                  onChange={e => setDraftGoals({ ...draftGoals, tasksTarget: Number(e.target.value) })}
                  className="goals-form-input"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map(n => (
                    <option key={n} value={n}>{n} görev</option>
                  ))}
                </select>
              </div>

              <div className="goals-modal-actions">
                <button
                  type="button"
                  className="goals-cancel-btn"
                  onClick={() => setEditingGoals(false)}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="goals-save-btn"
                >
                  Hedefleri Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
