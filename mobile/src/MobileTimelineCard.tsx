import { useState } from "react";
import { recurrenceLabel, scheduleDate } from "../../shared/recurrence";
import type { CloudRecord, PhoneTask } from "../../shared/phone";
import type { StudyBlock } from "../../shared/studyPrograms";
import type { AttendanceEntry } from "../../shared/studyAttendance";
import { Icon } from "./Icon";

const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

interface MobileTimelineCardProps {
  today: string;
  todayStudyBlocks: StudyBlock[];
  allWeekStudyBlocks: StudyBlock[];
  todayTasks: CloudRecord[];
  unfinished: CloudRecord[];
  attendance: Record<string, AttendanceEntry>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenFullPlan: () => void;
  onOpenTaskForm: (row: CloudRecord) => void;
}

type MobileTimelineItem =
  | {
      kind: "study";
      id: string;
      time: string;
      endTime: string;
      label: string;
      topic?: string;
    }
  | {
      kind: "task";
      id: string;
      time: string | null;
      task: PhoneTask;
      row: CloudRecord;
      index: number;
    };

export function MobileTimelineCard({
  today,
  todayStudyBlocks,
  allWeekStudyBlocks,
  todayTasks,
  unfinished,
  attendance,
  isCollapsed,
  onToggleCollapse,
  onOpenFullPlan,
  onOpenTaskForm,
}: MobileTimelineCardProps) {
  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(today);

  const curMobileWeekDates = (() => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    const list: string[] = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      list.push(dateKey(cur));
    }
    return list;
  })();

  const mobileWeekDays = curMobileWeekDates.map(dStr => {
    const [y, m, d] = dStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = (dateObj.getDay() + 6) % 7;
    const studyCount = allWeekStudyBlocks.filter(b => b.date === dStr).length;
    const taskCount =
      dStr === today
        ? todayTasks.length
        : unfinished.filter(t => scheduleDate(t.data as PhoneTask) === dStr).length;
    return {
      date: dStr,
      shortLabel: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"][dayOfWeek],
      dayNum: dateObj.getDate(),
      studyCount,
      taskCount,
    };
  });

  const isSelectedMobileToday = selectedMobileDate === today;
  const displayedMobileStudyBlocks = allWeekStudyBlocks.filter(b => b.date === selectedMobileDate);
  const displayedMobileTasks = isSelectedMobileToday
    ? todayTasks
    : unfinished.filter(r => scheduleDate(r.data as PhoneTask) === selectedMobileDate);

  const mobileTimelineItems: MobileTimelineItem[] = [
    ...displayedMobileStudyBlocks.map(b => ({
      kind: "study" as const,
      id: b.id,
      time: b.time,
      endTime: b.endTime,
      label: b.label,
      topic: b.topic,
    })),
    ...displayedMobileTasks.map((row, index) => {
      const task = row.data as PhoneTask;
      return {
        kind: "task" as const,
        id: row.id,
        time: task.dueTime ?? null,
        task,
        row,
        index,
      };
    }),
  ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const selectedMobileDateLabel = (() => {
    try {
      const [y, m, d] = selectedMobileDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        weekday: "short",
      });
    } catch {
      return selectedMobileDate;
    }
  })();

  if (isCollapsed) {
    return (
      <div
        className="mobile-collapsed-card"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        title="Haftalık çizelgeyi genişletmek için tıkla"
      >
        <div className="mobile-collapsed-left">
          <span className="mobile-collapsed-icon" aria-hidden="true">📅</span>
          <span className="mobile-collapsed-title">Çizelge:</span>
          <span className="mobile-collapsed-text">
            {isSelectedMobileToday
              ? `Bugün ${todayStudyBlocks.length} ders, ${mobileTimelineItems.filter(i => i.kind === "task").length} görev`
              : `${selectedMobileDateLabel} oturumları`}
          </span>
        </div>
        <span className="mobile-collapsed-arrow" aria-hidden="true">⌄</span>
      </div>
    );
  }

  return (
    <section className="mobile-timeline-section unified-schedule-box" aria-label="Günün akışı ve haftalık çizelge">
      {/* Header inside the unified card */}
      <div className="timeline-card-header-v2">
        <div className="timeline-header-meta">
          <div className="timeline-header-icon-box">
            <Icon name="grid" size={20} />
          </div>
          <div>
            <h3 className="timeline-title-text">Haftalık Çizelge</h3>
          </div>
        </div>
        <div className="timeline-header-actions">
          {!isSelectedMobileToday && (
            <button
              type="button"
              className="mobile-back-today-pill"
              onClick={() => setSelectedMobileDate(today)}
            >
              Bugün
            </button>
          )}
          <button
            type="button"
            className="text-action"
            onClick={onOpenFullPlan}
            title="Tüm Haftalık Plan"
          >
            Tüm Plan ›
          </button>
          <button
            type="button"
            className="mobile-card-collapse-btn"
            onClick={onToggleCollapse}
            title="Kartı daralt"
            aria-label="Çizelge kartını daralt"
          >
            ⌃
          </button>
        </div>
      </div>

      {/* Horizontal Week Mini Strip directly inside the card */}
      <div className="mobile-week-strip-grid" style={{ marginBottom: "0.75rem" }}>
        {mobileWeekDays.map(day => (
          <button
            key={day.date}
            type="button"
            className={`mobile-week-cell ${day.date === selectedMobileDate ? "is-selected" : ""} ${day.date === today ? "is-today" : ""}`}
            onClick={() => setSelectedMobileDate(day.date)}
          >
            <span className="mobile-week-cell-day">{day.shortLabel}</span>
            <span className="mobile-week-cell-num">{day.dayNum}</span>
          </button>
        ))}
      </div>

      {/* Sub-header */}
      <div className="timeline-subhead-row">
        <span className="timeline-subhead-dot">•</span>
        <span>{isSelectedMobileToday ? "Bugünkü Oturumlar & İşler" : `${selectedMobileDateLabel} Oturumları & İşleri`}</span>
      </div>

      {/* Day's Chronological Feed */}
      <div className="mobile-timeline-list">
        {mobileTimelineItems.length === 0 ? (
          <div className="mobile-empty-card">
            <div className="empty-badge"><Icon name="checkCircle" size={32} /></div>
            <strong>{isSelectedMobileToday ? "Harika, bugün bekleyen ders veya görev yok!" : `${selectedMobileDateLabel} için ders veya görev yok.`}</strong>
          </div>
        ) : (
          mobileTimelineItems.map(item => {
            if (item.kind === "study") {
              return (
                <article className="mobile-timeline-card session-card" key={item.id}>
                  <span className="timeline-time-col">{item.time} – {item.endTime}</span>
                  <div className="timeline-content-col">
                    <strong className="timeline-item-title">{item.label}</strong>
                    {item.topic && <small className="timeline-item-sub">{item.topic}</small>}
                    {attendance[item.id]?.status && (
                      <div style={{ marginTop: "4px" }}>
                        {attendance[item.id]?.status === "attended" ? (
                          <span className="timeline-status-badge is-attended" style={{ fontSize: "0.75rem", color: "#34d399", fontWeight: 600 }}>
                            ✓ Çalışıldı
                          </span>
                        ) : attendance[item.id]?.status === "skipped" ? (
                          <span className="timeline-status-badge is-skipped" style={{ fontSize: "0.75rem", color: "#f87171", fontWeight: 600 }}>
                            ✗ Çalışılmadı
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="timeline-end-col">
                    <span className="timeline-badge study-badge">Ders</span>
                  </div>
                </article>
              );
            }

            const { task, row } = item;
            const hasEarlyReminder = Boolean(task.reminder && task.reminderLeadMinutes && task.reminderLeadMinutes > 0);
            const hasMeta = hasEarlyReminder || task.recurrence;
            return (
              <article
                className="mobile-timeline-card session-card task-session-row clickable"
                key={row.id}
                onClick={() => onOpenTaskForm(row)}
              >
                <span className="timeline-time-col">
                  {task.dueTime || "—"}
                  {task.reminder && <span className="timeline-alarm-bell" title="Alarm açık"> 🔔</span>}
                </span>
                <div className="timeline-content-col">
                  <strong className="timeline-item-title">{task.text}</strong>
                  {hasMeta && (
                    <div className="timeline-item-chips">
                      {hasEarlyReminder && (
                        <span className="timeline-chip alarm-chip" title="Erken Alarm">
                          🔔 {task.reminderLeadMinutes} dk önce
                        </span>
                      )}
                      {task.recurrence && (
                        <span className="timeline-chip recurrence-chip" title="Tekrarlama">
                          🔁 {recurrenceLabel(task.recurrence)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="timeline-end-col">
                  <span className="timeline-badge task-badge">Görev</span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
