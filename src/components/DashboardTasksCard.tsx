import { useState } from "react";
import { ActionMenu } from "./ActionMenu";
import { Icon } from "./Icon";
import { TaskEditorDialog } from "./TaskEditorDialog";
import {
  formatCompletedTime,
  isOccurrenceCompleted,
  recurrenceLabel,
  scheduleDate,
} from "../../shared/recurrence";
import type { StudyBlock } from "../../shared/studyPrograms";
import type { AttendanceEntry } from "../../shared/studyAttendance";
import {
  TASK_FILTERS,
  deleteTaskRecord,
  filterAndSortTasks,
  filterLessonsForTaskTab,
  snoozeTaskRecord,
  toggleTaskRecordCompletion,
} from "../taskActions";
import type { Task, TaskFilter, TaskLoad } from "../taskStore";

interface DashboardTasksCardProps {
  todayDateStr: string;
  tasksLoad: TaskLoad;
  todayStudyBlocks: StudyBlock[];
  allBlocks: StudyBlock[];
  attendance: Record<string, AttendanceEntry>;
  onToggleStudyBlock: (blockId: string) => void;
  onError: (message: string) => void;
}

/** Mobile-style interactive Görevler card for the desktop home dashboard. */
export function DashboardTasksCard({
  todayDateStr,
  tasksLoad,
  todayStudyBlocks,
  allBlocks,
  attendance,
  onToggleStudyBlock,
  onError,
}: DashboardTasksCardProps) {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [editor, setEditor] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const tasks = tasksLoad.entries;
  const sortedTasks = filterAndSortTasks(tasks, taskFilter, todayDateStr);
  const shownLessons = filterLessonsForTaskTab(taskFilter, todayStudyBlocks, allBlocks, attendance, todayDateStr);

  const remainingTasksCount = tasks.filter(t => !isOccurrenceCompleted(t)).length;
  const remainingLessonsCount = todayStudyBlocks.filter(b => !attendance[b.id]?.status).length;
  const totalRemainingCount = remainingTasksCount + remainingLessonsCount;
  const totalCompletedTasksCount = tasks.length - remainingTasksCount;
  const todayAttendedLessonsCount = todayStudyBlocks.filter(b => attendance[b.id]?.status === "attended").length;

  function handleToggleTask(taskId: string) {
    if (tasksLoad.locked) return;
    const res = toggleTaskRecordCompletion(taskId);
    if (res.ok) onError("");
    else onError(res.error);
  }

  function handleSnooze(task: Task, minutes: number) {
    if (tasksLoad.locked) return;
    const res = snoozeTaskRecord(task, minutes);
    if (res.ok) onError("");
    else onError(res.error);
  }

  function handleDelete(task: Task) {
    if (tasksLoad.locked) return;
    const res = deleteTaskRecord(task);
    if (res.ok) {
      onError("");
      setDeleteId(null);
    } else {
      onError(res.error);
    }
  }

  return (
    <section className="dashboard-tasks-card surface" aria-labelledby="dashboard-tasks-heading">
      <div className="dashboard-tasks-header">
        <div className="dashboard-tasks-title-group">
          <div className="dashboard-tasks-icon-box" aria-hidden="true">
            <Icon name="checkCircle" size={18} />
          </div>
          <h2 id="dashboard-tasks-heading">Görevler</h2>
        </div>
        <span className="dashboard-tasks-remaining-pill">{totalRemainingCount} KALDI</span>
      </div>

      <div className="dashboard-task-filters" role="group" aria-label="Görev filtresi">
        {TASK_FILTERS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={`dashboard-task-filter-btn ${taskFilter === key ? "is-active" : ""}`}
            aria-pressed={taskFilter === key}
            onClick={() => setTaskFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tasksLoad.warning && (
        <p className="dashboard-empty" role="status">
          {tasksLoad.warning}
        </p>
      )}

      {editor && (
        <TaskEditorDialog
          key={editor.id}
          task={editor}
          isExisting={tasks.some(t => t.id === editor.id)}
          locked={tasksLoad.locked}
          onClose={() => setEditor(null)}
          onSaved={() => onError("")}
        />
      )}

      <div className="dashboard-tasks-list">
        {shownLessons.length === 0 && sortedTasks.length === 0 ? (
          <div className="dashboard-tasks-empty">
            <p>
              {tasks.length === 0
                ? "Henüz kayıtlı görev bulunmuyor."
                : "Bu filtrede görev veya ders bulunmuyor."}
            </p>
          </div>
        ) : (
          <>
            {shownLessons.map(block => {
              const att = attendance[block.id];
              const status = att?.status;
              return (
                <article
                  className={`dashboard-tasks-item study-task-row ${
                    status === "attended"
                      ? "completed is-study-attended"
                      : status === "skipped"
                      ? "is-study-skipped"
                      : ""
                  }`}
                  key={block.id}
                >
                  <button
                    type="button"
                    className={`task-toggle study-status-toggle ${
                      status === "attended" ? "is-attended" : status === "skipped" ? "is-skipped" : ""
                    }`}
                    onClick={() => onToggleStudyBlock(block.id)}
                    title="1 tık: Çalıştım · 2 tık: Çalışmadım · 3 tık: Sıfırla"
                    aria-label={`${block.label}: ${
                      status === undefined
                        ? "Çalıştım olarak işaretle"
                        : status === "attended"
                        ? "Çalışmadım olarak işaretle"
                        : "Durumu sıfırla"
                    }`}
                  >
                    {status === "attended" ? (
                      <Icon name="check" size={12} />
                    ) : status === "skipped" ? (
                      <span className="study-toggle-x" aria-hidden="true">✕</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="dashboard-tasks-content"
                    onClick={() => onToggleStudyBlock(block.id)}
                  >
                    <strong>
                      {block.label}
                      {block.topic ? ` · ${block.topic}` : ""}
                    </strong>
                    <small>
                      📚 Ders · {block.date === todayDateStr ? "Bugün" : block.date.split("-").reverse().join(".")} ·{" "}
                      {block.time} – {block.endTime}
                      {status === "attended" ? (
                        <span className="study-att-inline is-attended">
                          {" · ✓ Çalışıldı"}
                          {formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                        </span>
                      ) : status === "skipped" ? (
                        <span className="study-att-inline is-skipped">
                          {" · ✗ Çalışılmadı"}
                          {formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                        </span>
                      ) : (
                        <span className="study-att-hint"> · 1 tık ✓ · 2 tık ✕</span>
                      )}
                    </small>
                  </button>
                  <span className="timeline-tag" style={{ flexShrink: 0 }}>
                    Ders
                  </span>
                </article>
              );
            })}

            {sortedTasks.map(task => {
              const isTaskDone = isOccurrenceCompleted(task);
              const isOverdue = !isTaskDone && !task.recurrence && !!task.dueDate && task.dueDate < todayDateStr;
              const hasEarlyReminder = Boolean(task.reminder && task.reminderLeadMinutes && task.reminderLeadMinutes > 0);
              return (
                <article
                  className={`dashboard-tasks-item ${isTaskDone ? "completed" : ""} ${isOverdue ? "overdue" : ""}`}
                  key={task.id}
                >
                  <button
                    type="button"
                    className="task-toggle"
                    disabled={tasksLoad.locked}
                    onClick={() => handleToggleTask(task.id)}
                    aria-label={`${task.text}: ${isTaskDone ? "tamamlanmadı olarak işaretle" : "tamamlandı olarak işaretle"}`}
                    aria-pressed={isTaskDone}
                  >
                    {isTaskDone && <Icon name="check" size={12} />}
                  </button>

                  <div className="dashboard-tasks-main">
                    <button
                      type="button"
                      className="dashboard-tasks-content"
                      disabled={tasksLoad.locked}
                      onClick={() => {
                        setEditor({ ...task });
                        setDeleteId(null);
                      }}
                    >
                      <strong>{task.text}</strong>
                      <small>
                        {isTaskDone && (
                          <span className="dashboard-task-done-inline">
                            {formatCompletedTime(task.lastCompletedAt)
                              ? `✓ ${formatCompletedTime(task.lastCompletedAt)} · `
                              : "✓ Tamamlandı · "}
                          </span>
                        )}
                        {task.recurrence
                          ? recurrenceLabel(task.recurrence)
                          : task.dueDate
                          ? task.dueDate === todayDateStr
                            ? "Bugün"
                            : task.dueDate.split("-").reverse().join(".")
                          : "Tarihsiz"}
                        {task.dueTime && " · " + task.dueTime}
                        {isOverdue && <span className="dashboard-task-overdue-inline"> · Tarihi geçti</span>}
                        {task.recurrence && " · " + (scheduleDate(task)?.split("-").reverse().join(".") ?? "")}
                        {task.reminder && " · 🔔"}
                        {hasEarlyReminder && ` · ${task.reminderLeadMinutes} dk önce`}
                        {task.snoozedUntil && " · Ertelendi"}
                      </small>
                    </button>

                    {deleteId === task.id && (
                      <div className="task-delete-confirm">
                        <span>Bu görev silinsin mi?</span>
                        <button type="button" onClick={() => handleDelete(task)}>
                          Evet, sil
                        </button>
                        <button type="button" onClick={() => setDeleteId(null)}>
                          Vazgeç
                        </button>
                      </div>
                    )}
                  </div>

                  {isTaskDone && (
                    <button
                      type="button"
                      className="dashboard-task-reopen-btn"
                      disabled={tasksLoad.locked}
                      onClick={() => handleToggleTask(task.id)}
                    >
                      Yeniden Aç
                    </button>
                  )}

                  <ActionMenu label={task.text + " işlemleri"}>
                    {isTaskDone ? (
                      <button
                        type="button"
                        disabled={tasksLoad.locked}
                        onClick={() => handleToggleTask(task.id)}
                      >
                        Yeniden Aç
                      </button>
                    ) : (
                      task.dueDate &&
                      task.dueTime && (
                        <>
                          <button type="button" disabled={tasksLoad.locked} onClick={() => handleSnooze(task, 15)}>
                            15 dakika ertele
                          </button>
                          <button type="button" disabled={tasksLoad.locked} onClick={() => handleSnooze(task, 60)}>
                            1 saat ertele
                          </button>
                          <button type="button" disabled={tasksLoad.locked} onClick={() => handleSnooze(task, 1440)}>
                            Yarın hatırlat
                          </button>
                        </>
                      )
                    )}
                    <button
                      type="button"
                      disabled={tasksLoad.locked}
                      onClick={() => {
                        setEditor({ ...task });
                        setDeleteId(null);
                      }}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      disabled={tasksLoad.locked}
                      className="danger-action"
                      onClick={() => setDeleteId(task.id)}
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

      <div className="dashboard-tasks-footer-stats">
        <span>
          • {tasks.length} görevden {totalCompletedTasksCount} tanesi tamamlandı
          {todayStudyBlocks.length > 0 && ` · Bugün ${todayAttendedLessonsCount}/${todayStudyBlocks.length} ders işlendi`}
        </span>
      </div>
    </section>
  );
}
