import { parseSmartCapture } from "../../shared/smartCapture";
import { ActionMenu } from "./ActionMenu";
import { TaskEditorDialog } from "./TaskEditorDialog";
import { recurrenceLabel, scheduleDate, isOccurrenceCompleted, formatCompletedTime } from "../../shared/recurrence";
import { studyBlocks } from "../../shared/studyPrograms";
import { loadStudyAttendance, setStudyBlockStatus, cycleAttendanceStatus } from "../../shared/studyAttendance";
import { loadStudyPrograms } from "../studyProgramStore";
import {
  TASK_FILTERS,
  deleteTaskRecord,
  filterAndSortTasks,
  filterLessonsForTaskTab,
  snoozeTaskRecord,
  toggleTaskRecordCompletion,
} from "../taskActions";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { loadTasks, localDateKey, saveTasks, type Task, type TaskFilter } from "../taskStore";

export function Tasks({
  fullPage = false,
  initialId,
  focusNew = false,
  initialDate,
}: {
  fullPage?: boolean;
  initialId?: boolean | string;
  focusNew?: boolean;
  initialDate?: string;
}) {
  const [loaded, setLoaded] = useState(loadTasks);
  const [tasks, setTasks] = useState<Task[]>(loaded.entries);
  const [error, setError] = useState(loaded.warning ?? "");
  const [studyData, setStudyData] = useState(loadStudyPrograms);
  const [attendance, setAttendance] = useState(() => loadStudyAttendance());
  const [draft, setDraft] = useState("");
  const [editor, setEditor] = useState<Task | null>(null);
  const [filter, setFilter] = useState<TaskFilter>(() =>
    initialId && loadTasks().entries.some(task => task.id === initialId && task.completed) ? "completed" : "all"
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const value = loadTasks();
      setLoaded(value);
      setTasks(value.entries);
      setStudyData(loadStudyPrograms());
      setAttendance(loadStudyAttendance());
      if (value.warning) setError(value.warning);
    };
    const refreshAtt = () => setAttendance(loadStudyAttendance());
    window.addEventListener("ack-data-changed", refresh);
    window.addEventListener("ack-study-attendance-changed", refreshAtt);
    return () => {
      window.removeEventListener("ack-data-changed", refresh);
      window.removeEventListener("ack-study-attendance-changed", refreshAtt);
    };
  }, []);

  function toggleStudyBlock(blockId: string) {
    const nextStatus = cycleAttendanceStatus(attendance[blockId]?.status);
    setAttendance(setStudyBlockStatus(blockId, nextStatus));
  }

  useEffect(() => {
    if (initialDate) setEditor({ ...newTask(""), dueDate: initialDate });
    if (focusNew) document.getElementById("new-task")?.focus();
    if (initialId) document.getElementById("task-" + initialId)?.scrollIntoView({ block: "center" });
  }, [focusNew, initialId]);

  function commit(next: Task[]) {
    if (!saveTasks(next, loadTasks())) {
      setError("Görevler kaydedilemedi. Mevcut veriler korunuyor.");
      return false;
    }
    setTasks(next);
    setError("");
    return true;
  }

  function newTask(text: string): Task {
    return { id: crypto.randomUUID(), text, completed: false, dueDate: null, dueTime: null, priority: "normal", reminder: false };
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loaded.locked) return;
    const capture = parseSmartCapture(text, []);
    if (capture?.kind === "task") {
      const { kind: _, ...fields } = capture;
      setEditor({ ...newTask(capture.text), ...fields });
      return;
    }
    if (capture?.kind === "note") {
      setError("Bu bir not taslağı. ACK AI veya hızlı yakalama üzerinden not olarak oluşturabilirsiniz.");
      return;
    }
    if (commit([newTask(text), ...loadTasks().entries])) setDraft("");
  }

  const todayStr = localDateKey();
  const todayLessons = studyBlocks(studyData.entries, new Date(), [todayStr]);
  const weekLessons = studyBlocks(studyData.entries, new Date());
  const shownLessons = filterLessonsForTaskTab(filter, todayLessons, weekLessons, attendance, todayStr);
  const remainingTasks = tasks.filter(task => !isOccurrenceCompleted(task)).length;
  const remainingLessons = todayLessons.filter(b => !attendance[b.id]?.status).length;
  const remaining = remainingTasks + remainingLessons;
  const shown = filterAndSortTasks(tasks, filter, todayStr);

  return (
    <section className={"section tasks-section " + (fullPage ? "tasks-page" : "")} aria-labelledby="tasks-heading">
      <div className="section-heading">
        <div>
          {!fullPage && <span className="eyebrow">GÜNÜN AKIŞI</span>}
          {fullPage ? (
            <>
              <h1 id="tasks-heading">Görevler</h1>
              <p className="tasks-description">Yapılacaklarını ve günlük derslerini tek yerden takip et.</p>
            </>
          ) : (
            <h2 id="tasks-heading">Yapılacaklar</h2>
          )}
        </div>
        <span className="task-count">{remaining} KALDI</span>
      </div>

      <div className="task-capture-row">
        <form className="task-form" onSubmit={addTask}>
          <label className="sr-only" htmlFor="new-task">Hızlı görev ekle</label>
          <Icon name="plus" size={18} />
          <input
            id="new-task"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="Yapılacak bir şey yaz…"
            maxLength={160}
            disabled={loaded.locked}
          />
          <button type="submit" disabled={!draft.trim() || loaded.locked} aria-label="Görev ekle">
            <Icon name="arrowRight" size={17} />
          </button>
        </form>
        <button
          className="button button-primary task-create-button"
          type="button"
          title="Tarih ve hatırlatma ile yeni görev oluştur"
          onClick={() => {
            setEditor(newTask(draft));
            setDeleteId(null);
          }}
          disabled={loaded.locked}
        >
          <Icon name="plus" size={17} />Yeni görev
        </button>
      </div>

      <div className="tasks-card surface">
        <div className="task-filters" role="group" aria-label="Görev filtresi">
          {TASK_FILTERS.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        {error && <p className="tool-feedback error" role="alert">{error}</p>}
        {editor && (
          <TaskEditorDialog
            key={editor.id}
            task={editor}
            isExisting={tasks.some(task => task.id === editor.id)}
            locked={loaded.locked}
            onClose={() => setEditor(null)}
            onSaved={next => {
              setTasks(next);
              setError("");
              setDraft("");
            }}
          />
        )}
        <div className="task-list">
          {shownLessons.map(block => {
            const att = attendance[block.id];
            const status = att?.status;
            return (
              <div
                className={`task-item study-task-row ${status === "attended" ? "completed is-study-attended" : status === "skipped" ? "is-study-skipped" : ""}`}
                key={block.id}
              >
                <button
                  className={`task-toggle study-status-toggle ${status === "attended" ? "is-attended" : status === "skipped" ? "is-skipped" : ""}`}
                  type="button"
                  onClick={() => toggleStudyBlock(block.id)}
                  title="1 tık: Çalıştım · 2 tık: Çalışmadım · 3 tık: Sıfırla"
                  aria-label={`${block.label}: ${status === undefined ? "Çalıştım olarak işaretle" : status === "attended" ? "Çalışmadım olarak işaretle" : "Durumu sıfırla"}`}
                >
                  {status === "attended" ? (
                    <Icon name="check" size={13} />
                  ) : status === "skipped" ? (
                    <span className="study-toggle-x" aria-hidden="true">✕</span>
                  ) : null}
                </button>
                <div className="task-text">
                  <button className="task-open" type="button" onClick={() => toggleStudyBlock(block.id)}>
                    <span>{block.label}{block.topic ? ` · ${block.topic}` : ""}</span>
                    <small className="task-meta">
                      📚 Ders · {block.date === todayStr ? "Bugün" : block.date.split("-").reverse().join(".")} · {block.time} – {block.endTime}
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
                </div>
                <span className="timeline-tag" style={{ flexShrink: 0 }}>Ders</span>
              </div>
            );
          })}
          {shown.length ? (
            shown.map(task => (
              <div
                id={"task-" + task.id}
                className={`task-item ${isOccurrenceCompleted(task) ? "completed" : ""} ${!isOccurrenceCompleted(task) && !task.recurrence && task.dueDate && task.dueDate < todayStr ? "overdue" : ""} ${initialId === task.id ? "record-highlight" : ""}`}
                key={task.id}
              >
                <button
                  className="task-toggle"
                  type="button"
                  disabled={loaded.locked}
                  onClick={() => {
                    const res = toggleTaskRecordCompletion(task.id);
                    if (res.ok) {
                      setTasks(res.next);
                      setError("");
                    } else {
                      setError(res.error);
                    }
                  }}
                  aria-label={`${task.text}: ${isOccurrenceCompleted(task) ? "tamamlanmadı olarak işaretle" : "tamamlandı olarak işaretle"}`}
                  aria-pressed={isOccurrenceCompleted(task)}
                >
                  {isOccurrenceCompleted(task) && <Icon name="check" size={13} />}
                </button>
                <div className="task-text">
                  <button
                    className="task-open"
                    type="button"
                    disabled={loaded.locked}
                    onClick={() => {
                      setEditor({ ...task });
                      setDeleteId(null);
                    }}
                  >
                    <span>{task.text}</span>
                    <small className="task-meta">
                      {isOccurrenceCompleted(task) && (
                        <span style={{ color: "var(--app-accent, #38bdf8)", fontWeight: 600 }}>
                          {formatCompletedTime(task.lastCompletedAt) ? `✓ ${formatCompletedTime(task.lastCompletedAt)} · ` : "✓ Tamamlandı · "}
                        </span>
                      )}
                      {task.recurrence
                        ? recurrenceLabel(task.recurrence)
                        : task.dueDate
                        ? task.dueDate.split("-").reverse().join(".")
                        : "Tarihsiz"}
                      {task.dueTime && " · " + task.dueTime}
                      {!isOccurrenceCompleted(task) && !task.recurrence && task.dueDate && task.dueDate < todayStr && " · Tarihi geçti"}
                      {task.recurrence && " · " + (scheduleDate(task)?.split("-").reverse().join(".") ?? "")}
                      {task.snoozedUntil && " · Ertelendi"}
                    </small>
                  </button>
                  {deleteId === task.id && (
                    <div className="task-delete-confirm">
                      <span>Bu görev silinsin mi?</span>
                      <button
                        type="button"
                        onClick={() => {
                          const res = deleteTaskRecord(task);
                          if (res.ok) {
                            setTasks(res.next);
                            setError("");
                            setDeleteId(null);
                          } else {
                            setError(res.error);
                          }
                        }}
                      >
                        Evet, sil
                      </button>
                      <button type="button" onClick={() => setDeleteId(null)}>Vazgeç</button>
                    </div>
                  )}
                </div>
                <ActionMenu label={task.text + " işlemleri"}>
                  {task.dueDate && task.dueTime && !task.completed && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const res = snoozeTaskRecord(task, 15);
                          if (res.ok) {
                            setTasks(res.next);
                            setError("");
                          } else setError(res.error);
                        }}
                      >
                        15 dakika ertele
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const res = snoozeTaskRecord(task, 60);
                          if (res.ok) {
                            setTasks(res.next);
                            setError("");
                          } else setError(res.error);
                        }}
                      >
                        1 saat ertele
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const res = snoozeTaskRecord(task, 1440);
                          if (res.ok) {
                            setTasks(res.next);
                            setError("");
                          } else setError(res.error);
                        }}
                      >
                        Yarın hatırlat
                      </button>
                    </>
                  )}
                  <button
                    className="task-details-button"
                    type="button"
                    disabled={loaded.locked}
                    aria-label={task.text + " görevini düzenle"}
                    onClick={() => {
                      setEditor({ ...task });
                      setDeleteId(null);
                    }}
                  >
                    Düzenle
                  </button>
                  <button
                    className="task-delete"
                    type="button"
                    disabled={loaded.locked}
                    onClick={() => setDeleteId(task.id)}
                    aria-label={`${task.text} görevini sil`}
                  >
                    <Icon name="trash" size={16} /> Sil
                  </button>
                </ActionMenu>
              </div>
            ))
          ) : shownLessons.length === 0 ? (
            <div className="empty-tasks">
              {tasks.length
                ? "Bu filtrede görev yok."
                : loaded.locked
                ? "Görevler okunamadı. Mevcut veriler korunuyor."
                : "Henüz görev yok. Yukarıdan bir görev ekleyebilirsin."}
            </div>
          ) : null}
        </div>
        <div className="task-footer">
          <span className="task-footer-dot" /> {tasks.length} görevden {tasks.length - remainingTasks} tanesi tamamlandı
          {todayLessons.length > 0 ? ` · Bugün ${todayLessons.length - remainingLessons}/${todayLessons.length} ders işlendi` : ""}
        </div>
      </div>
    </section>
  );
}
