import { useEffect, useRef, useState, type FormEvent } from "react";
import { hapticSuccess, hapticLight } from "./haptics";
import {
  calculatePrayerTimes,
  formatRemainingTime,
  loadPrayerConfig,
  TRACKED_PRAYERS,
  createEmptyPrayerLog,
  type PrayerDayInfo,
  type PrayerTimesConfig,
  type PrayerLogDay,
  type TrackedPrayerName,
  type PrayerStatus,
} from "../../shared/prayerTimes";
import { PrayerGuideModal } from "../../src/components/PrayerGuideModal";
import { PrayerMonthModal } from "../../src/components/PrayerMonthModal";
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
  isCollapsed,
  onToggleCollapse,
}: {
  records: CloudRecord[];
  onSave: (mutation: Mutation) => Promise<void>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [config, setConfig] = useState<PrayerTimesConfig>(loadPrayerConfig);
  const [info, setInfo] = useState<PrayerDayInfo | null>(null);
  const todayStr = dateKey();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [noteDraft, setNoteDraft] = useState("");
  const [showCompletedNotes, setShowCompletedNotes] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [optimisticPrayers, setOptimisticPrayers] = useState<Record<string, PrayerStatus>>({});
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const optimisticRef = useRef<Record<string, PrayerStatus>>({});
  const opTokensRef = useRef<Record<string, number>>({});
  const lastWrittenByDateRef = useRef<Record<string, PrayerLogDay>>({});

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

  const basePrayerLogs = records
    .filter(r => r.kind === "prayerLogs" && !r.deleted && r.data)
    .map(r => r.data as PrayerLogDay);

  const effectiveLogsMap = new Map<string, PrayerLogDay>();
  for (const log of basePrayerLogs) {
    effectiveLogsMap.set(log.date, log);
  }
  for (const [key, status] of Object.entries(optimisticPrayers)) {
    const sep = key.lastIndexOf(":");
    if (sep <= 0) continue;
    const dateStr = key.slice(0, sep);
    const prayerName = key.slice(sep + 1) as TrackedPrayerName;
    const existing = effectiveLogsMap.get(dateStr) ?? createEmptyPrayerLog(dateStr);
    effectiveLogsMap.set(dateStr, {
      ...existing,
      prayers: {
        ...existing.prayers,
        [prayerName]: status,
      },
    });
  }
  const effectivePrayerLogs = Array.from(effectiveLogsMap.values());
  const currentLog: PrayerLogDay = effectiveLogsMap.get(selectedDate) ?? createEmptyPrayerLog(selectedDate);

  function resolveBaseLog(dateStr: string): PrayerLogDay {
    const targetRow = recordsRef.current.find(
      r => r.kind === "prayerLogs" && r.id === dateStr && !r.deleted,
    );
    const rowLog = targetRow?.data as PrayerLogDay | undefined;
    const cached = lastWrittenByDateRef.current[dateStr];
    if (cached && cached.updatedAt > (rowLog?.updatedAt ?? 0)) {
      return cached;
    }
    return rowLog ?? createEmptyPrayerLog(dateStr);
  }

  async function commitLogWithRetry(nextLog: PrayerLogDay): Promise<void> {
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const targetRow = recordsRef.current.find(
        r => r.kind === "prayerLogs" && r.id === nextLog.id && !r.deleted,
      );
      try {
        await onSave({
          mutationId: crypto.randomUUID(),
          kind: "prayerLogs",
          id: nextLog.id,
          baseVersion: targetRow?.version ?? 0,
          deleted: false,
          data: nextLog,
        });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Eşitleme sürüyor") && attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 250));
          continue;
        }
        throw err;
      }
    }
  }

  function saveDayLog(nextLog: PrayerLogDay) {
    const normalized: PrayerLogDay = {
      ...nextLog,
      updatedAt: Math.max(nextLog.updatedAt || Date.now(), (resolveBaseLog(nextLog.id).updatedAt ?? 0) + 1),
    };
    lastWrittenByDateRef.current[normalized.id] = normalized;
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      try {
        await commitLogWithRetry(normalized);
        await new Promise(resolve => setTimeout(resolve, 20));
      } catch (err) {
        console.warn("Namaz kaydı kaydedilemedi:", err);
      }
    });
    return writeQueueRef.current;
  }

  function togglePrayerForDate(dateStr: string, name: TrackedPrayerName) {
    const key = `${dateStr}:${name}`;
    const existingEffective = effectiveLogsMap.get(dateStr) ?? resolveBaseLog(dateStr);
    const current = optimisticRef.current[key] ?? existingEffective.prayers[name] ?? "missed";
    const nextStatus: PrayerStatus = current === "prayed" ? "missed" : "prayed";
    if (nextStatus === "prayed") {
      hapticSuccess();
    } else {
      hapticLight();
    }

    const opId = (opTokensRef.current[key] ?? 0) + 1;
    opTokensRef.current[key] = opId;
    optimisticRef.current = { ...optimisticRef.current, [key]: nextStatus };
    setOptimisticPrayers(prev => ({ ...prev, [key]: nextStatus }));

    writeQueueRef.current = writeQueueRef.current.then(async () => {
      const latestLog = resolveBaseLog(dateStr);
      const nextLog: PrayerLogDay = {
        ...latestLog,
        prayers: {
          ...latestLog.prayers,
          [name]: nextStatus,
        },
        updatedAt: Math.max(Date.now(), (latestLog.updatedAt ?? 0) + 1),
      };
      lastWrittenByDateRef.current[dateStr] = nextLog;
      try {
        await commitLogWithRetry(nextLog);
        await new Promise(resolve => setTimeout(resolve, 20));
      } catch (err) {
        console.warn("Namaz kaydı kaydedilemedi:", err);
      } finally {
        if (opTokensRef.current[key] === opId) {
          const nextOpt = { ...optimisticRef.current };
          delete nextOpt[key];
          optimisticRef.current = nextOpt;
          setOptimisticPrayers(prev => {
            if (!(key in prev)) return prev;
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        }
      }
    });
  }

  function cyclePrayerStatus(name: TrackedPrayerName) {
    togglePrayerForDate(selectedDate, name);
  }

  // Persistent notes across all logs: uncompleted notes carry forward
  const allNotesMap = new Map<string, { note: { id: string; text: string; done: boolean }; logId: string }>();
  for (const log of effectivePrayerLogs) {
    for (const note of log.notes) {
      if (!allNotesMap.has(note.id)) {
        allNotesMap.set(note.id, { note, logId: log.id });
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
    void saveDayLog({
      ...currentLog,
      notes: [...currentLog.notes, newNote],
      updatedAt: Date.now(),
    });
    setNoteDraft("");
  }

  function toggleNote(id: string) {
    for (const row of records.filter(r => r.kind === "prayerLogs" && !r.deleted)) {
      const log = row.data as PrayerLogDay;
      if (log.notes.some(n => n.id === id)) {
        void onSave({
          mutationId: crypto.randomUUID(),
          kind: "prayerLogs",
          id: log.id,
          baseVersion: row.version,
          deleted: false,
          data: {
            ...log,
            notes: log.notes.map(n => (n.id === id ? { ...n, done: !n.done } : n)),
            updatedAt: Date.now(),
          },
        });
        break;
      }
    }
  }

  function deleteNote(id: string) {
    for (const row of records.filter(r => r.kind === "prayerLogs" && !r.deleted)) {
      const log = row.data as PrayerLogDay;
      if (log.notes.some(n => n.id === id)) {
        void onSave({
          mutationId: crypto.randomUUID(),
          kind: "prayerLogs",
          id: log.id,
          baseVersion: row.version,
          deleted: false,
          data: {
            ...log,
            notes: log.notes.filter(n => n.id !== id),
            updatedAt: Date.now(),
          },
        });
        break;
      }
    }
  }

  if (!info) return null;
  const kerahat = info.kerahat;
  const prayedCount = TRACKED_PRAYERS.filter(tp => currentLog.prayers[tp.name] === "prayed").length;

  if (isCollapsed) {
    return (
      <div
        className="mobile-collapsed-card"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        title="Namaz kartını genişletmek için tıkla"
      >
        <div className="mobile-collapsed-left">
          <span className="mobile-collapsed-icon" aria-hidden="true">🕌</span>
          <span className="mobile-collapsed-title">Namaz:</span>
          <span className="mobile-collapsed-text">
            {info.nextPrayer
              ? `${info.nextPrayer.label} vaktine ${formatRemainingTime(info.timeToNextMs)} kaldı · ${prayedCount}/5 kılındı`
              : `${info.city} vakitleri · ${prayedCount}/5 kılındı`}
          </span>
        </div>
        <span className="mobile-collapsed-arrow" aria-hidden="true">⌄</span>
      </div>
    );
  }

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
        <div className="mobile-prayer-head-actions">
          <button
            type="button"
            className="mobile-prayer-guide-btn"
            onClick={() => setShowGuide(true)}
            title="Namaz Kılavuzu: Kamet, Ayet-el Kürsi, rekatlar ve zamm-ı sureler"
          >
            📖 Rehber
          </button>
          {onToggleCollapse && (
            <button
              type="button"
              className="mobile-card-collapse-btn"
              onClick={onToggleCollapse}
              title="Kartı daralt"
              aria-label="Namaz kartını daralt"
            >
              ⌃
            </button>
          )}
        </div>
      </div>

      {/* Full-width Status Banner (iPhone 11 optimized) */}
      {kerahat.inKerahat ? (
        <div className="mobile-prayer-status-banner warning" role="status">
          <span aria-hidden="true">⚠️</span>
          <span>{kerahat.label}</span>
          <strong>({formatRemainingTime(kerahat.remainingMs ?? 0)} kaldı)</strong>
        </div>
      ) : info.nextPrayer ? (
        <div className="mobile-prayer-status-banner" role="status">
          <span>{info.nextPrayer.label} vaktine</span>
          <strong>{formatRemainingTime(info.timeToNextMs)}</strong>
          <span>kaldı</span>
        </div>
      ) : null}

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
            <button
              type="button"
              className="mobile-date-modal-trigger"
              onClick={() => setShowMonthModal(true)}
              aria-label="Aylık namaz çetelesini aç"
              title="Aylık namaz çetelesini aç"
            >
              <strong>{formatDayLabel(selectedDate, todayStr)}</strong>
              <span className="mobile-date-cal-icon" aria-hidden="true">📅</span>
            </button>
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
            const status: PrayerStatus = currentLog.prayers[tp.name] ?? "missed";
            const isPrayed = status === "prayed";
            return (
              <button
                key={tp.name}
                type="button"
                className={`mobile-check-pill ${isPrayed ? "is-prayed" : "is-missed"}`}
                onClick={() => cyclePrayerStatus(tp.name)}
                aria-label={`${tp.label}: ${isPrayed ? "Kıldım" : "Kılmadım"}`}
              >
                <span className="pill-mark">
                  {isPrayed ? "✓" : "○"}
                </span>
                <span className="pill-name">{tp.label}</span>
                <small className="pill-status">
                  {isPrayed ? "Kıldım" : "Kılmadım"}
                </small>
              </button>
            );
          })}
        </div>

        {/* Daily Spiritual / Prayer Notes */}
        <div className="mobile-prayer-notes">
          <div className="mobile-notes-header-row">
            <span>İbadet Notları</span>
            <small>{activePrayerNotes.length} aktif</small>
          </div>
          {activePrayerNotes.length > 0 ? (
            <div className="mobile-prayer-notes-list">
              {activePrayerNotes.map(({ note }) => (
                <div key={note.id} className="mobile-prayer-note-row">
                  <button
                    type="button"
                    className="mobile-prayer-note-toggle"
                    onClick={() => toggleNote(note.id)}
                    title="Tamamla ve arşive kaldır"
                  >
                    <span className="mobile-note-box" />
                    <span>{note.text}</span>
                  </button>
                  <button
                    type="button"
                    className="mobile-prayer-note-remove"
                    onClick={() => deleteNote(note.id)}
                    aria-label="Notu sil"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mobile-notes-empty">Aktif ibadet notu yok.</p>
          )}

          {completedPrayerNotes.length > 0 && (
            <div className="mobile-completed-notes-toggle">
              <button
                type="button"
                className="text-action"
                onClick={() => setShowCompletedNotes(v => !v)}
              >
                {showCompletedNotes ? "Tamamlananları gizle" : `Tamamlanan notlar (${completedPrayerNotes.length})`}
              </button>
              {showCompletedNotes && (
                <div className="mobile-prayer-notes-list is-completed">
                  {completedPrayerNotes.map(({ note }) => (
                    <div key={note.id} className="mobile-prayer-note-row is-done">
                      <button
                        type="button"
                        className="mobile-prayer-note-toggle"
                        onClick={() => toggleNote(note.id)}
                        title="Geri al"
                      >
                        <span className="mobile-note-box">✓</span>
                        <span>{note.text}</span>
                      </button>
                      <button
                        type="button"
                        className="mobile-prayer-note-remove"
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

      {showGuide && <PrayerGuideModal onClose={() => setShowGuide(false)} />}
      {showMonthModal && (
        <PrayerMonthModal
          logs={effectivePrayerLogs}
          todayDate={todayStr}
          initialDate={selectedDate}
          onTogglePrayer={togglePrayerForDate}
          onJumpToDate={setSelectedDate}
          onClose={() => setShowMonthModal(false)}
        />
      )}
    </article>
  );
}
