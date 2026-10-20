import { useEffect, useState, type FormEvent } from "react";
import {
  calculatePrayerTimes,
  formatRemainingTime,
  loadPrayerConfig,
  TRACKED_PRAYERS,
  createEmptyPrayerLog,
  calculatePrayerStats,
  type PrayerDayInfo,
  type PrayerTimesConfig,
  type PrayerLogDay,
  type TrackedPrayerName,
  type PrayerStatus,
} from "../../shared/prayerTimes";
import type { CloudRecord, Mutation } from "../../shared/phone";

const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + deltaDays);
  return dateKey(d);
}

function formatDayLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return "Bugün";
  if (dateStr === shiftDate(todayStr, -1)) return "Dün";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
}

export function MobilePrayerCard({
  records,
  onSave,
}: {
  records: CloudRecord[];
  onSave: (mutation: Mutation) => Promise<void>;
}) {
  const [config, setConfig] = useState<PrayerTimesConfig>(loadPrayerConfig);
  const [info, setInfo] = useState<PrayerDayInfo | null>(null);
  const todayStr = dateKey();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [noteDraft, setNoteDraft] = useState("");
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    function handleConfigChange() {
      setConfig(loadPrayerConfig());
    }
    window.addEventListener("ack-prayer-config-changed", handleConfigChange);
    return () => window.removeEventListener("ack-prayer-config-changed", handleConfigChange);
  }, []);

  useEffect(() => {
    function update() {
      const data = calculatePrayerTimes(config.latitude, config.longitude, new Date(), config.city);
      setInfo(data);
    }
    update();
    const timer = setInterval(update, 20000);
    return () => clearInterval(timer);
  }, [config]);

  const prayerLogs = records
    .filter(r => r.kind === "prayerLogs" && !r.deleted && r.data)
    .map(r => r.data as PrayerLogDay);

  const currentRow = records.find(r => r.kind === "prayerLogs" && r.id === selectedDate && !r.deleted);
  const currentLog: PrayerLogDay = (currentRow?.data as PrayerLogDay | undefined) ?? createEmptyPrayerLog(selectedDate);

  async function saveDayLog(nextLog: PrayerLogDay) {
    await onSave({
      mutationId: crypto.randomUUID(),
      kind: "prayerLogs",
      id: nextLog.id,
      baseVersion: currentRow?.version ?? 0,
      deleted: false,
      data: nextLog,
    });
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
    void saveDayLog({
      ...currentLog,
      prayers: nextPrayers,
      updatedAt: Date.now(),
    });
  }

  function handleAddNote(e: FormEvent) {
    e.preventDefault();
    const text = noteDraft.trim();
    if (!text || currentLog.notes.length >= 30) return;
    const nextNotes = [
      ...currentLog.notes,
      { id: crypto.randomUUID(), text: text.slice(0, 240), done: false },
    ];
    void saveDayLog({
      ...currentLog,
      notes: nextNotes,
      updatedAt: Date.now(),
    });
    setNoteDraft("");
  }

  function toggleNote(id: string) {
    const nextNotes = currentLog.notes.map(n => (n.id === id ? { ...n, done: !n.done } : n));
    void saveDayLog({
      ...currentLog,
      notes: nextNotes,
      updatedAt: Date.now(),
    });
  }

  function deleteNote(id: string) {
    const nextNotes = currentLog.notes.filter(n => n.id !== id);
    void saveDayLog({
      ...currentLog,
      notes: nextNotes,
      updatedAt: Date.now(),
    });
  }

  if (!info) return null;
  const kerahat = info.kerahat;
  const prayedCount = TRACKED_PRAYERS.filter(tp => currentLog.prayers[tp.name] === "prayed").length;
  const stats = calculatePrayerStats(prayerLogs, todayStr);

  return (
    <article className="mobile-prayer-card" aria-label="Namaz vakitleri ve takip">
      <div className="mobile-prayer-head">
        <div className="mobile-prayer-title">
          <span className="mobile-prayer-icon" aria-hidden="true">🕌</span>
          <div>
            <strong>Namaz Vakitleri</strong>
            <small>{info.city}</small>
          </div>
        </div>
        <div className="mobile-prayer-head-right">
          {kerahat.inKerahat ? (
            <span className="mobile-kerahat-chip warning">
              ⚠️ {kerahat.label} ({formatRemainingTime(kerahat.remainingMs ?? 0)})
            </span>
          ) : info.nextPrayer ? (
            <span className="mobile-prayer-chip">
              {info.nextPrayer.label}: <strong>{formatRemainingTime(info.timeToNextMs)}</strong>
            </span>
          ) : null}
          <button
            type="button"
            className="mobile-prayer-stats-btn"
            onClick={() => setShowStats(v => !v)}
          >
            {prayedCount}/5 {showStats ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {/* 6 Times Row */}
      <div className="mobile-prayer-row">
        {info.items.map(item => {
          const isNext = info.nextPrayer?.name === item.name;
          const isCurrent = info.currentPrayer?.name === item.name;
          return (
            <div
              key={item.name}
              className={`mobile-prayer-item ${isCurrent ? "is-current" : ""} ${isNext ? "is-next" : ""}`}
            >
              <small>{item.label}</small>
              <strong>{item.time}</strong>
            </div>
          );
        })}
      </div>

      {/* Daily Prayer Check-in & Spiritual Notes */}
      <div className="mobile-prayer-tracker">
        <div className="mobile-prayer-date-bar">
          <button
            type="button"
            className="mobile-date-arrow"
            onClick={() => setSelectedDate(d => shiftDate(d, -1))}
            aria-label="Önceki gün"
          >
            ‹
          </button>
          <div className="mobile-date-label">
            <strong>{formatDayLabel(selectedDate, todayStr)}</strong>
            {selectedDate !== todayStr && (
              <button
                type="button"
                className="mobile-date-today-btn"
                onClick={() => setSelectedDate(todayStr)}
              >
                Bugün
              </button>
            )}
          </div>
          <button
            type="button"
            className="mobile-date-arrow"
            disabled={selectedDate >= todayStr}
            onClick={() => setSelectedDate(d => shiftDate(d, 1))}
            aria-label="Sonraki gün"
          >
            ›
          </button>
        </div>

        <div className="mobile-prayer-check-grid" role="group" aria-label="Günlük namaz takibi">
          {TRACKED_PRAYERS.map(tp => {
            const status = currentLog.prayers[tp.name];
            return (
              <button
                key={tp.name}
                type="button"
                className={`mobile-check-pill ${status === "prayed" ? "is-prayed" : status === "missed" ? "is-missed" : ""}`}
                onClick={() => cyclePrayerStatus(tp.name)}
              >
                <span className="pill-mark">
                  {status === "prayed" ? "✓" : status === "missed" ? "✕" : "○"}
                </span>
                <span className="pill-name">{tp.label}</span>
                <small className="pill-status">
                  {status === "prayed" ? "Kıldım" : status === "missed" ? "Kılmadım" : "Seç"}
                </small>
              </button>
            );
          })}
        </div>

        {showStats && (
          <div className="mobile-prayer-stats-panel">
            <div className="mobile-stats-summary">
              <div>
                <strong>{stats.totalPrayed}</strong>
                <small>Kılınan</small>
              </div>
              <div>
                <strong>{stats.fullDays}</strong>
                <small>5/5 Tam Gün</small>
              </div>
              <div>
                <strong>{stats.totalMissed}</strong>
                <small>Kılınmayan</small>
              </div>
            </div>
            <div className="mobile-stats-week">
              {stats.last7Days.map(day => (
                <button
                  key={day.date}
                  type="button"
                  className={`mobile-week-chip ${selectedDate === day.date ? "is-selected" : ""} ${day.prayedCount === 5 ? "is-full" : ""}`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <small>{day.label}</small>
                  <strong>{day.prayedCount}/5</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Daily Spiritual / Prayer Notes */}
        <div className="mobile-prayer-notes">
          {currentLog.notes.length > 0 && (
            <div className="mobile-prayer-notes-list">
              {currentLog.notes.map(note => (
                <div key={note.id} className={`mobile-prayer-note-row ${note.done ? "is-done" : ""}`}>
                  <button
                    type="button"
                    className="mobile-prayer-note-toggle"
                    onClick={() => toggleNote(note.id)}
                  >
                    <span className="mobile-note-box">{note.done ? "✓" : ""}</span>
                    <span>{note.text}</span>
                  </button>
                  <button
                    type="button"
                    className="mobile-prayer-note-remove"
                    onClick={() => deleteNote(note.id)}
                    aria-label="Notu kaldır"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleAddNote} className="mobile-prayer-note-form">
            <input
              type="text"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="Namaz notu ekle (örn: Şükür namazı kıl)..."
              maxLength={240}
            />
            <button type="submit" disabled={!noteDraft.trim()}>
              +
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
