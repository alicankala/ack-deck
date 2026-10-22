import { dailySummary } from "../productIntelligence";
import { Subscriptions } from "./Subscriptions";
import { PrayerWidget } from "./PrayerWidget";
import { completeOccurrence, scheduleDate } from "../../shared/recurrence";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Header } from "./Header";
import { PcStatus } from "./PcStatus";
import { Icon, type IconName } from "./Icon";
import { dashboardProjects, loadDashboardData, todayTasks } from "../dashboardData";
import { loadTasks, saveTasks, localDateKey } from "../taskStore";
import { openRegisteredProject } from "../commandPalette";
import { loadStudyPrograms } from "../studyProgramStore";
import { studyBlocks, WEEKDAY_SHORT } from "../../shared/studyPrograms";
import { weekDates } from "../../shared/weeklyPlan";
import type { Project } from "../projectStore";
import type { NavigationTarget } from "../navigation";
import { launchWorkspace, launchShortcut } from "../hubLaunch";

type Props = { projects: Project[]; refreshMs: number; onNavigate: (target: NavigationTarget) => void; onAskAi: (text: string) => void; onOpenSearch: () => void };
function AiStart({ onAskAi, onNavigate, lastProject }: Pick<Props, "onAskAi" | "onNavigate"> & { lastProject?: Project }) {
  const [draft, setDraft] = useState("");
  const submitting = useRef(false);
  function ask(text: string) { if (!text.trim() || submitting.current) return; submitting.current = true; onAskAi(text.trim()); }
  function submit(event: FormEvent) { event.preventDefault(); ask(draft); }
  return <section className="dashboard-ai surface" aria-labelledby="dashboard-ai-heading">
    <div className="dashboard-ai-title"><span className="dashboard-ai-icon"><Icon name="spark" size={23} /></span><div><h2 id="dashboard-ai-heading">ACK AI</h2><p>Bir sonraki adımını birlikte planlayalım.</p></div></div>
    <form onSubmit={submit}><label className="sr-only" htmlFor="dashboard-ai-prompt">ACK AI mesajı</label><textarea id="dashboard-ai-prompt" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={3} maxLength={8000} placeholder="Bana ne yapmak istediğini yaz..." /><div className="dashboard-ai-send"><small>Enter ile gönder · İşlemler için onayın istenir.</small><button className="button button-primary" type="submit" disabled={!draft.trim()}>Gönder <Icon name="arrowRight" size={16} /></button></div></form>
    <div className="dashboard-suggestions" aria-label="ACK AI hızlı başlangıçları"><button type="button" onClick={() => ask("Günümü planla. Bugün ne var?")}>Bugün ne var?</button><button type="button" onClick={() => ask("Bilgisayar şu an nasıl?")}>PC nasıl?</button>{lastProject && <button type="button" onClick={() => ask(lastProject.name + " projesini aç.")}>Son projeyi aç</button>}<button type="button" onClick={() => onNavigate({ page: "tasks", intent: "new-task" })}>+ Yeni görev</button></div>
  </section>;
}
const shortcuts: { label: string; icon: IconName; target: NavigationTarget }[] = [
  { label: "Yeni görev", icon: "check", target: { page: "tasks", intent: "new-task" } },
  { label: "Yeni not", icon: "note", target: { page: "notes", intent: "new-note" } },
  { label: "Haftalık Plan", icon: "grid", target: { page: "calendar" } },
  { label: "Arşiv", icon: "archive", target: { page: "archive" } },
];
export function Dashboard({ projects, refreshMs, onNavigate, onAskAi, onOpenSearch }: Props) {
  const [data, setData] = useState(loadDashboardData), [now, setNow] = useState(() => new Date());
  const [studyData, setStudyData] = useState(loadStudyPrograms);
  const [feedback, setFeedback] = useState("");
  const busy = useRef(false); const [opening, setOpening] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setData(loadDashboardData());
      setStudyData(loadStudyPrograms());
    };
    window.addEventListener("ack-data-changed", refresh);
    window.addEventListener("ack-recents-changed", refresh);
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => {
      window.removeEventListener("ack-data-changed", refresh);
      window.removeEventListener("ack-recents-changed", refresh);
      window.clearInterval(timer);
    };
  }, []);
  const daily = todayTasks(data.tasks.entries, now), shownProjects = dashboardProjects(projects);
  const recentProject = data.recents.find(item => item.source === "projects");
  const lastProject = projects.find(project => project.id === recentProject?.id && project.folderPath);
  async function launch(id: string, mode: "folder" | "vscode") {
    if (busy.current) return; busy.current = true; setOpening(true); setFeedback("");
    try { await openRegisteredProject(id, mode); } catch { setFeedback("Proje açılamadı. Klasörü veya VS Code kurulumunu kontrol edin."); } finally { busy.current = false; setOpening(false); }
  }
  function complete(id: string) { const current = loadTasks(); if (!saveTasks(current.entries.map(task => task.id === id ? completeOccurrence(task) : task), current)) setFeedback("Görev kaydedilemedi. Mevcut veriler korunuyor."); }
  async function launchHub(id: string, source: "workspaces" | "shortcuts") {
    if (busy.current) return; busy.current = true; setOpening(true); setFeedback("");
    try { if (source === "workspaces") { const result = await launchWorkspace(id); if (result.errors.length) setFeedback(result.errors.join(" ")); else if (!result.opened) setFeedback("Çalışma alanına önce bir öğe ekleyin."); } else await launchShortcut(id); }
    catch { setFeedback("Kayıtlı öğe açılamadı. Konumu veya uygulamayı kontrol edin."); } finally { busy.current = false; setOpening(false); }
  }
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
      <Header onOpenSearch={onOpenSearch} />
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

            <AiStart onAskAi={onAskAi} onNavigate={onNavigate} lastProject={lastProject} />
          </div>

          {feedback && <p className="tool-feedback error" role="alert">{feedback}</p>}

          {/* Günün Akışı & Haftalık Çizelge */}
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

            <div className="dashboard-schedule-layout">
              <div className="schedule-today-column">
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

              <div className="schedule-week-column">
                <div className="schedule-column-title">
                  <strong>Haftanın Günleri</strong>
                </div>
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
            </div>
          </section>

          {(data.workspaces.length > 0 || data.pinnedShortcuts.length > 0) && (
            <section aria-labelledby="dashboard-hub-heading">
              <div className="dashboard-section-top">
                <h2 id="dashboard-hub-heading">Hızlı Erişim</h2>
                <button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "workspaces" })}>
                  Tüm çalışma alanları <Icon name="arrowRight" size={14} />
                </button>
              </div>
              <div className="dashboard-shortcuts">
                {data.workspaces.map(v => (
                  <button type="button" key={v.id} disabled={opening} title={v.description || v.name} onClick={() => void launchHub(v.id, "workspaces")}>
                    <Icon name="folder" size={16} />{v.icon} {v.name}<small>Çalışmaya Başla</small>
                  </button>
                ))}
                {data.pinnedShortcuts.map(v => (
                  <button type="button" key={v.id} disabled={opening} title={v.description || v.name} onClick={() => void launchHub(v.id, "shortcuts")}>
                    <Icon name="files" size={16} />{v.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="dashboard-projects-open">
            <section aria-labelledby="dashboard-projects-heading">
              <div className="dashboard-section-top">
                <h2 id="dashboard-projects-heading">Projeler</h2>
                <button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "projects" })}>
                  Tüm projeleri gör <Icon name="arrowRight" size={14} />
                </button>
              </div>
              <div className="dashboard-project-list">
                {shownProjects.map(project => (
                  <article className="dashboard-project surface" key={project.id}>
                    <div className="dashboard-project-title">
                      <Icon name="folder" size={19} />
                      <h3 title={project.name}>{project.name}</h3>
                    </div>
                    <p title={project.description}>{project.description || "Açıklama eklenmedi."}</p>
                    <div className="dashboard-project-actions">
                      <button type="button" disabled={opening || !project.folderPath} onClick={() => void launch(project.id, "folder")}>
                        Klasörü Aç
                      </button>
                      <button type="button" disabled={opening || !project.folderPath} onClick={() => void launch(project.id, "vscode")}>
                        VS Code'da Aç
                      </button>
                    </div>
                    {!project.folderPath && <small>Klasör Projeler sayfasından bağlanabilir.</small>}
                  </article>
                ))}
              </div>
              {!shownProjects.length && <p className="dashboard-empty">Henüz proje yok. Projeler sayfasından bir proje ekleyebilirsin.</p>}
            </section>
          </div>
        </div>

        <aside className="dashboard-right-rail" aria-label="Hızlı işlemler ve durum">
          <section className="dashboard-quick" aria-labelledby="dashboard-quick-heading">
            <div className="dashboard-section-top">
              <h2 id="dashboard-quick-heading">Hızlı İşlemler</h2>
              <button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "tools" })}>
                Daha fazla araç <Icon name="arrowRight" size={14} />
              </button>
            </div>
            <div className="dashboard-shortcuts">
              {shortcuts.map(item => (
                <button type="button" key={item.label} onClick={() => onNavigate(item.target)}>
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </button>
              ))}
            </div>
          </section>
          <PrayerWidget />
          <Subscriptions compact onOpen={() => onNavigate({ page: "subscriptions" })} />
          <PcStatus refreshMs={refreshMs} compact />
        </aside>
      </div>
    </div>
  );
}
