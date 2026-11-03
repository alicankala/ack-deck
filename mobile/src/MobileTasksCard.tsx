import { useState } from "react";
import { ActionMenu } from "../../src/components/ActionMenu";
import {
  completedTaskSortTime,
  formatCompletedTime,
  isOccurrenceCompleted,
  recurrenceLabel,
  scheduleDate,
} from "../../shared/recurrence";
import type { CloudRecord, PhoneTask } from "../../shared/phone";
import type { StudyBlock } from "../../shared/studyPrograms";
import type { AttendanceEntry } from "../../shared/studyAttendance";
import { Icon } from "./Icon";

type TaskFilter = "all" | "today" | "upcoming" | "undated" | "completed";
const mobileTaskFilters: [TaskFilter, string][] = [
  ["all", "Aktif"],
  ["today", "Bugün"],
  ["upcoming", "Yaklaşan"],
  ["undated", "Tarihsiz"],
  ["completed", "Tamamlanan"],
];

interface MobileTasksCardProps {
  today: string;
  tasks: CloudRecord[];
  todayStudyBlocks: StudyBlock[];
  allWeekStudyBlocks: StudyBlock[];
  attendance: Record<string, AttendanceEntry>;
  busy: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNewTask: (defaultToday: boolean) => void;
  onOpenTask: (row: CloudRecord) => void;
  onToggleStudyBlock: (blockId: string) => void;
  onCompleteTask: (row: CloudRecord) => void;
  onSnoozeTask: (row: CloudRecord, minutes: number) => void;
  onDeleteTask: (row: CloudRecord) => void;
}

export function MobileTasksCard({
  today,
  tasks,
  todayStudyBlocks,
  allWeekStudyBlocks,
  attendance,
  busy,
  isCollapsed,
  onToggleCollapse,
  onNewTask,
  onOpenTask,
  onToggleStudyBlock,
  onCompleteTask,
  onSnoozeTask,
  onDeleteTask,
}: MobileTasksCardProps) {
  const [mobileTaskFilter, setMobileTaskFilter] = useState<TaskFilter>("all");

  const filteredCardTasks = tasks.filter(row => {
    const task = row.data as PhoneTask;
    const isDone = isOccurrenceCompleted(task);
    if (mobileTaskFilter === "completed") return isDone;
    if (isDone) return false;
    const taskDate = task.recurrence
      ? scheduleDate(task, new Date(today + "T12:00:00").getTime())
      : task.dueDate;
    if (mobileTaskFilter === "all") return true;
    if (mobileTaskFilter === "today") return !!taskDate && taskDate <= today;
    if (mobileTaskFilter === "upcoming") return !!taskDate && taskDate > today;
    if (mobileTaskFilter === "undated") return !taskDate;
    return true;
  });

  const sortedCardTasks = [...filteredCardTasks].sort((aRow, bRow) => {
    const a = aRow.data as PhoneTask;
    const b = bRow.data as PhoneTask;
    if (mobileTaskFilter === "completed") {
      return completedTaskSortTime(b) - completedTaskSortTime(a);
    }
    const aDate = (a.recurrence ? scheduleDate(a) : a.dueDate) || "9999-99-99";
    const bDate = (b.recurrence ? scheduleDate(b) : b.dueDate) || "9999-99-99";
    const dateDiff = aDate.localeCompare(bDate);
    if (dateDiff !== 0) return dateDiff;
    const aTime = a.dueTime || "99:99";
    const bTime = b.dueTime || "99:99";
    const timeDiff = aTime.localeCompare(bTime);
    if (timeDiff !== 0) return timeDiff;
    return a.text.localeCompare(b.text, "tr");
  });

  const shownCardLessons =
    mobileTaskFilter === "all" || mobileTaskFilter === "today"
      ? todayStudyBlocks
      : mobileTaskFilter === "upcoming"
      ? allWeekStudyBlocks.filter(b => b.date > today)
      : mobileTaskFilter === "completed"
      ? allWeekStudyBlocks
          .filter(b => Boolean(attendance[b.id]?.status))
          .sort((a, b) => (attendance[b.id]?.at ?? 0) - (attendance[a.id]?.at ?? 0))
      : [];

  const remainingTasksCount = tasks.filter(row => !isOccurrenceCompleted(row.data as PhoneTask)).length;
  const remainingLessonsCount = todayStudyBlocks.filter(b => !attendance[b.id]?.status).length;
  const totalRemainingCount = remainingTasksCount + remainingLessonsCount;
  const totalCompletedTasksCount = tasks.filter(row => isOccurrenceCompleted(row.data as PhoneTask)).length;
  const todayAttendedLessonsCount = todayStudyBlocks.filter(b => attendance[b.id]?.status === "attended").length;

  if (isCollapsed) {
    return (
      <div
        className="mobile-collapsed-card"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        title="Görevler kartını genişletmek için tıkla"
      >
        <div className="mobile-collapsed-left">
          <span className="mobile-collapsed-icon" aria-hidden="true">📋</span>
          <span className="mobile-collapsed-title">Görevler:</span>
          <span className="mobile-collapsed-text">
            {totalRemainingCount} yapılacak kaldı · {totalCompletedTasksCount} tamamlandı
          </span>
        </div>
        <span className="mobile-collapsed-arrow" aria-hidden="true">⌄</span>
      </div>
    );
  }

  return (
    <section className="mobile-tasks-card surface" aria-label="Görevler">
      <div className="mobile-tasks-header">
        <div className="mobile-tasks-title-group">
          <div className="mobile-tasks-icon-box">
            <Icon name="checkCircle" size={18} />
          </div>
          <div>
            <h3 className="mobile-tasks-title">Görevler</h3>
            <p className="mobile-tasks-subtitle">
              Yapılacaklarını ve derslerini tek yerden takip et.
            </p>
          </div>
        </div>
        <div className="mobile-tasks-actions">
          <span className="mobile-remaining-pill">{totalRemainingCount} KALDI</span>
          <button
            className="primary-action-round"
            type="button"
            onClick={() => onNewTask(mobileTaskFilter === "today")}
            title="Görev Ekle"
          >
            +
          </button>
          <button
            type="button"
            className="mobile-card-collapse-btn"
            onClick={onToggleCollapse}
            title="Kartı daralt"
            aria-label="Görevler kartını daralt"
          >
            ⌃
          </button>
        </div>
      </div>

      {/* Filter Tabs matching desktop [Aktif | Bugün | Yaklaşan | Tarihsiz | Tamamlanan] */}
      <div className="mobile-task-filters" role="group" aria-label="Görev filtresi">
        {mobileTaskFilters.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={`mobile-task-filter-btn ${mobileTaskFilter === key ? "is-active" : ""}`}
            aria-pressed={mobileTaskFilter === key}
            onClick={() => setMobileTaskFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Study Blocks & Tasks List */}
      <div className="mobile-tasks-list">
        {shownCardLessons.length === 0 && sortedCardTasks.length === 0 ? (
          <div className="mobile-tasks-empty">
            <p>{tasks.length === 0 ? "Henüz kayıtlı görev bulunmuyor." : "Bu filtrede görev veya ders bulunmuyor."}</p>
          </div>
        ) : (
          <>
            {shownCardLessons.map(block => {
              const att = attendance[block.id];
              const status = att?.status;
              return (
                <article
                  className={`mobile-task-item study-task-item ${status === "attended" ? "completed is-study-attended" : status === "skipped" ? "is-study-skipped" : ""}`}
                  key={block.id}
                >
                  <button
                    type="button"
                    className={`mobile-task-toggle study-status-toggle ${status === "attended" ? "is-attended" : status === "skipped" ? "is-skipped" : ""}`}
                    onClick={() => onToggleStudyBlock(block.id)}
                    aria-label={`${block.label}: ${status === undefined ? "Çalıştım olarak işaretle" : status === "attended" ? "Çalışmadım olarak işaretle" : "Durumu sıfırla"}`}
                    title="1 tık: Çalıştım · 2 tık: Çalışmadım · 3 tık: Sıfırla"
                  >
                    {status === "attended" ? (
                      <Icon name="check" size={12} />
                    ) : status === "skipped" ? (
                      <span className="study-toggle-x" aria-hidden="true">✕</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="mobile-task-content"
                    onClick={() => onToggleStudyBlock(block.id)}
                  >
                    <strong>{block.label}{block.topic ? ` · ${block.topic}` : ""}</strong>
                    <small>
                      📚 Ders · {block.date === today ? "Bugün" : block.date.split("-").reverse().join(".")} · {block.time} – {block.endTime}
                      {status === "attended" ? (
                        <span className="study-att-inline is-attended">
                          {" · ✓ Çalışıldı"}{formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                        </span>
                      ) : status === "skipped" ? (
                        <span className="study-att-inline is-skipped">
                          {" · ✗ Çalışılmadı"}{formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                        </span>
                      ) : (
                        <span className="study-att-hint"> · 1 tık ✓ · 2 tık ✕</span>
                      )}
                    </small>
                  </button>
                  <span className="timeline-badge study-badge" style={{ flexShrink: 0 }}>Ders</span>
                </article>
              );
            })}
            {sortedCardTasks.map(row => {
              const task = row.data as PhoneTask;
              const isTaskDone = isOccurrenceCompleted(task);
              const hasEarlyReminder = Boolean(task.reminder && task.reminderLeadMinutes && task.reminderLeadMinutes > 0);
              return (
                <article className={`mobile-task-item ${isTaskDone ? "completed" : ""}`} key={row.id}>
                  <button
                    type="button"
                    className="mobile-task-toggle"
                    disabled={busy}
                    onClick={() => onCompleteTask(row)}
                    aria-label={isTaskDone ? "Görevi yeniden aç" : "Tamamlandı olarak işaretle"}
                  >
                    {isTaskDone && <Icon name="check" size={12} />}
                  </button>
                  <button
                    type="button"
                    className="mobile-task-content"
                    onClick={() => onOpenTask(row)}
                  >
                    <strong>{task.text}</strong>
                    <small>
                      {isTaskDone && (
                        <span style={{ color: "var(--app-accent, #38bdf8)", fontWeight: 600 }}>
                          {formatCompletedTime(task.lastCompletedAt) ? `✓ ${formatCompletedTime(task.lastCompletedAt)} · ` : "✓ Tamamlandı · "}
                        </span>
                      )}
                      {task.recurrence
                        ? recurrenceLabel(task.recurrence)
                        : task.dueDate
                        ? (task.dueDate === today ? "Bugün" : task.dueDate.split("-").reverse().join("."))
                        : "Tarihsiz"}
                      {task.dueTime && " · " + task.dueTime}
                      {!isTaskDone && !task.recurrence && task.dueDate && task.dueDate < today && (
                        <span style={{ color: "#f87171", fontWeight: 600 }}> · Tarihi geçti</span>
                      )}
                      {task.recurrence && " · " + (scheduleDate(task)?.split("-").reverse().join(".") ?? "")}
                      {task.reminder && " · 🔔"}
                      {hasEarlyReminder && ` · ${task.reminderLeadMinutes} dk önce`}
                      {task.snoozedUntil && " · Ertelendi"}
                    </small>
                  </button>
                  {isTaskDone && (
                    <button
                      type="button"
                      className="mobile-task-reopen-btn"
                      disabled={busy}
                      onClick={() => onCompleteTask(row)}
                    >
                      Yeniden Aç
                    </button>
                  )}
                  <ActionMenu label={task.text + " işlemleri"}>
                    {isTaskDone ? (
                      <button disabled={busy} onClick={() => onCompleteTask(row)}>Yeniden Aç</button>
                    ) : (
                      <>
                        <button disabled={busy} onClick={() => onSnoozeTask(row, 15)}>15 dk ertele</button>
                        <button disabled={busy} onClick={() => onSnoozeTask(row, 60)}>1 saat ertele</button>
                      </>
                    )}
                    <button
                      disabled={busy}
                      className="danger-action"
                      onClick={() => onDeleteTask(row)}
                    >
                      Görevi sil
                    </button>
                  </ActionMenu>
                </article>
              );
            })}
          </>
        )}
      </div>

      {/* Bottom statistics matching desktop */}
      <div className="mobile-tasks-footer-stats">
        <span>
          • {tasks.length} görevden {totalCompletedTasksCount} tanesi tamamlandı
          {todayStudyBlocks.length > 0 && ` · Bugün ${todayAttendedLessonsCount}/${todayStudyBlocks.length} ders işlendi`}
        </span>
      </div>
    </section>
  );
}
