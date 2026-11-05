import { useEffect, useState } from "react";
import { ActivityRings } from "../../shared/ActivityRings";
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
  type MinimalTask,
} from "../../shared/activityOverview";
import type { CloudRecord, PhoneTask } from "../../shared/phone";
import type { PrayerLogDay } from "../../shared/prayerTimes";
import { TRACKED_PRAYERS } from "../../shared/prayerTimes";
import { Icon } from "./Icon";
import { api, json, type MobileState } from "./store";

type Props = {
  onBack: () => void;
  records: CloudRecord[];
  state?: MobileState;
};

export function MobileActivityOverview({ onBack, records, state }: Props) {
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

  const [pomodoroHistory, setPomodoroHistory] = useState(loadPomodoroHistory);

  useEffect(() => {
    function refreshData() {
      setGoals(loadActivityGoals());
      setPomodoroHistory(loadPomodoroHistory());
      setTodayStr(localDateString(new Date()));
    }

    window.addEventListener("ack-activity-goals-changed", refreshData);
    window.addEventListener("ack-pomodoro-history-changed", refreshData);

    return () => {
      window.removeEventListener("ack-activity-goals-changed", refreshData);
      window.removeEventListener("ack-pomodoro-history-changed", refreshData);
    };
  }, []);

  // Extract prayerLogs and tasks from records
  const prayerLogs: PrayerLogDay[] = records
    .filter(r => r.kind === "prayerLogs" && !r.deleted)
    .map(r => r.data as PrayerLogDay);

  const tasks: MinimalTask[] = records
    .filter(r => r.kind === "tasks" && !r.deleted)
    .map(r => {
      const task = r.data as PhoneTask;
      return {
        id: r.id,
        text: task.text,
        completed: task.completed,
        dueDate: task.dueDate,
        lastCompletedAt: task.lastCompletedAt,
      };
    });

  // Today summary
  const todaySummary = calculateDaySummary(todayStr, prayerLogs, pomodoroHistory, tasks, goals);
  // Selected day summary
  const selectedSummary =
    selectedDate === todayStr
      ? todaySummary
      : calculateDaySummary(selectedDate, prayerLogs, pomodoroHistory, tasks, goals);

  // Weekly summaries
  const weeklySummaries = getWeeklySummaries(todayStr, prayerLogs, pomodoroHistory, tasks, goals);

  // Monthly summaries
  const monthlySummaries = getMonthlySummaries(
    calendarMonth.year,
    calendarMonth.month,
    prayerLogs,
    pomodoroHistory,
    tasks,
    goals
  );

  // Streaks
  const streaks = calculateStreaks(monthlySummaries);

  function handleSaveGoals(e: React.FormEvent) {
    e.preventDefault();
    if (saveActivityGoals(draftGoals)) {
      setGoals(draftGoals);
      setEditingGoals(false);
      try {
        const stored = localStorage.getItem("ack-deck.phone-state.v1");
        if (stored) {
          const parsed = JSON.parse(stored);
          void api(parsed, "activity-goals", json({ activityGoals: draftGoals })).catch(() => {});
        }
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

  const firstDayOfMonth = new Date(calendarMonth.year, calendarMonth.month - 1, 1);
  const leadingBlanks = (firstDayOfMonth.getDay() + 6) % 7;

  // Selected date details
  const selectedPrayerLog = prayerLogs.find(l => l.date === selectedDate);
  const selectedDayTasks = tasks.filter(t => {
    if (!t.completed) return false;
    if (t.lastCompletedAt) {
      return localDateString(new Date(t.lastCompletedAt)) === selectedDate;
    }
    return t.dueDate === selectedDate;
  });

  return (
    <div className="mobile-activity-page" role="region" aria-label="Mobil Aktivite ve Alışkanlık Özeti">
      {/* Top Header */}
      <div className="mobile-act-head">
        <button type="button" className="mobile-act-back-btn" onClick={onBack} aria-label="Geri">
          <Icon name="back" size={20} />
          <span>Geri</span>
        </button>
        <div className="mobile-act-title">
          <h2>Genel Özet</h2>
          <small>Aktivite & Alışkanlık</small>
        </div>
        <button
          type="button"
          className="mobile-act-goals-btn"
          onClick={() => {
            setDraftGoals(goals);
            setEditingGoals(true);
          }}
          aria-label="Hedefleri Düzenle"
        >
          <span>Hedefler</span>
        </button>
      </div>

      {/* Hero: 3 Rings Card */}
      <div className="mobile-act-hero">
        <div className="mobile-act-hero-top">
          <ActivityRings rings={todaySummary.rings} size={130} />
          <div className="mobile-act-hero-info">
            <span className="mobile-act-badge">
              {todaySummary.allGoalsMet ? "🎉 Tüm Hedefler Kapandı!" : "Bugün Devam Ediyor"}
            </span>
            <div className="mobile-act-hero-score">
              <strong>%{todaySummary.overallScore}</strong>
              <small>Günlük Başarı</small>
            </div>
          </div>
        </div>

        {/* 3 Metric Bars */}
        <div className="mobile-act-metrics">
          {/* Prayer */}
          <div className="mobile-metric-row">
            <div className="mobile-metric-text">
              <span style={{ color: "#10b981", fontWeight: 700 }}>🕌 Namaz</span>
              <span style={{ color: "#10b981", fontWeight: 700 }}>
                {todaySummary.rings.prayer.current}/{todaySummary.rings.prayer.target} vakit
              </span>
            </div>
            <div className="mobile-metric-bar">
              <div
                className="mobile-metric-fill"
                style={{
                  width: `${Math.min(100, Math.round(todaySummary.rings.prayer.rawProgress * 100))}%`,
                  background: "#10b981",
                }}
              />
            </div>
          </div>

          {/* Pomodoro */}
          <div className="mobile-metric-row">
            <div className="mobile-metric-text">
              <span style={{ color: "#f97316", fontWeight: 700 }}>⏱️ Pomodoro</span>
              <span style={{ color: "#f97316", fontWeight: 700 }}>
                {todaySummary.rings.pomodoro.current}/{todaySummary.rings.pomodoro.target} seans ({todaySummary.rings.pomodoro.current * 25} dk)
              </span>
            </div>
            <div className="mobile-metric-bar">
              <div
                className="mobile-metric-fill"
                style={{
                  width: `${Math.min(100, Math.round(todaySummary.rings.pomodoro.rawProgress * 100))}%`,
                  background: "#f97316",
                }}
              />
            </div>
          </div>

          {/* Tasks */}
          <div className="mobile-metric-row">
            <div className="mobile-metric-text">
              <span style={{ color: "#06b6d4", fontWeight: 700 }}>✅ Görevler</span>
              <span style={{ color: "#06b6d4", fontWeight: 700 }}>
                {todaySummary.rings.tasks.current}/{todaySummary.rings.tasks.target} görev
              </span>
            </div>
            <div className="mobile-metric-bar">
              <div
                className="mobile-metric-fill"
                style={{
                  width: `${Math.min(100, Math.round(todaySummary.rings.tasks.rawProgress * 100))}%`,
                  background: "#06b6d4",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Streaks Banner */}
      <div className="mobile-act-streaks">
        <div className="mobile-streak-item">
          <span className="mobile-streak-icon" aria-hidden="true">🔥</span>
          <div>
            <strong>{streaks.currentStreak} Gün</strong>
            <small>Aktif Seri</small>
          </div>
        </div>
        <div className="mobile-streak-item">
          <span className="mobile-streak-icon" aria-hidden="true">🏆</span>
          <div>
            <strong>{streaks.bestStreak} Gün</strong>
            <small>En Uzun Seri</small>
          </div>
        </div>
        <div className="mobile-streak-item">
          <span className="mobile-streak-icon" aria-hidden="true">⭐</span>
          <div>
            <strong>{streaks.totalGoalsMetDays} Gün</strong>
            <small>Kusursuz Gün</small>
          </div>
        </div>
      </div>

      {/* Weekly Strip */}
      <div className="mobile-act-card">
        <div className="mobile-act-card-head">
          <h3>Bu Hafta</h3>
          <small>Pzt - Paz</small>
        </div>
        <div className="mobile-weekly-strip">
          {weeklySummaries.map(day => {
            const isSelected = selectedDate === day.date;
            return (
              <button
                key={day.date}
                type="button"
                className={`mobile-week-day ${isSelected ? "is-selected" : ""} ${day.allGoalsMet ? "is-full" : ""}`}
                onClick={() => setSelectedDate(day.date)}
              >
                {day.allGoalsMet && <span className="mobile-star-badge" aria-hidden="true">⭐</span>}
                <span className="mobile-day-label">{day.dayLabel}</span>
                <ActivityRings rings={day.rings} size={36} showCenterText={false} strokeWidth={3.5} />
                <span className="mobile-day-score">%{day.overallScore}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Monthly Heatmap Calendar */}
      <div className="mobile-act-card">
        <div className="mobile-act-card-head">
          <h3>Aylık Takvim</h3>
          <div className="mobile-cal-nav">
            <button type="button" className="mobile-cal-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Önceki ay">‹</button>
            <span className="mobile-cal-month">{monthTitle}</span>
            <button type="button" className="mobile-cal-nav-btn" onClick={() => shiftMonth(1)} aria-label="Sonraki ay">›</button>
          </div>
        </div>

        <div className="mobile-cal-weekdays" aria-hidden="true">
          <span>Pz</span>
          <span>Sa</span>
          <span>Ça</span>
          <span>Pe</span>
          <span>Cu</span>
          <span>Cm</span>
          <span>Pz</span>
        </div>

        <div className="mobile-cal-grid" role="grid">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`m-blank-${i}`} className="mobile-cal-cell is-empty" aria-hidden="true" />
          ))}

          {monthlySummaries.map(day => {
            const isToday = day.date === todayStr;
            const isSelected = selectedDate === day.date;
            const dayNum = parseInt(day.date.split("-")[2], 10);

            return (
              <button
                key={`m-day-${day.date}`}
                type="button"
                className={`mobile-cal-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                onClick={() => setSelectedDate(day.date)}
                aria-label={`${day.fullDateLabel}: %${day.overallScore}`}
              >
                <span className="mobile-cell-num">{dayNum}</span>
                <ActivityRings rings={day.rings} size={24} showCenterText={false} strokeWidth={2.8} />
                <span
                  className="mobile-cell-dot"
                  style={{
                    background: day.allGoalsMet
                      ? "#10b981"
                      : day.overallScore > 0
                      ? "#38bdf8"
                      : "rgba(255, 255, 255, 0.15)",
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* Selected Day Details */}
        <div className="mobile-day-detail">
          <div className="mobile-day-detail-head">
            <strong>📅 {selectedSummary.fullDateLabel}</strong>
            <span style={{ color: "#38bdf8", fontWeight: 700 }}>%{selectedSummary.overallScore}</span>
          </div>

          <div className="mobile-day-detail-rows">
            <div className="mobile-detail-row">
              <span style={{ color: "#10b981", fontWeight: 650 }}>🕌 Namaz:</span>
              <span>{selectedSummary.rings.prayer.current}/{selectedSummary.rings.prayer.target} vakit</span>
            </div>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", paddingLeft: "18px" }}>
              {TRACKED_PRAYERS.map(tp => {
                const done = selectedPrayerLog?.prayers[tp.name] === "prayed";
                return (
                  <span
                    key={tp.name}
                    style={{
                      fontSize: "10px",
                      padding: "1px 5px",
                      borderRadius: "5px",
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

            <div className="mobile-detail-row" style={{ marginTop: "4px" }}>
              <span style={{ color: "#f97316", fontWeight: 650 }}>⏱️ Pomodoro:</span>
              <span>
                {selectedSummary.rings.pomodoro.current > 0
                  ? `${selectedSummary.rings.pomodoro.current} seans (${selectedSummary.rings.pomodoro.current * 25} dk)`
                  : "0 seans"}
              </span>
            </div>

            <div className="mobile-detail-row" style={{ marginTop: "4px" }}>
              <span style={{ color: "#06b6d4", fontWeight: 650 }}>✅ Görevler:</span>
              <span>{selectedDayTasks.length} tamamlandı</span>
            </div>
            {selectedDayTasks.length > 0 && (
              <ul style={{ margin: "2px 0 0", paddingLeft: "24px", fontSize: "11px", color: "#cbd5e1" }}>
                {selectedDayTasks.map(t => (
                  <li key={t.id}>{t.text}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Goals Edit Modal */}
      {editingGoals && (
        <div className="mobile-goals-modal-overlay" role="dialog" aria-modal="true">
          <div className="mobile-goals-modal-sheet">
            <div className="mobile-sheet-head">
              <h3>Hedefleri Düzenle</h3>
              <button
                type="button"
                className="mobile-sheet-close"
                onClick={() => setEditingGoals(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveGoals} className="mobile-sheet-form">
              <label>
                <span>🕌 Günlük Namaz Hedefi:</span>
                <select
                  value={draftGoals.prayerTarget}
                  onChange={e => setDraftGoals({ ...draftGoals, prayerTarget: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} vakit</option>
                  ))}
                </select>
              </label>

              <label>
                <span>⏱️ Günlük Odaklanma (Pomodoro):</span>
                <select
                  value={draftGoals.pomodoroTarget}
                  onChange={e => setDraftGoals({ ...draftGoals, pomodoroTarget: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                    <option key={n} value={n}>{n} seans ({n * 25} dk)</option>
                  ))}
                </select>
              </label>

              <label>
                <span>✅ Günlük Görev Hedefi:</span>
                <select
                  value={draftGoals.tasksTarget}
                  onChange={e => setDraftGoals({ ...draftGoals, tasksTarget: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map(n => (
                    <option key={n} value={n}>{n} görev</option>
                  ))}
                </select>
              </label>

              <div className="mobile-sheet-actions">
                <button type="button" className="mobile-sheet-cancel" onClick={() => setEditingGoals(false)}>
                  İptal
                </button>
                <button type="submit" className="mobile-sheet-save">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
