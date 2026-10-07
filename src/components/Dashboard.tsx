import { dailySummary } from "../productIntelligence";
import { Subscriptions } from "./Subscriptions";
import { completeOccurrence } from "../../shared/recurrence";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Header } from "./Header";
import { PcStatus } from "./PcStatus";
import { Icon, type IconName } from "./Icon";
import { dashboardProjects, loadDashboardData, relativeUseTime, todayTasks } from "../dashboardData";
import { loadTasks, saveTasks } from "../taskStore";
import { openRegisteredProject } from "../commandPalette";
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
  { label: "Yeni görev", icon: "check", target: { page: "tasks", intent: "new-task" } }, { label: "Yeni not", icon: "note", target: { page: "notes", intent: "new-note" } }, { label: "Kısayollar", icon: "files", target: { page: "files" } }, { label: "Arşiv", icon: "archive", target: { page: "archive" } },
];
export function Dashboard({ projects, refreshMs, onNavigate, onAskAi, onOpenSearch }: Props) {
  const [data, setData] = useState(loadDashboardData), [now, setNow] = useState(() => new Date());
  const [feedback, setFeedback] = useState("");
  const busy = useRef(false); const [opening, setOpening] = useState(false);
  useEffect(() => { const refresh = () => setData(loadDashboardData()); window.addEventListener("ack-data-changed", refresh); window.addEventListener("ack-recents-changed", refresh); const timer = window.setInterval(() => setNow(new Date()), 60000); return () => { window.removeEventListener("ack-data-changed", refresh); window.removeEventListener("ack-recents-changed", refresh); window.clearInterval(timer); }; }, []);
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
  const summary=dailySummary();
  return <div className="dashboard work-dashboard"><Header onOpenSearch={onOpenSearch} /><div className="dashboard-workbench"><div className="dashboard-primary-column"><div className="dashboard-overview" aria-label="Çalışma alanı özeti"><button type="button" onClick={()=>onNavigate({page:"tasks"})}><span className="overview-icon"><Icon name="check" size={21}/></span><span><strong>{data.tasks.locked?"—":data.tasks.entries.filter(task=>!task.completed).length}</strong><small>Aktif görev</small></span><Icon name="arrowRight" size={16}/></button><button type="button" onClick={()=>onNavigate({page:"projects"})}><span className="overview-icon"><Icon name="folder" size={21}/></span><span><strong>{projects.length}</strong><small>Proje</small></span><Icon name="arrowRight" size={16}/></button><button type="button" onClick={()=>onNavigate({page:"notes"})}><span className="overview-icon"><Icon name="note" size={21}/></span><span><strong>{data.notesCount??"—"}</strong><small>Not</small></span><Icon name="arrowRight" size={16}/></button></div><div className="dashboard-start-grid"><AiStart onAskAi={onAskAi} onNavigate={onNavigate} lastProject={lastProject} />
      <section className="dashboard-today surface" aria-labelledby="dashboard-today-heading"><div className="dashboard-section-top"><h2 id="dashboard-today-heading">Bugün</h2><button type="button" className="dashboard-text-button" onClick={() => onNavigate({ page: "tasks", intent: "new-task" })}>+ Görev</button></div>
        <div className="daily-summary-counts"><button onClick={()=>onNavigate({page:"tasks"})}>{summary.today} bugün · {summary.overdue} geciken</button><button onClick={()=>onNavigate({page:"inbox"})}>{summary.unhandledInbox??"—"} işlenmemiş Gelen</button><button onClick={()=>onNavigate({page:"subscriptions"})}>{summary.subscriptions.length} yaklaşan abonelik</button></div>{data.tasks.warning && <p className="dashboard-empty" role="status">{data.tasks.warning}</p>}
        <div className="dashboard-daily-list">{daily.map(({ task, label }) => <div className="dashboard-daily-task" key={task.id}><button type="button" className="task-toggle" onClick={() => complete(task.id)} aria-label={task.text + ": tamamlandı işaretle"} /><button type="button" className="dashboard-task-open" onClick={() => onNavigate({ page: "tasks", id: task.id })}><strong>{task.text}</strong><small className={label === "Zamanı geçti" ? "overdue" : ""}>{label}{task.dueTime && " · " + task.dueTime}</small></button></div>)}</div>
        {!daily.length && !data.tasks.locked && <div className="dashboard-empty-state"><span><Icon name="check" size={26} /></span><strong>Günün açık</strong><p>Bekleyen tarihli görev yok.</p></div>}
        <button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "calendar" })}>Haftalık plan <Icon name="arrowRight" size={14} /></button>
      </section>
    </div>
{feedback && <p className="tool-feedback error" role="alert">{feedback}</p>}
<section className="dashboard-continue" aria-labelledby="dashboard-continue-heading"><div className="dashboard-section-top"><h2 id="dashboard-continue-heading">Devam Et</h2><button className="dashboard-text-button" onClick={()=>onAskAi("Nerede kalmıştım?")}>ACK AI ile hatırla</button></div>
      {projects.filter(p=>p.nextStep).slice(0,3).map(p=><button className="hub-record-row" key={p.id} onClick={()=>onNavigate({page:"projects",id:p.id})}><strong>{p.name}</strong><small>→ {p.nextStep}</small></button>)}{data.recentLocked ? <p className="dashboard-empty" role="status">Son kullanılanlar okunamadı. Mevcut kayıtlar korunuyor.</p> : !data.recents.length ? <div className="dashboard-empty-inline"><Icon name="layers" size={22} /><div><strong>Kaldığın yer burada olacak</strong><p>Son açtığın proje, not ve dosyalara tek adımda dön.</p></div></div> : <div className="dashboard-recent-list">{data.recents.map(item => <article className="dashboard-recent" key={item.source + item.id}><Icon name={item.source === "projects" ? "folder" : item.source === "notes" ? "note" : item.source === "files" ? "files" : "archive"} size={18} /><div><h3 title={item.title}>{item.title}</h3><small>{item.label} · <time dateTime={new Date(item.usedAt).toISOString()}>{relativeUseTime(item.usedAt, now.getTime())}</time></small></div><button type="button" className="dashboard-text-button" disabled={opening && ["projects", "workspaces", "shortcuts", "files"].includes(item.source)} onClick={() => item.source === "projects" ? void launch(item.id, item.mode ?? "folder") : item.source === "workspaces" ? void launchHub(item.id, "workspaces") : item.source === "shortcuts" || item.source === "files" ? void launchHub(item.id, "shortcuts") : onNavigate(item.target)}>{item.source === "projects" ? item.mode === "vscode" ? "VS Code'da Aç" : "Klasörü Aç" : item.source === "workspaces" ? "Çalışmaya Başla" : "Aç"}</button></article>)}</div>}
    </section>
{(data.workspaces.length > 0 || data.pinnedShortcuts.length > 0) && <section aria-labelledby="dashboard-hub-heading"><div className="dashboard-section-top"><h2 id="dashboard-hub-heading">Hızlı Erişim</h2><button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "workspaces" })}>Tüm çalışma alanları <Icon name="arrowRight" size={14} /></button></div><div className="dashboard-shortcuts">{data.workspaces.map(v => <button type="button" key={v.id} disabled={opening} title={v.description || v.name} onClick={() => void launchHub(v.id, "workspaces")}><Icon name="folder" size={16} />{v.icon} {v.name}<small>Çalışmaya Başla</small></button>)}{data.pinnedShortcuts.map(v => <button type="button" key={v.id} disabled={opening} title={v.description || v.name} onClick={() => void launchHub(v.id, "shortcuts")}><Icon name="files" size={16} />{v.name}</button>)}</div></section>}
<div className="dashboard-projects-open"><section aria-labelledby="dashboard-projects-heading"><div className="dashboard-section-top"><h2 id="dashboard-projects-heading">Projeler</h2><button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "projects" })}>Tüm projeleri gör <Icon name="arrowRight" size={14} /></button></div>
      <div className="dashboard-project-list">{shownProjects.map(project => <article className="dashboard-project surface" key={project.id}><div className="dashboard-project-title"><Icon name="folder" size={19} /><h3 title={project.name}>{project.name}</h3></div><p title={project.description}>{project.description || "Açıklama eklenmedi."}</p><div className="dashboard-project-actions"><button type="button" disabled={opening || !project.folderPath} onClick={() => void launch(project.id, "folder")}>Klasörü Aç</button><button type="button" disabled={opening || !project.folderPath} onClick={() => void launch(project.id, "vscode")}>VS Code'da Aç</button></div>{!project.folderPath && <small>Klasör Projeler sayfasından bağlanabilir.</small>}</article>)}</div>
      {!shownProjects.length && <p className="dashboard-empty">Henüz proje yok. Projeler sayfasından bir proje ekleyebilirsin.</p>}
    </section>

    </div></div><aside className="dashboard-right-rail" aria-label="Hızlı işlemler ve durum"><section className="dashboard-quick" aria-labelledby="dashboard-quick-heading"><div className="dashboard-section-top"><h2 id="dashboard-quick-heading">Hızlı İşlemler</h2><button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "tools" })}>Daha fazla araç <Icon name="arrowRight" size={14} /></button></div><div className="dashboard-shortcuts">{shortcuts.map(item => <button type="button" key={item.label} onClick={() => onNavigate(item.target)}><Icon name={item.icon} size={16} />{item.label}</button>)}</div></section><Subscriptions compact onOpen={()=>onNavigate({page:"subscriptions"})} />
<PcStatus refreshMs={refreshMs} compact /></aside></div></div>;
}
