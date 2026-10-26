import { dailySummary } from "../productIntelligence";
import { Subscriptions } from "./Subscriptions";
import { PrayerWidget } from "./PrayerWidget";
import { completeOccurrence, scheduleDate } from "../../shared/recurrence";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Header } from "./Header";
import { PcStatus } from "./PcStatus";
import { PomodoroTimer } from "./PomodoroTimer";
import { Icon } from "./Icon";
import { loadDashboardData, todayTasks } from "../dashboardData";
import { loadTasks, saveTasks, localDateKey } from "../taskStore";
import { loadStudyPrograms } from "../studyProgramStore";
import { studyBlocks, WEEKDAY_SHORT } from "../../shared/studyPrograms";
import { weekDates } from "../../shared/weeklyPlan";
import type { Project } from "../projectStore";
import type { NavigationTarget } from "../navigation";

type Props = { projects: Project[]; refreshMs: number; onNavigate: (target: NavigationTarget) => void; onAskAi: (text: string) => void; targetId?: string; };
function AiStart({ onAskAi }: Pick<Props, "onAskAi">) {
  const [draft, setDraft] = useState("");
  const submitting = useRef(false);
  function ask(text: string) { if (!text.trim() || submitting.current) return; submitting.current = true; onAskAi(text.trim()); }
  function submit(event: FormEvent) { event.preventDefault(); ask(draft); }
  return <section className="dashboard-ai surface" aria-labelledby="dashboard-ai-heading">
    <div className="dashboard-ai-title"><span className="dashboard-ai-icon"><Icon name="spark" size={23} /></span><div><h2 id="dashboard-ai-heading">ACK AI</h2><p>Bir sonraki adımını birlikte planlayalım.</p></div></div>
    <form onSubmit={submit}><label className="sr-only" htmlFor="dashboard-ai-prompt">ACK AI mesajı</label><textarea id="dashboard-ai-prompt" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={3} maxLength={8000} placeholder="Bana ne yapmak istediğini yaz..." /><div className="dashboard-ai-send"><small>Enter ile gönder · İşlemler için onayın istenir.</small><button className="button button-primary" type="submit" disabled={!draft.trim()}>Gönder <Icon name="arrowRight" size={16} /></button></div></form>
  </section>;
}
export function Dashboard({ projects, refreshMs, onNavigate, onAskAi, targetId }: Props) {
  const [data, setData] = useState(loadDashboardData), [now, setNow] = useState(() => new Date());
  const [studyData, setStudyData] = useState(loadStudyPrograms);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (targetId === "prayer") {
      const el = document.getElementById("prayer-widget");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("prayer-widget-highlight");
        const timer = setTimeout(() => el.classList.remove("prayer-widget-highlight"), 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [targetId]);
  useEffect(() => {
    let frameId: number | null = null;
    const refresh = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        setData(loadDashboardData());
        setStudyData(loadStudyPrograms());
        frameId = null;
      });
    };
    window.addEventListener("ack-data-changed", refresh);
    window.addEventListener("ack-recents-changed", refresh);
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      window.removeEventListener("ack-data-changed", refresh);
      window.removeEventListener("ack-recents-changed", refresh);
      window.clearInterval(timer);
    };
  }, []);
  const daily = todayTasks(data.tasks.entries, now);
  function complete(id: string) { const current = loadTasks(); if (!saveTasks(current.entries.map(task => task.id === id ? completeOccurrence(task) : task), current)) setFeedback("Görev kaydedilemedi. Mevcut veriler korunuyor."); }
  const summary = dailySummary();
  const allBlocks = studyBlocks(studyData.entries, now);
  const todayDateStr = localDateKey(now);
  const [selectedDate, setSelectedDate] = useState<string>(todayDateStr);
  const curWeekDates = weekDates(now);

  const getTasksForDate = (dateStr: string) => {
    return data.tasks.entries.filter(t => {
      if (t.completed) return false;
      if (t.recurrence) {
        return scheduleDate(t, new Date(dateStr + "T12:00:00").getTime()) === dateStr;
      }
      return t.dueDate === dateStr;
    });
  };

  const weekDays = curWeekDates.map(dStr => {
    const d = new Date(dStr + "T12:00:00");
    const dayOfWeek = (d.getDay() + 6) % 7;
    const studyCount = allBlocks.filter(b => b.date === dStr).length;
    const taskCount = getTasksForDate(dStr).length;
    return {
      date: dStr,
      shortLabel: WEEKDAY_SHORT[dayOfWeek],
      dayNum: d.getDate(),
      studyCount,
      taskCount,
      count: studyCount + taskCount,
    };
  });

  const isSelectedToday = selectedDate === todayDateStr;
  const displayedStudyBlocks = allBlocks.filter(b => b.date === selectedDate);
  const displayedTasks = getTasksForDate(selectedDate);

  const selectedDateLabel = (() => {
    try {
      const [y, m, d] = selectedDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });
    } catch {
      return selectedDate;
    }
  })();

  const timelineItems = [
    ...displayedStudyBlocks.map(b => ({
      kind: "study" as const,
      id: b.id,
      time: b.time,
      endTime: b.endTime,
      label: b.label,
      topic: b.topic,
    })),
    ...displayedTasks.map(t => ({
      kind: "task" as const,
      id: t.id,
      time: t.dueTime,
      text: t.text,
      completed: t.completed,
    })),
  ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  return (
    <div className="dashboard work-dashboard">
      <Header />
      <div className="dashboard-workbench">
        <div className="dashboard-primary-column">
          <div className="dashboard-overview" aria-label="Çalışma alanı özeti">
            <button type="button" onClick={() => onNavigate({ page: "tasks" })}>
              <span className="overview-icon"><Icon name="check" size={21} /></span>
              <span><strong>{data.tasks.locked ? "—" : data.tasks.entries.filter(task => !task.completed).length}</strong><small>Aktif görev</small></span>
              <Icon name="arrowRight" size={16} />
            </button>
            <button type="button" onClick={() => onNavigate({ page: "projects" })}>
              <span className="overview-icon"><Icon name="folder" size={21} /></span>
              <span><strong>{projects.length}</strong><small>Proje</small></span>
              <Icon name="arrowRight" size={16} />
            </button>
            <button type="button" onClick={() => onNavigate({ page: "notes" })}>
              <span className="overview-icon"><Icon name="note" size={21} /></span>
              <span><strong>{data.notesCount ?? "—"}</strong><small>Not</small></span>
              <Icon name="arrowRight" size={16} />
            </button>
          </div>

          {/* Günün Akışı & Haftalık Çizelge (Üstte) */}
          <section className="dashboard-weekly-preview surface" aria-labelledby="dashboard-weekly-heading">
            <div className="dashboard-section-top">
              <div className="weekly-preview-title">
                <span className="overview-icon-small"><Icon name="grid" size={18} /></span>
                <div>
                  <h2 id="dashboard-weekly-heading">Günün Akışı & Haftalık Çizelge</h2>
                  <small>
                    {timelineItems.length > 0
                      ? `${isSelectedToday ? "Bugün" : selectedDateLabel} için ${displayedStudyBlocks.length > 0 ? `${displayedStudyBlocks.length} ders` : ""}${displayedStudyBlocks.length > 0 && displayedTasks.length > 0 ? " ve " : ""}${displayedTasks.length > 0 ? `${displayedTasks.length} görev` : ""} planlı`
                      : `${isSelectedToday ? "Bugün" : selectedDateLabel} için planlı ders veya görev yok`}
                  </small>
                </div>
              </div>
              <button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "calendar" })}>
                Tüm planı aç <Icon name="arrowRight" size={14} />
              </button>
            </div>

            <div className="dashboard-schedule-vertical-layout">
              {/* Üstte: Haftanın Günleri Şeridi (İlk SS) */}
              <div className="schedule-week-strip-box">
                <div className="week-mini-strip-compact">
                  {weekDays.map(day => (
                    <button
                      key={day.date}
                      type="button"
                      className={`week-mini-cell ${day.date === selectedDate ? "is-selected" : ""} ${day.date === todayDateStr ? "is-today" : ""}`}
                      onClick={() => setSelectedDate(day.date)}
                      title={`${day.shortLabel} ${day.dayNum}: ${day.count > 0 ? `${day.count} ders oturumu` : "Ders yok"}`}
                    >
                      <span className="mini-cell-day">{day.shortLabel}</span>
                      <span className="mini-cell-num">{day.dayNum}</span>
                      <span className="mini-cell-indicator">
                        {day.count > 0 ? <span className="mini-count-dot">{day.count}</span> : <span className="mini-empty-dash">—</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Altta: Seçilen Günün Oturum ve İşleri (İkinci SS) */}
              <div className="schedule-day-feed-box">
                <div className="schedule-column-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="column-dot" />
                    <strong>{isSelectedToday ? "Bugünkü Oturumlar & İşler" : `${selectedDateLabel} Programı`}</strong>
                  </div>
                  {!isSelectedToday && (
                    <button
                      type="button"
                      className="dashboard-text-button"
                      style={{ fontSize: "0.76rem", padding: "0.2rem 0.5rem", height: "auto", minHeight: "auto" }}
                      onClick={() => setSelectedDate(todayDateStr)}
                    >
                      Bugüne dön
                    </button>
                  )}
                </div>

                {timelineItems.length > 0 ? (
                  <div className="schedule-timeline-list">
                    {timelineItems.map(item => (
                      <div
                        key={item.id}
                        className={`schedule-timeline-item ${item.kind === "study" ? "session-study" : "session-task"} ${item.kind === "task" && item.completed ? "is-completed" : ""}`}
                      >
                        <span className="timeline-clock">
                          {item.kind === "study" ? `${item.time} – ${item.endTime}` : item.time || "Tüm gün"}
                        </span>
                        <div className="timeline-content">
                          <strong>{item.kind === "study" ? item.label : item.text}</strong>
                          {item.kind === "study" && item.topic ? <small>{item.topic}</small> : null}
                        </div>
                        <span className={`timeline-tag ${item.kind === "study" ? "" : "task-tag"}`}>
                          {item.kind === "study" ? "Ders" : "Görev"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="schedule-today-empty">
                    <p>{isSelectedToday ? "Bugün için ders veya görev bulunmuyor." : `${selectedDateLabel} için planlı ders veya görev yok.`}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {feedback && <p className="tool-feedback error" role="alert">{feedback}</p>}

          {/* Bugün ve ACK AI (Altta) */}
          <div className="dashboard-start-grid">
            <section className="dashboard-today surface" aria-labelledby="dashboard-today-heading">
              <div className="dashboard-section-top">
                <div>
                  <h2 id="dashboard-today-heading">Bugün</h2>
                  <small className="today-date-subtitle">
                    {now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}
                  </small>
                </div>
                <button type="button" className="dashboard-text-button" onClick={() => onNavigate({ page: "tasks", intent: "new-task" })}>
                  + Görev
                </button>
              </div>

              <div className="daily-summary-counts">
                <button type="button" className="today-badge-btn" onClick={() => onNavigate({ page: "tasks" })}>
                  <Icon name="check" size={13} />
                  <span><strong>{summary.today}</strong> görev {summary.overdue > 0 && <em className="overdue-count">({summary.overdue} geciken)</em>}</span>
                </button>
                <button type="button" className="today-badge-btn" onClick={() => onNavigate({ page: "inbox" })}>
                  <Icon name="files" size={13} />
                  <span><strong>{summary.unhandledInbox ?? "0"}</strong> gelen</span>
                </button>
                <button type="button" className="today-badge-btn" onClick={() => onNavigate({ page: "subscriptions" })}>
                  <Icon name="archive" size={13} />
                  <span><strong>{summary.subscriptions.length}</strong> abonelik</span>
                </button>
              </div>

              {data.tasks.warning && <p className="dashboard-empty" role="status">{data.tasks.warning}</p>}

              <div className="dashboard-daily-list">
                {daily.map(({ task, label }) => (
                  <div className="dashboard-daily-task" key={task.id}>
                    <button
                      type="button"
                      className="task-toggle"
                      onClick={() => complete(task.id)}
                      aria-label={task.text + ": tamamlandı işaretle"}
                    />
                    <button type="button" className="dashboard-task-open" onClick={() => onNavigate({ page: "tasks", id: task.id })}>
                      <strong>{task.text}</strong>
                      <small className={label === "Zamanı geçti" ? "overdue" : ""}>
                        {label}{task.dueTime && " · " + task.dueTime}
                      </small>
                    </button>
                  </div>
                ))}
              </div>

              {!daily.length && !data.tasks.locked && (
                <div className="dashboard-empty-state">
                  <span><Icon name="check" size={26} /></span>
                  <strong>Günün açık</strong>
                  <p>Bekleyen tarihli görev yok.</p>
                </div>
              )}
            </section>

            <AiStart onAskAi={onAskAi} />
          </div>

          {/* Pomodoro Odak Sayacı */}
          <PomodoroTimer />
        </div>

        <aside className="dashboard-right-rail" aria-label="Namaz vakitleri ve durum">
          <PrayerWidget />
          <Subscriptions compact onOpen={() => onNavigate({ page: "subscriptions" })} />
          <PcStatus refreshMs={refreshMs} compact />
        </aside>
      </div>
    </div>
  );
}
