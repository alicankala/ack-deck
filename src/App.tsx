import { WeeklyPlan } from "./components/WeeklyPlan";
import { FooterTicker } from "./components/FooterTicker";
import { UpdateNotice } from "./components/UpdateNotice";
import { Subscriptions } from "./components/Subscriptions";
import { useCallback, useEffect, useState } from "react";
import { useDesktop } from "./useDesktop";
import { getDesktopStatus } from "./desktopClient";
import { usePhoneCompanion } from "./usePhoneCompanion";
import { PhoneInbox } from "./components/PhoneInbox";
import { PhoneCommands } from "./components/PhoneCommands";
import { useReminders } from "./useReminders";
import { usePaletteBridge } from "./usePaletteBridge";
import { GlobalSearch } from "./components/GlobalSearch";
import { useNavigationHistory } from "./useNavigationHistory";
import { Dashboard } from "./components/Dashboard";
import type { AiPromptHandoff } from "./aiPromptHandoff";
import { UndoToast } from "./components/UndoToast";
import { ConversationHistory } from "./components/ConversationHistory";
import { useConversations } from "./useConversations";
import { AckAi } from "./components/AckAi";
import { Icon } from "./components/Icon";
import { Projects } from "./components/Projects";
import { Sidebar, type Page } from "./components/Sidebar";
import { Settings } from "./components/Settings";
import { Tasks } from "./components/Tasks";
import { Tools } from "./components/Tools";
import { Notes } from "./components/Notes";
import { QrTool } from "./components/QrTool";
import { IpTool } from "./components/IpTool";
import { Shortcuts } from "./components/Shortcuts";

import { PcStatus } from "./components/PcStatus";
import { SpeedTest } from "./components/SpeedTest";
import { Archive } from "./components/Archive";
import { loadPreferences } from "./preferences";

import { loadProjectSnapshot, saveProjects, type Project } from "./projectStore";
import "./App.css";
import "./desktop-layout.css";

function App() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const { route, navigate } = useNavigationHistory({ page: preferences.startPage }, () => restoring || aiBusy || searchOpen || history.mutating || !desktop.visible);
  const page = route.target.page;
  const setPage = (page: Page) => navigate({ page });
  usePaletteBridge(navigate);
  const [searchOpen, setSearchOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreBlocked, setRestoreBlocked] = useState(false);
  useEffect(() => { const blocked = () => { setRestoreBlocked(true); setRestoring(true); }; window.addEventListener("ack-restore-blocked", blocked); return () => window.removeEventListener("ack-restore-blocked", blocked); }, []);
  useEffect(() => { const active = (event: Event) => { setRestoring((event as CustomEvent).detail === true); setSearchOpen(false); }; window.addEventListener("ack-restore-active", active); return () => window.removeEventListener("ack-restore-active", active); }, []);
  const navigateNative = useCallback((target: string) => {
    if (target === "new-task") navigate({ page: "tasks", intent: "new-task" });
    else if (target === "ai") navigate({ page: "ai" });
  }, [navigate]);
  const desktop = useDesktop(navigateNative);
  const history = useConversations();
  const [aiBusy, setAiBusy] = useState(false);
  const [phoneAiDraft, setPhoneAiDraft] = useState<{id:string;text:string;attachment?:import("./aiAttachments").AiAttachment}>();
  const [aiPrompt, setAiPrompt] = useState<AiPromptHandoff>();
  const consumeAiPrompt = useCallback((id: string) => setAiPrompt(current => current?.id === id ? undefined : current), []);
  const askAi = (text: string) => { setAiPrompt({ id: crypto.randomUUID(), text }); navigate({ page: "ai" }); };
  useEffect(() => { const question = (event: Event) => { const text = (event as CustomEvent).detail; if (typeof text === "string" && text.length <= 200) { setAiPrompt({ id: crypto.randomUUID(), text }); navigate({ page: "ai" }); } }; window.addEventListener("ack-ai-question", question); return () => window.removeEventListener("ack-ai-question", question); }, [navigate]);
  const [projectStorage, setProjectStorage] = useState(loadProjectSnapshot);
  const [projects, setProjects] = useState<Project[]>(projectStorage.entries);
  const [notice, setNotice] = useState(projectStorage.warning ?? "");
  useEffect(() => { const refresh = () => { const value = loadProjectSnapshot(); setProjectStorage(value); setProjects(value.entries); }; window.addEventListener("ack-data-changed", refresh); return () => window.removeEventListener("ack-data-changed", refresh); }, []);
  useReminders(setNotice);
  usePhoneCompanion(restoring, setNotice);
  useEffect(() => { const restored = (event: Event) => { const value = loadProjectSnapshot(); setProjectStorage(value); setProjects(value.entries); setPreferences(loadPreferences());  setAiPrompt(undefined); navigate({ page: "settings" }); void getDesktopStatus().then(desktop.setStatus).catch(() => {}); setNotice((event as CustomEvent).detail === "rollback" ? "Geri yükleme tamamlanamadı; önceki kayıtlar geri getirildi." : "Yedek başarıyla geri yüklendi."); }; window.addEventListener("ack-data-restored", restored); return () => window.removeEventListener("ack-data-restored", restored); }, [navigate, desktop.setStatus]);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (!restoring && event.ctrlKey && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, [restoring]);
  useEffect(() => { if (!desktop.visible) setSearchOpen(false); }, [desktop.visible]);
  function changeProjects(next: Project[]) {
    if (!saveProjects(next, loadProjectSnapshot())) { setNotice("Projeler kaydedilemedi. Mevcut veriler korunuyor."); return false; }
    setProjects(next); return true;
  }
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return <><div className="app-shell" inert={restoring}>
    <Sidebar activePage={page === "qr" || page === "ip" || page === "speed" || page === "pc" || page === "archive" || page === "files" ? "tools" : page === "workspaces" ? "projects" : page} onNavigate={setPage} />
    <div className="main-column"><UpdateNotice blocked={restoring || aiBusy} hidden={page === "settings"} /><main className={"main-content " + (page === "home" ? "dashboard-main" : "")}>
      {desktop.visible && page !== "home" && <button className="global-search-trigger button button-secondary" type="button" onClick={() => setSearchOpen(true)}>Genel Arama <kbd>Ctrl+K</kbd></button>}
      <div key={route.serial}>
      {!desktop.visible ? null : page === "home" ? <Dashboard projects={projects} refreshMs={preferences.pcRefreshMs} onNavigate={navigate} onAskAi={askAi} onOpenSearch={() => setSearchOpen(true)} /> : page === "ai" ? <div className="ai-history-layout"><ConversationHistory history={{ ...history, newChat: () => { setAiPrompt(undefined); history.newChat(); }, select: id => { setAiPrompt(undefined); history.select(id); } }} disabled={aiBusy} />{history.ready ? <AckAi prefill={phoneAiDraft} onPrefillConsumed={() => setPhoneAiDraft(undefined)} key={history.activeId || "unsaved"} blocked={history.mutating} onNewChat={() => { setAiPrompt(undefined); history.newChat(); }} onBusyChange={setAiBusy} messages={history.messages} initialPrompt={aiPrompt} onPromptConsumed={consumeAiPrompt} onMessagesChange={history.setMessages} onOpenSettings={() => setPage("settings")} onNavigate={navigate} /> : <p role="status">{history.error || "Sohbetler yükleniyor..."}</p>}</div> : page === "settings" ? <Settings preferences={preferences} onPreferencesChange={setPreferences} desktop={desktop.status} onDesktopChange={desktop.setStatus} /> : page === "inbox" ? <PhoneInbox initialId={route.target.id} onAiDraft={(text,attachment) => { setAiPrompt(undefined); setPhoneAiDraft({id:crypto.randomUUID(),text,attachment}); navigate({page:"ai"}); }} /> : page === "workspaces" ? <Projects projects={projects} onChange={changeProjects} fullPage workspaceId={route.target.id} onNavigate={navigate} onAskAi={askAi} /> : page === "subscriptions" ? <Subscriptions initialId={route.target.id} /> : page === "calendar" ? <WeeklyPlan onNavigate={navigate} onAskAi={askAi} /> : page === "tasks" ? <Tasks fullPage initialId={route.target.id} focusNew={route.target.intent === "new-task"} initialDate={route.target.date} /> : page === "projects" ? <Projects projects={projects} onChange={changeProjects} fullPage initialId={route.target.id} onNavigate={navigate} onAskAi={askAi} /> : page === "tools" ? <Tools fullPage onOpen={setPage} /> : page === "notes" ? <Notes initialId={route.target.id} createNew={route.target.intent === "new-note"} /> : page === "qr" ? <QrTool /> : page === "ip" ? <IpTool /> : page === "pc" ? <section><h1>PC Durumu</h1><PcStatus refreshMs={preferences.pcRefreshMs} /></section> : page === "files" ? <Shortcuts initialId={route.target.id} /> : page === "speed" ? <SpeedTest authorizedStart={route.target.intent === "start-speed"} /> : <Archive initialId={route.target.id} createNew={route.target.intent === "new-archive"} />}
      </div>
    </main>
    {desktop.visible && !restoring && <FooterTicker />}
    </div>
    <PhoneCommands paused={restoring} onNotice={setNotice} />
    {searchOpen && desktop.visible && !restoring && <GlobalSearch onNavigate={navigate} onClose={() => setSearchOpen(false)} />}
    <UndoToast />
    {notice && <div className="toast" role="status"><Icon name="info" size={17} />{notice}</div>}
  </div>{restoring && <div className="restore-overlay" role={restoreBlocked ? "alert" : "status"}>{restoreBlocked ? "Geri yükleme kurtarılamadı. Kurtarma kaydı korunuyor. ACKDeck'i kapatıp yeniden açın; kurtarma tamamlanana kadar değişiklik yapamazsınız." : "Veriler güvenli biçimde geri yükleniyor. Lütfen bekleyin."}</div>}</>;
}

export default App;
