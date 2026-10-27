import { useState, useEffect } from "react";
import { dateKey, monthDates } from "./weeklyPlan";
import { planAgenda, reminderText, type AgendaEvent } from "./planAgenda";
import type { PlanEvent } from "./weeklyPlan";
import { studyBlocks, studyConflicts, type StudyProgram } from "./studyPrograms";
import { StudyProgramsModal } from "./StudyProgramPanel";
import { ExamDialog } from "./ExamDialog";
import { loadStudyAttendance, setStudyBlockStatus } from "./studyAttendance";
import "./planner.css";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function isExam(text: string): boolean {
  return text.includes("🎓") || /\[(Vize|Final|Büt|Quiz|Sınav)\]/i.test(text);
}

export function PlanCalendar({
  anchor,
  onAnchor,
  events,
  programs,
  onEvent,
  onProgram,
  onNew,
  onSaveExam,
  mobile = false,
  onSaveProgram,
  onDeleteProgram,
  getReminder,
  onReminderChange,
  disabled = false,
}: {
  anchor: Date;
  onAnchor: (date: Date) => void;
  events: PlanEvent[];
  programs: StudyProgram[];
  onEvent: (event: AgendaEvent) => void;
  onProgram?: (id: string) => void;
  onNew: (day: string) => void;
  onSaveExam?: (exam: { type: string; course: string; date: string; time: string; room: string; notes: string; leadMinutes: number }) => Promise<void>;
  mobile?: boolean;
  onSaveProgram?: (program: StudyProgram) => Promise<void>;
  onDeleteProgram?: (id: string) => Promise<void>;
  getReminder?: (id: string) => number | null;
  onReminderChange?: (id: string, lead: number | null) => void;
  disabled?: boolean;
}) {
  const [showProgramsModal, setShowProgramsModal] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [attendance, setAttendance] = useState(() => loadStudyAttendance());
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const days = monthDates(anchor);
  const today = dateKey(new Date());
  const [selected, setSelected] = useState(today);
  const activeDay = days.includes(selected) ? selected : today;

  useEffect(() => {
    const handleAttChanged = () => setAttendance(loadStudyAttendance());
    window.addEventListener("ack-study-attendance-changed", handleAttChanged);
    window.addEventListener("ack-data-changed", handleAttChanged);
    return () => {
      window.removeEventListener("ack-study-attendance-changed", handleAttChanged);
      window.removeEventListener("ack-data-changed", handleAttChanged);
    };
  }, []);

  const currentMonthNum = anchor.getMonth();
  const currentYearNum = anchor.getFullYear();
  const currentMonthKey = `${currentYearNum}-${String(currentMonthNum + 1).padStart(2, "0")}`;

  const monthName = anchor.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const agenda = planAgenda(events);
  const blocks = studyBlocks(programs, anchor, days);
  const conflicts = new Set(studyConflicts(programs, anchor));

  const shiftMonth = (delta: number) => {
    onAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
  };

  const activeDayRows = [
    ...agenda.filter(e => e.date === activeDay).map(e => ({ time: e.time ?? "99:99", event: e, block: null })),
    ...blocks.filter(b => b.date === activeDay).map(b => ({ time: b.time, event: null, block: b }))
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <section className={`plan-calendar month-calendar-view ${mobile ? "mobile-calendar" : "desktop-calendar"}`} aria-label="Aylık takvim">
      <div className="calendar-toolbar">
        <div className="calendar-header-row">
          <div className="calendar-range">
            <strong>{monthName.charAt(0).toLocaleUpperCase("tr-TR") + monthName.slice(1)}</strong>
            <span>{blocks.length} ders bloğu · {agenda.filter(e => !e.reminder).length} kayıt</span>
          </div>
          <div className="calendar-nav-group">
            <button type="button" aria-label="Önceki ay" onClick={() => shiftMonth(-1)}>‹</button>
            <button type="button" className="calendar-this-month-btn" onClick={() => { const now = new Date(); onAnchor(now); setSelected(dateKey(now)); }}>Bu ay</button>
            <button type="button" aria-label="Sonraki ay" onClick={() => shiftMonth(1)}>›</button>
          </div>
        </div>

        <div className="calendar-subbar-row">
          <div className="calendar-legend" aria-label="Takvim renkleri">
            <span className="study">Ders / Çalışma</span>
            <span className="exam">🎓 Sınav</span>
            <span className="tasks">Görev</span>
            <span className="subscriptions">Ödeme</span>
          </div>
          <div className="calendar-action-buttons">
            {onSaveExam && (
              <button
                type="button"
                className="calendar-exam-btn"
                title="Sınav tarihi ekle (Vize, Final, Büt)"
                onClick={() => setShowExamModal(true)}
              >
                🎓 Sınav Ekle
              </button>
            )}
            {onSaveProgram && (
              <button
                type="button"
                className="calendar-programs-btn"
                title="Ders programlarını yönet"
                onClick={() => { setSelectedProgramId(null); setShowProgramsModal(true); }}
              >
                📚 Ders Programı {programs.length > 0 && <span className="calendar-programs-badge">{programs.length}</span>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Weekday headers row */}
      <div className="month-weekday-header">
        {WEEKDAYS.map(w => (
          <div key={w} className="month-weekday-cell">{w}</div>
        ))}
      </div>

      {/* Monthly Grid */}
      <div className="month-grid">
        {days.map(day => {
          const isCurrentMonth = day.startsWith(currentMonthKey);
          const isToday = day === today;
          const isSelected = day === activeDay;
          const dayNum = Number(day.slice(-2));
          const dayAgenda = agenda.filter(e => e.date === day);
          const dayBlocks = blocks.filter(b => b.date === day);
          const totalItems = dayAgenda.length + dayBlocks.length;

          return (
            <div
              key={day}
              className={`month-day-cell ${isCurrentMonth ? "in-month" : "other-month"} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
              onClick={() => setSelected(day)}
            >
              <div className="month-day-top">
                <span className="month-day-num">{dayNum}</span>
                {!mobile && (
                  <button
                    type="button"
                    className="month-day-add-btn"
                    title={`${day} için görev ekle`}
                    onClick={(e) => { e.stopPropagation(); onNew(day); }}
                  >
                    +
                  </button>
                )}
              </div>

              {/* Event previews inside the day cell */}
              <div className="month-day-events">
                {dayBlocks.slice(0, 2).map(b => (
                  <button
                    type="button"
                    key={b.id}
                    className="month-event-pill study"
                    title={`${b.time} ${b.label} (${b.programName})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSaveProgram) {
                        setSelectedProgramId(b.programId);
                        setShowProgramsModal(true);
                      } else {
                        onProgram?.(b.programId);
                      }
                    }}
                  >
                    <span className="event-pill-time">{b.time}</span>
                    <span className="event-pill-text">{b.label}</span>
                  </button>
                ))}
                {dayAgenda.slice(0, 2).map(ev => (
                  <button
                    type="button"
                    key={`${ev.source}:${ev.id}:${ev.occurrenceKey ?? day}`}
                    className={`month-event-pill ${isExam(ev.label) ? "exam" : ev.source}`}
                    title={ev.label}
                    onClick={(e) => { e.stopPropagation(); onEvent(ev); }}
                  >
                    <span className="event-pill-time">{ev.time || "•"}</span>
                    <span className="event-pill-text">{ev.label.replace(/ · Hatırlatma$/, "")}</span>
                  </button>
                ))}
                {totalItems > 4 && (
                  <span className="month-more-badge">+{totalItems - 4} daha</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Day Agenda Detail Box */}
      <div className="selected-day-agenda-box surface">
        <div className="agenda-box-header">
          <div>
            <h3>{new Date(activeDay + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}{activeDay === today ? " · Bugün" : ""}</h3>
            <small>{activeDayRows.length > 0 ? `${activeDayRows.length} planlı oturum ve iş` : "Bu gün için planlı kayıt yok."}</small>
          </div>
          <button
            type="button"
            className="planner-primary"
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
            onClick={() => onNew(activeDay)}
          >
            + Bu Güne Görev Ekle
          </button>
        </div>

        <div className="agenda-box-list">
          {activeDayRows.length === 0 ? (
            <p className="calendar-empty">Bu gün için herhangi bir ders veya görev bulunmuyor.</p>
          ) : (
            activeDayRows.map(({ event: e, block: b }) => b ? (
              <button
                type="button"
                className={`calendar-event study ${conflicts.has(b.id) ? "overlap" : ""}`}
                key={b.id}
                onClick={() => {
                  if (onSaveProgram) {
                    setSelectedProgramId(b.programId);
                    setShowProgramsModal(true);
                  } else {
                    onProgram?.(b.programId);
                  }
                }}
              >
                <div className="calendar-event-head">
                  <small className="calendar-event-time">{b.time} – {b.endTime}</small>
                  <small className="calendar-event-dur">{b.minutes} dk</small>
                </div>
                <strong>{b.label}</strong>
                {b.topic && <span>{b.topic}</span>}
                <small className="calendar-event-program">{b.programName}</small>
                {conflicts.has(b.id) && <small className="calendar-conflict">Saatler çakışıyor</small>}

                {/* Attendance Toggle: Çalıştım / Çalışmadım */}
                <div className="study-att-toolbar" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`study-att-btn ${attendance[b.id]?.status === "attended" ? "is-active-attended" : ""}`}
                    onClick={() => {
                      const next = setStudyBlockStatus(b.id, attendance[b.id]?.status === "attended" ? null : "attended");
                      setAttendance(next);
                    }}
                  >
                    {attendance[b.id]?.status === "attended" ? "✓ Çalıştım" : "Çalıştım"}
                  </button>
                  <button
                    type="button"
                    className={`study-att-btn ${attendance[b.id]?.status === "skipped" ? "is-active-skipped" : ""}`}
                    onClick={() => {
                      const next = setStudyBlockStatus(b.id, attendance[b.id]?.status === "skipped" ? null : "skipped");
                      setAttendance(next);
                    }}
                  >
                    {attendance[b.id]?.status === "skipped" ? "✗ Çalışmadım" : "Çalışmadım"}
                  </button>
                </div>
              </button>
            ) : e && (
              <button
                type="button"
                className={`calendar-event ${e.source} ${e.reminder ? "reminder" : ""} ${isExam(e.label) ? "is-exam-event" : ""}`}
                key={`${e.source}:${e.id}:${e.occurrenceKey ?? activeDay}:${e.reminder ? "reminder" : "event"}`}
                onClick={() => onEvent(e)}
              >
                <small className="calendar-event-time">
                  {e.time ?? "Gün içinde"} · {e.reminder ? "Hatırlatma" : e.source === "tasks" ? "Görev" : "Ödeme"}
                </small>
                <strong>{e.label.replace(/ · Hatırlatma$/, "")}</strong>
                {reminderText(e) && <small className="calendar-reminder">◷ {reminderText(e)}</small>}
              </button>
            ))
          )}
        </div>
      </div>

      {showProgramsModal && onSaveProgram && onDeleteProgram && (
        <StudyProgramsModal
          programs={programs}
          selectedId={selectedProgramId}
          disabled={disabled}
          getReminder={getReminder}
          onReminderChange={onReminderChange}
          onSave={onSaveProgram}
          onDelete={onDeleteProgram}
          onClose={() => { setShowProgramsModal(false); setSelectedProgramId(null); }}
        />
      )}

      {showExamModal && (
        <ExamDialog
          open={showExamModal}
          initialDate={activeDay}
          onClose={() => setShowExamModal(false)}
          onSave={async (exam) => {
            if (onSaveExam) await onSaveExam(exam);
            setShowExamModal(false);
          }}
        />
      )}
    </section>
  );
}
