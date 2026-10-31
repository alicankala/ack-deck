import { useEffect, useState, type FormEvent } from "react";
import { loadPrayerConfig, getTodayPrayerInfo, loadPrayerLogs, savePrayerLogs } from "../prayerStore";
import { localDateKey } from "../taskStore";
import {
  formatRemainingTime,
  TRACKED_PRAYERS,
  createEmptyPrayerLog,
  calculatePrayerStats,
  type PrayerDayInfo,
  type PrayerItem,
  type PrayerLogDay,
  type TrackedPrayerName,
  type PrayerStatus,
} from "../../shared/prayerTimes";
import { PrayerGuideModal } from "./PrayerGuideModal";
import "./prayerTimes.css";

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + deltaDays);
  return localDateKey(d);
}

function formatDayLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return "Bugün";
  if (dateStr === shiftDate(todayStr, -1)) return "Dün";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
}

export function PrayerWidget() {
  const [config, setConfig] = useState(loadPrayerConfig);
  const [info, setInfo] = useState<PrayerDayInfo>(() => getTodayPrayerInfo(config));
  const [logsState, setLogsState] = useState(loadPrayerLogs);
  const todayStr = localDateKey();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [noteDraft, setNoteDraft] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [showCompletedNotes, setShowCompletedNotes] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleConfig = () => {
      const latest = loadPrayerConfig();
      setConfig(latest);
      setInfo(getTodayPrayerInfo(latest));
    };
    const handleData = () => {
      setLogsState(loadPrayerLogs());
    };
    window.addEventListener("ack-prayer-config-changed", handleConfig);
    window.addEventListener("ack-data-changed", handleData);
    return () => {
      window.removeEventListener("ack-prayer-config-changed", handleConfig);
      window.removeEventListener("ack-data-changed", handleData);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setInfo(getTodayPrayerInfo(config));
      setTick(t => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [config]);

  const currentLog: PrayerLogDay =
    logsState.entries.find(l => l.date === selectedDate) ?? createEmptyPrayerLog(selectedDate);

  function saveDayLog(nextLog: PrayerLogDay) {
    const latest = loadPrayerLogs();
    if (latest.locked) return;
    const exists = latest.entries.some(l => l.date === nextLog.date);
    const updatedEntries = exists
      ? latest.entries.map(l => (l.date === nextLog.date ? nextLog : l))
      : [nextLog, ...latest.entries];
    if (savePrayerLogs(updatedEntries, latest)) {
      setLogsState(loadPrayerLogs());
    }
  }

  function cyclePrayerStatus(name: TrackedPrayerName) {
    const current = currentLog.prayers[name];
    const nextStatus: PrayerStatus | undefined =
      current === undefined ? "prayed" : current === "prayed" ? "missed" : undefined;
    const nextPrayers = { ...currentLog.prayers };
    if (nextStatus) {
      nextPrayers[name] = nextStatus;
    } else {
      delete nextPrayers[name];
    }
    saveDayLog({
      ...currentLog,
      prayers: nextPrayers,
      updatedAt: Date.now(),
    });
  }

  // Persistent notes across all logs: uncompleted notes carry forward forever
  const allNotesMap = new Map<string, { note: { id: string; text: string; done: boolean }; logDate: string }>();
  for (const log of logsState.entries) {
    for (const note of log.notes) {
      if (!allNotesMap.has(note.id)) {
        allNotesMap.set(note.id, { note, logDate: log.date });
      }
    }
  }
  const allNotesList = [...allNotesMap.values()];
  const activePrayerNotes = allNotesList.filter(item => !item.note.done);
  const completedPrayerNotes = allNotesList.filter(item => item.note.done);

  function handleAddNote(e: FormEvent) {
    e.preventDefault();
    const text = noteDraft.trim();
    if (!text || currentLog.notes.length >= 30) return;
    const newNote = { id: crypto.randomUUID(), text: text.slice(0, 240), done: false };
    saveDayLog({
      ...currentLog,
      notes: [...currentLog.notes, newNote],
      updatedAt: Date.now(),
    });
    setNoteDraft("");
  }

  function toggleNote(id: string) {
    const latest = loadPrayerLogs();
    if (latest.locked) return;
    let changed = false;
    const updatedEntries = latest.entries.map(l => {
      if (l.notes.some(n => n.id === id)) {
        changed = true;
        return {
          ...l,
          notes: l.notes.map(n => (n.id === id ? { ...n, done: !n.done } : n)),
          updatedAt: Date.now(),
        };
      }
      return l;
    });
    if (changed && savePrayerLogs(updatedEntries, latest)) {
      setLogsState(loadPrayerLogs());
    }
  }

  function deleteNote(id: string) {
    const latest = loadPrayerLogs();
    if (latest.locked) return;
    let changed = false;
    const updatedEntries = latest.entries.map(l => {
      if (l.notes.some(n => n.id === id)) {
        changed = true;
        return {
          ...l,
          notes: l.notes.filter(n => n.id !== id),
          updatedAt: Date.now(),
        };
      }
      return l;
    });
    if (changed && savePrayerLogs(updatedEntries, latest)) {
      setLogsState(loadPrayerLogs());
    }
  }

  const kerahat = info.kerahat;
  const prayedTodayCount = TRACKED_PRAYERS.filter(tp => currentLog.prayers[tp.name] === "prayed").length;
  const stats = calculatePrayerStats(logsState.entries, todayStr);

  return (
    <section id="prayer-widget" className="dashboard-prayer surface" aria-labelledby="dashboard-prayer-heading">
      <div className="dashboard-section-top">
        <div className="prayer-header-title">
          <span className="prayer-icon-badge" aria-hidden="true">🕌</span>
          <div>
            <h2 id="dashboard-prayer-heading">Namaz Vakitleri</h2>
            <small className="prayer-city-label">{info.city}</small>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            className="prayer-guide-btn"
            onClick={() => setShowGuide(true)}
            title="Namaz kılavuzu: Kamet, Ayet-el Kürsi, rekatlar ve zamm-ı sureler"
          >
            📖 Namaz Rehberi
          </button>
          <button
            type="button"
            className="prayer-stats-toggle"
            onClick={() => setShowStats(v => !v)}
            title="Namaz takip geçmişi ve istatistikler"
          >
            {prayedTodayCount}/5 Kılındı {showStats ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {/* Kerahat Alert Bar */}
      {kerahat.inKerahat ? (
        <div className="prayer-kerahat-badge warning" role="status">
          <span className="kerahat-indicator" aria-hidden="true">⚠️</span>
          <div className="kerahat-text">
            <strong>{kerahat.label}</strong>
            <small>{kerahat.description} ({formatRemainingTime(kerahat.remainingMs ?? 0)} kaldı)</small>
          </div>
        </div>
      ) : (
        <div className="prayer-countdown-bar">
          {info.nextPrayer && (
            <span>
              <strong>{info.nextPrayer.label}</strong> vaktine{" "}
              <span className="countdown-highlight">{formatRemainingTime(info.timeToNextMs)}</span> kaldı
            </span>
          )}
        </div>
      )}

      {/* 6 Times Matrix */}
      <div className="prayer-times-grid">
        {info.items.map((item: PrayerItem) => {
          const isNext = info.nextPrayer?.name === item.name;
          const isCurrent = info.currentPrayer?.name === item.name;
          return (
            <div
              key={item.name}
              className={`prayer-time-cell ${isCurrent ? "is-current" : ""} ${isNext ? "is-next" : ""}`}
            >
              <span className="prayer-cell-name">{item.label}</span>
              <strong className="prayer-cell-time">{item.time}</strong>
            </div>
          );
        })}
      </div>

      {/* Daily Prayer Check-in & Spiritual Notes */}
      <div className="prayer-tracker-section">
        <div className="prayer-date-nav">
          <button
            type="button"
            className="prayer-nav-arrow"
            onClick={() => setSelectedDate(d => shiftDate(d, -1))}
            aria-label="Önceki gün"
          >
            ‹
          </button>
          <div className="prayer-date-center">
            <strong>{formatDayLabel(selectedDate, todayStr)}</strong>
            {selectedDate !== todayStr && (
              <button type="button" className="prayer-today-jump" onClick={() => setSelectedDate(todayStr)}>
                Bugüne dön
              </button>
            )}
          </div>
          <button
            type="button"
            className="prayer-nav-arrow"
            disabled={selectedDate >= todayStr}
            onClick={() => setSelectedDate(d => shiftDate(d, 1))}
            aria-label="Sonraki gün"
          >
            ›
          </button>
        </div>

        <div className="prayer-check-grid" role="group" aria-label="Günlük namaz çetelesi">
          {TRACKED_PRAYERS.map(tp => {
            const status = currentLog.prayers[tp.name];
            return (
              <button
                key={tp.name}
                type="button"
                className={`prayer-check-btn ${status === "prayed" ? "is-prayed" : status === "missed" ? "is-missed" : ""}`}
                onClick={() => cyclePrayerStatus(tp.name)}
                title={`${tp.label}: ${status === "prayed" ? "Kılındı (Kaza/Kılınmadı yapmak için tıkla)" : status === "missed" ? "Kılınmadı (Sıfırlamak için tıkla)" : "İşaretlemek için tıkla"}`}
              >
                <span className="check-btn-icon">
                  {status === "prayed" ? "✓" : status === "missed" ? "✕" : "○"}
                </span>
                <span className="check-btn-label">{tp.label}</span>
                <small className="check-btn-state">
                  {status === "prayed" ? "Kılındı" : status === "missed" ? "Kılınmadı" : "Bekliyor"}
                </small>
              </button>
            );
          })}
        </div>

        {showStats && (
          <div className="prayer-stats-box">
            <div className="prayer-stats-totals">
              <div>
                <strong>{stats.totalPrayed}</strong>
                <small>Toplam Kılınan</small>
              </div>
              <div>
                <strong>{stats.fullDays}</strong>
                <small>5/5 Tam Gün</small>
              </div>
              <div>
                <strong>{stats.totalMissed}</strong>
                <small>Kılınmayan / Kaza</small>
              </div>
            </div>
            <div className="prayer-week-strip">
              {stats.last7Days.map(day => (
                <button
                  key={day.date}
                  type="button"
                  className={`week-strip-day ${selectedDate === day.date ? "is-selected" : ""} ${day.prayedCount === 5 ? "is-full" : ""}`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <small>{day.label}</small>
                  <strong>{day.prayedCount}/5</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Daily Spiritual / Prayer Notes (e.g., Şükür namazı kıl) */}
        <div className="prayer-notes-section">
          <div className="prayer-notes-header">
            <span>Namaz & İbadet Notları</span>
            <small>{activePrayerNotes.length} aktif</small>
          </div>
          {activePrayerNotes.length > 0 ? (
            <div className="prayer-notes-list">
              {activePrayerNotes.map(({ note }) => (
                <div key={note.id} className="prayer-note-item">
                  <button
                    type="button"
                    className="prayer-note-toggle"
                    onClick={() => toggleNote(note.id)}
                    title="Tamamla ve arşive kaldır"
                  >
                    <span className="note-check-box" />
                    <span className="note-text">{note.text}</span>
                  </button>
                  <button
                    type="button"
                    className="prayer-note-del"
                    onClick={() => deleteNote(note.id)}
                    aria-label="Notu sil"
                    title="Notu sil"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="prayer-notes-empty">Aktif ibadet notu yok.</p>
          )}

          {completedPrayerNotes.length > 0 && (
            <div className="prayer-completed-notes-block">
              <button
                type="button"
                className="dashboard-text-button"
                onClick={() => setShowCompletedNotes(v => !v)}
              >
                {showCompletedNotes ? "Tamamlananları gizle" : `Tamamlanan notlar (${completedPrayerNotes.length})`}
              </button>
              {showCompletedNotes && (
                <div className="prayer-notes-list completed-list">
                  {completedPrayerNotes.map(({ note }) => (
                    <div key={note.id} className="prayer-note-item is-done">
                      <button
                        type="button"
                        className="prayer-note-toggle"
                        onClick={() => toggleNote(note.id)}
                        title="Geri al (aktife taşı)"
                      >
                        <span className="note-check-box">✓</span>
                        <span className="note-text">{note.text}</span>
                      </button>
                      <button
                        type="button"
                        className="prayer-note-del"
                        onClick={() => deleteNote(note.id)}
                        aria-label="Tamamen sil"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <form onSubmit={handleAddNote} className="prayer-note-form">
            <input
              type="text"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="Örn: Şükür namazı kıl, Yasin oku..."
              maxLength={240}
            />
            <button type="submit" disabled={!noteDraft.trim()}>
              + Ekle
            </button>
          </form>
        </div>
      </div>

      {showGuide && <PrayerGuideModal onClose={() => setShowGuide(false)} />}
    </section>
  );
}
