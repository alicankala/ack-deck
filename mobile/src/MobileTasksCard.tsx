import { useState } from "react";
import { hapticSuccess, hapticLight } from "./haptics";
import { ActionMenu } from "../../src/components/ActionMenu";
import {
  formatCompletedTime,
  isOccurrenceCompleted,
  recurrenceLabel,
  scheduleDate,
} from "../../shared/recurrence";
import {
  SHARED_TASK_FILTERS,
  filterAndSortTaskItems,
  filterLessonsForTaskTab,
  type SharedTaskFilter,
} from "../../shared/taskFilters";
import type { CloudRecord, PhoneTask } from "../../shared/phone";
import type { StudyBlock } from "../../shared/studyPrograms";
import type { AttendanceEntry } from "../../shared/studyAttendance";
import { Icon } from "./Icon";

const mobileTaskFilters = SHARED_TASK_FILTERS;

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
  onDeleteTask,
}: MobileTasksCardProps) {
  const [mobileTaskFilter, setMobileTaskFilter] = useState<SharedTaskFilter>("all");

  const sortedCardTasks = filterAndSortTaskItems(
    tasks.map((row) => ({ ...(row.data as PhoneTask), __row: row })),
    mobileTaskFilter,
    today,
  ).map((item) => item.__row);

  const shownCardLessons = filterLessonsForTaskTab(
    mobileTaskFilter,
    todayStudyBlocks,
    allWeekStudyBlocks,
    attendance,
    today,
  );

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
          <h3 className="mobile-tasks-title">Görevler</h3>
        </div>
        <div className="mobile-tasks-actions">
          <button
            className="primary-action-round"
            type="button"
            onClick={() => onNewTask(false)}
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

      {/* Compact segmented filter + remaining badge row */}
      <div className="mobile-tasks-subbar">
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
        <span className="mobile-remaining-pill">{totalRemainingCount} KALDI</span>
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
                    onClick={() => { hapticLight(); onToggleStudyBlock(block.id); }}
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
                    onClick={() => { hapticLight(); onToggleStudyBlock(block.id); }}
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
                    onClick={() => { if (!isTaskDone) hapticSuccess(); else hapticLight(); onCompleteTask(row); }}
                    aria-label={isTaskDone ? "Görevi yeniden aç" : "Tamamlandı olarak işaretle"}
                  >
                    {isTaskDone && <Icon name="check" size={12} />}
                  </button>
                  <div className="mobile-task-content">
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
                  </div>
                  {isTaskDone && (
                    <button
                      type="button"
                      className="mobile-task-reopen-btn"
                      disabled={busy}
                      onClick={() => { if (!isTaskDone) hapticSuccess(); else hapticLight(); onCompleteTask(row); }}
                    >
                      Yeniden Aç
                    </button>
                  )}
                  <ActionMenu label={task.text + " işlemleri"}>
                    {isTaskDone && (
                      <button disabled={busy} onClick={() => { if (!isTaskDone) hapticSuccess(); else hapticLight(); onCompleteTask(row); }}>Yeniden Aç</button>
                    )}
                    <button disabled={busy} onClick={() => onOpenTask(row)}>
                      Düzenle
                    </button>
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
