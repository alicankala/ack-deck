import { useEffect, useId, useMemo, useState } from "react";
import {
  TRACKED_PRAYERS,
  buildPrayerMonthSummary,
  shiftYearMonth,
  type PrayerLogDay,
  type TrackedPrayerName,
} from "../../shared/prayerTimes";

const WEEKDAY_HEADERS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const SHORT_PRAYER_LABELS: Record<TrackedPrayerName, string> = {
  fajr: "Sab",
  dhuhr: "Öğl",
  asr: "İkn",
  maghrib: "Akş",
  isha: "Yat",
};

type Props = {
  logs: PrayerLogDay[];
  todayDate: string;
  initialDate: string;
  onTogglePrayer: (dateStr: string, prayerName: TrackedPrayerName) => void;
  onJumpToDate?: (dateStr: string) => void;
  onClose: () => void;
};

export function PrayerMonthModal({
  logs,
  todayDate,
  initialDate,
  onTogglePrayer,
  onJumpToDate,
  onClose,
}: Props) {
  const todayMonth = todayDate.slice(0, 7);
  const clampedInitialDate = initialDate > todayDate ? todayDate : initialDate;
  const [viewMonth, setViewMonth] = useState<string>(() => clampedInitialDate.slice(0, 7));
  const [activeDate, setActiveDate] = useState<string>(() => clampedInitialDate);
  const [mobileTab, setMobileTab] = useState<"calendar" | "ledger">("calendar");
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "incomplete">("all");
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const summary = useMemo(
    () => buildPrayerMonthSummary(viewMonth, logs, todayDate),
    [viewMonth, logs, todayDate]
  );

  function changeMonth(delta: number) {
    const nextMonth = shiftYearMonth(viewMonth, delta);
    if (nextMonth > todayMonth) return;
    setViewMonth(nextMonth);
    setActiveDate(nextMonth === todayMonth ? todayDate : `${nextMonth}-01`);
  }

  function jumpToCurrentMonth() {
    setViewMonth(todayMonth);
    setActiveDate(todayDate);
  }

  const elapsedDaysDesc = useMemo(
    () => summary.days.filter(d => !d.isFuture).reverse(),
    [summary.days]
  );

  const selectedDayCell =
    summary.days.find(d => d.date === activeDate) ??
    summary.days.find(d => d.isToday) ??
    elapsedDaysDesc[0] ??
    summary.days[0];

  const visibleLedgerRows = useMemo(
    () =>
      ledgerFilter === "incomplete"
        ? elapsedDaysDesc.filter(d => d.prayedCount < TRACKED_PRAYERS.length)
        : elapsedDaysDesc,
    [elapsedDaysDesc, ledgerFilter]
  );

  const shortMonthName = useMemo(() => {
    const first = new Date(summary.year, summary.month - 1, 1, 12, 0, 0);
    return first.toLocaleDateString("tr-TR", { month: "short" });
  }, [summary.year, summary.month]);

  return (
    <div
      className="prayer-guide-overlay prayer-month-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="prayer-guide-modal prayer-month-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="prayer-guide-header">
          <div className="prayer-guide-title-box">
            <span className="prayer-guide-icon" aria-hidden="true">📅</span>
            <div>
              <h2 id={titleId} className="prayer-guide-title">
                Aylık Namaz Çetelesi
              </h2>
              <p className="prayer-guide-subtitle">
                Ay boyunca kılınan ve eksik kalan vakitleri incele veya tamamla
              </p>
            </div>
          </div>
          <button
            type="button"
            className="prayer-guide-close"
            onClick={onClose}
            aria-label="Kapat"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
              <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
            </svg>
          </button>
        </div>

        {/* Month Navigation + Summary Strip */}
        <div className="prayer-month-toolbar">
          <div className="prayer-month-switcher">
            <button
              type="button"
              className="prayer-month-nav-btn"
              onClick={() => changeMonth(-1)}
              aria-label="Önceki ay"
            >
              ‹
            </button>
            <strong className="prayer-month-label">{summary.monthLabel}</strong>
            <button
              type="button"
              className="prayer-month-nav-btn"
              onClick={() => changeMonth(1)}
              disabled={viewMonth >= todayMonth}
              aria-label="Sonraki ay"
            >
              ›
            </button>
            {viewMonth !== todayMonth && (
              <button
                type="button"
                className="prayer-month-today-pill"
                onClick={jumpToCurrentMonth}
              >
                Bu Ay
              </button>
            )}
          </div>

          <div className="prayer-month-stats" aria-label="Aylık özet">
            <span className="pm-stat-chip is-prayed">
              Kılınan <strong>{summary.totalPrayed}/{summary.totalExpected}</strong>
            </span>
            <span className="pm-stat-chip is-full">
              Tam Gün <strong>{summary.fullDaysCount}/{summary.elapsedDaysCount}</strong>
            </span>
            <span className={`pm-stat-chip ${summary.totalMissed > 0 ? "is-missed" : "is-clean"}`}>
              {summary.totalMissed > 0 ? (
                <>Eksik <strong>{summary.totalMissed}</strong></>
              ) : (
                <strong>Eksik yok ✓</strong>
              )}
            </span>
          </div>
        </div>

        {/* Mobile / Narrow Switcher Tabs (hidden on wide desktop) */}
        <div className="prayer-month-mobile-tabs" role="tablist" aria-label="Görünüm seçimi">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "calendar"}
            className={`prayer-tab-btn ${mobileTab === "calendar" ? "is-active" : ""}`}
            onClick={() => setMobileTab("calendar")}
          >
            📅 Takvim
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "ledger"}
            className={`prayer-tab-btn ${mobileTab === "ledger" ? "is-active" : ""}`}
            onClick={() => setMobileTab("ledger")}
          >
            📋 Çetele {summary.incompleteDaysCount > 0 ? `(${summary.incompleteDaysCount} eksik gün)` : ""}
          </button>
        </div>

        {/* Hybrid Split Body */}
        <div className={`prayer-month-body mobile-tab-${mobileTab}`}>
          {/* Left Panel: Calendar Grid + Selected Day Quick Editor */}
          <section className="prayer-month-calendar-panel" aria-label="Aylık takvim görünümü">
            <div className="pm-weekdays-row" aria-hidden="true">
              {WEEKDAY_HEADERS.map(day => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="pm-calendar-grid">
              {Array.from({ length: summary.leadingEmptyDays }).map((_, i) => (
                <div key={`empty-${i}`} className="pm-day-spacer" aria-hidden="true" />
              ))}

              {summary.days.map(day => {
                const isSelected = selectedDayCell?.date === day.date;
                const isFull = !day.isFuture && day.prayedCount === TRACKED_PRAYERS.length;
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={day.isFuture}
                    className={`pm-day-cell ${isSelected ? "is-selected" : ""} ${day.isToday ? "is-today" : ""} ${isFull ? "is-full" : ""} ${day.isFuture ? "is-future" : ""}`}
                    onClick={() => setActiveDate(day.date)}
                    aria-label={`${day.fullLabel}${day.isFuture ? " (gelecek gün)" : `: ${day.prayedCount}/5 kılındı`}`}
                    aria-pressed={isSelected}
                  >
                    <span className="pm-day-num">{day.dayOfMonth}</span>
                    <span className="pm-day-dots" aria-hidden="true">
                      {TRACKED_PRAYERS.map(tp => {
                        const prayed = !day.isFuture && day.prayers[tp.name] === "prayed";
                        return (
                          <span
                            key={tp.name}
                            className={`pm-dot ${day.isFuture ? "is-future" : prayed ? "is-prayed" : "is-missed"}`}
                          />
                        );
                      })}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Day Check-in Editor */}
            {selectedDayCell && !selectedDayCell.isFuture && (
              <div className="pm-day-editor">
                <div className="pm-day-editor-head">
                  <div>
                    <strong>{selectedDayCell.fullLabel}</strong>
                    <small>{selectedDayCell.prayedCount}/5 kılındı</small>
                  </div>
                  {onJumpToDate && (
                    <button
                      type="button"
                      className="pm-jump-card-btn"
                      onClick={() => {
                        onJumpToDate(selectedDayCell.date);
                        onClose();
                      }}
                    >
                      Ana kartta aç →
                    </button>
                  )}
                </div>

                <div className="pm-day-editor-grid" role="group" aria-label={`${selectedDayCell.fullLabel} namaz durumu`}>
                  {TRACKED_PRAYERS.map(tp => {
                    const isPrayed = selectedDayCell.prayers[tp.name] === "prayed";
                    return (
                      <button
                        key={tp.name}
                        type="button"
                        className={`pm-prayer-toggle-btn ${isPrayed ? "is-prayed" : "is-missed"}`}
                        onClick={() => onTogglePrayer(selectedDayCell.date, tp.name)}
                        aria-pressed={isPrayed}
                        aria-label={`${selectedDayCell.fullLabel} ${tp.label}: ${isPrayed ? "Kılındı" : "Kılınmadı"}`}
                      >
                        <span className="pm-toggle-mark">{isPrayed ? "✓" : "○"}</span>
                        <span className="pm-toggle-name">{tp.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Right Panel: Day-by-Day Çetele Table */}
          <section className="prayer-month-ledger-panel" aria-label="Günlük çetele tablosu">
            <div className="pm-ledger-head">
              <h3>Günlük Çetele</h3>
              <div className="pm-ledger-filters" role="group" aria-label="Gün filtresi">
                <button
                  type="button"
                  className={`pm-filter-btn ${ledgerFilter === "all" ? "is-active" : ""}`}
                  onClick={() => setLedgerFilter("all")}
                >
                  Tümü ({summary.elapsedDaysCount})
                </button>
                <button
                  type="button"
                  className={`pm-filter-btn ${ledgerFilter === "incomplete" ? "is-active" : ""}`}
                  onClick={() => setLedgerFilter("incomplete")}
                >
                  Eksikler ({summary.incompleteDaysCount})
                </button>
              </div>
            </div>

            {visibleLedgerRows.length === 0 ? (
              <div className="pm-ledger-empty">
                {ledgerFilter === "incomplete"
                  ? "Bu ayda eksik vakit görünmüyor."
                  : "Bu ay için gösterilecek gün henüz başlamadı."}
              </div>
            ) : (
              <div className="pm-ledger-list">
                {visibleLedgerRows.map(row => {
                  const isSelected = selectedDayCell?.date === row.date;
                  return (
                    <div
                      key={row.date}
                      className={`pm-ledger-row ${row.prayedCount === 5 ? "is-full" : ""} ${isSelected ? "is-focused" : ""}`}
                    >
                      <div className="pm-ledger-row-top">
                        <button
                          type="button"
                          className="pm-ledger-date-btn"
                          onClick={() => setActiveDate(row.date)}
                          title={row.fullLabel}
                        >
                          <strong>
                            {row.dayOfMonth} {shortMonthName}
                          </strong>
                          <span>{row.isToday ? "Bugün" : row.weekdayShort}</span>
                        </button>
                        <span className={`pm-ledger-score ${row.prayedCount === 5 ? "is-full" : row.prayedCount === 0 ? "is-zero" : ""}`}>
                          {row.prayedCount}/5
                        </span>
                      </div>

                      <div className="pm-ledger-pills" role="group" aria-label={`${row.dayOfMonth} ${shortMonthName} vakitleri`}>
                        {TRACKED_PRAYERS.map(tp => {
                          const isPrayed = row.prayers[tp.name] === "prayed";
                          return (
                            <button
                              key={tp.name}
                              type="button"
                              className={`pm-ledger-pill ${isPrayed ? "is-prayed" : "is-missed"}`}
                              onClick={() => onTogglePrayer(row.date, tp.name)}
                              aria-pressed={isPrayed}
                              aria-label={`${row.dayOfMonth} ${shortMonthName} ${tp.label}: ${isPrayed ? "Kılındı" : "Kılınmadı"}`}
                              title={`${row.fullLabel} · ${tp.label}: ${isPrayed ? "Kılındı" : "Kılınmadı"}`}
                            >
                              <span className="pm-pill-icon">{isPrayed ? "✓" : "○"}</span>
                              <span>{SHORT_PRAYER_LABELS[tp.name]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
