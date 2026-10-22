import { WeeklyPlan } from "./components/WeeklyPlan";
import { nativeNavigation } from "./nativeNavigation";
import { FooterTicker } from "./components/FooterTicker";
import { UpdateNotice } from "./components/UpdateNotice";
import { Subscriptions } from "./components/Subscriptions";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
const ConversationHistory = lazy(() => import("./components/ConversationHistory").then(module => ({ default: module.ConversationHistory })));
import { useConversations } from "./useConversations";
const AckAi = lazy(() => import("./components/AckAi").then(module => ({ default: module.AckAi })));
import { Icon } from "./components/Icon";
import { Projects } from "./components/Projects";
import { Sidebar, type Page } from "./components/Sidebar";
const Settings = lazy(() => import("./components/Settings").then(module => ({ default: module.Settings })));
import { Tasks } from "./components/Tasks";
import { Tools } from "./components/Tools";
const Notes = lazy(() => import("./components/Notes").then(module => ({ default: module.Notes })));
const QrTool = lazy(() => import("./components/QrTool").then(module => ({ default: module.QrTool })));
const IpTool = lazy(() => import("./components/IpTool").then(module => ({ default: module.IpTool })));
import { Shortcuts } from "./components/Shortcuts";

import { PcStatus } from "./components/PcStatus";
const SpeedTest = lazy(() => import("./components/SpeedTest").then(module => ({ default: module.SpeedTest })));
const Archive = lazy(() => import("./components/Archive").then(module => ({ default: module.Archive })));
import { loadPreferences } from "./preferences";
import { invoke } from "@tauri-apps/api/core";
import { collectAckContext } from "./ackIntegration";
import { sendGeminiMessage, getGeminiKeyStatus, type AiMessage } from "./geminiClient";
import { redactSecrets } from "./privacy";
import { saveConversation, type Conversation } from "./conversationStore";
import { phoneRequest } from "./phoneClient";
import { recordActivity } from "./activityStore";
import { saveInboxIndex, loadInboxIndex, type InboxReference } from "./productIntelligence";

import { loadProjectSnapshot, saveProjects, type Project } from "./projectStore";
import "./App.css";
import "./content-polish.css";
import "./desktop-layout.css";

function App() {
  const [preferences, setPreferences] = useState(loadPreferences);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme ?? "dark";
  }, [preferences.theme]);
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
    const next = nativeNavigation(target); if (next) navigate(next);
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

  function showDesktopNotification(title: string, body: string) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body });
      }
    } catch {}
    try {
      const text = body ? `${title}: ${body}`.slice(0, 160) : title.slice(0, 160);
      void invoke("sync_task_reminders", {
        reminders: [{ id: "notice:" + crypto.randomUUID(), text, dueAt: Date.now() }]
      });
    } catch {}
  }

  const desktopInitialized = useRef(false);
  if (desktop.visible) desktopInitialized.current = true;

  const processingAiIds = useRef<Set<string>>(new Set());
  const notifiedPhoneItems = useRef<Set<string>>(new Set());

  const processMobileAiPrompt = async (item: InboxReference) => {
    if (processingAiIds.current.has(item.id)) return;
    processingAiIds.current.add(item.id);

    const hasKey = await getGeminiKeyStatus().catch(() => false);
    if (!hasKey) {
      setNotice("Gemini API anahtarı ekli olmadığı için mobil not işlenemedi.");
      return;
    }

    const noteContent = item.title || "Mobil Not";
    const promptText = `Bana mobilden şöyle bir not/istek bırakmıştın:
> "${noteContent}"

Bu notu değerlendir. Eğer analiz edebileceğin, özet çıkarabileceğin, araştırabileceğin veya görevlere dönüştürebileceğin bir konuysa doğrudan işle ve sonucunu üret. Eğer doğrudan aksiyon alınamayacak kişisel bir hatırlatma veya bilgi notuysa samimi bir dille "Hacı sen buraya atmıştın, haberin olsun, unutma!" diyerek içeriği bana hatırlat.`;

    setNotice(`📲 Mobilden gelen not ACK AI ile işleniyor: "${noteContent}"`);

    try {
      const { context } = await collectAckContext(promptText);
      const userMsg: AiMessage = { role: "user", text: redactSecrets(promptText) };
      const reply = await sendGeminiMessage([userMsg], "fast", context, false, []);
      const cleanReply = redactSecrets(reply.text.trim());
      const modelMsg: AiMessage = {
        role: "model",
        text: cleanReply,
        sources: [...new Set(context.map(c => c.source))],
      };

      const threadId = crypto.randomUUID();
      const now = Date.now();
      const newThread: Conversation = {
        id: threadId,
        title: "📲 " + noteContent.slice(0, 50),
        createdAt: now,
        updatedAt: now,
        messages: [userMsg, modelMsg],
        model: "fast",
      };

      await saveConversation(newThread);
      window.dispatchEvent(new CustomEvent("ack-conversations-changed", { detail: { selectId: threadId } }));

      await phoneRequest("handled", { id: item.id }).catch(() => {});
      const currentList = loadInboxIndex() ?? [];
      saveInboxIndex(currentList.map(i => i.id === item.id ? { ...i, handled: 1 } : i));
      recordActivity({
        source: "inbox",
        recordId: item.id,
        label: noteContent,
        kind: "processed",
      });
      window.dispatchEvent(new Event("ack-data-changed"));

      const shortSummary = cleanReply.slice(0, 100).replace(/\n/g, " ");
      showDesktopNotification("ACK AI: Mobilden notun işlendi", `"${noteContent}": ${shortSummary}`);
      setNotice(`🤖 ACK AI: Mobilden bıraktığın not işlendi! Çıktı sohbette seni bekliyor.`);
    } catch (err) {
      setNotice(`ACK AI mobil notunu işleyemedi: ${err instanceof Error ? err.message : "Hata oluştu"}`);
    }
  };

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const checkIncomingItems = () => {
      const inboxList = loadInboxIndex();
      if (!inboxList) return;

      // 1. Unhandled AI Prompts: Process in background and notify with output
      const unhandledAi = inboxList.find(item => !item.handled && item.kind === "ai_prompt" && !processingAiIds.current.has(item.id));
      if (unhandledAi) {
        void processMobileAiPrompt(unhandledAi);
      }

      // 2. Unhandled other incoming items (text, link, audio, image, file): Notify on PC open / sync
      const unhandledNonAi = inboxList.filter(item => !item.handled && item.kind !== "ai_prompt" && !notifiedPhoneItems.current.has(item.id));
      for (const item of unhandledNonAi) {
        notifiedPhoneItems.current.add(item.id);
        const kindLabels: Record<string, string> = {
          text: "Metin Notu",
          link: "Bağlantı",
          audio: "Sesli Not",
          image: "Fotoğraf",
          file: "Dosya",
        };
        const label = kindLabels[item.kind] || "İçerik";
        const itemTitle = item.title || "Yeni öğe";
        showDesktopNotification("Telefondan Yeni Öğe", `${label}: "${itemTitle}"`);
        setNotice(`📲 Telefondan yeni ${label.toLowerCase()} geldi: "${itemTitle}"`);
      }
    };

    window.addEventListener("ack-data-changed", checkIncomingItems);
    const timer = window.setTimeout(checkIncomingItems, 1500);
    return () => {
      window.removeEventListener("ack-data-changed", checkIncomingItems);
      window.clearTimeout(timer);
    };
  }, []);

  const pageViews: Record<Page, ReactNode> = {
    home: <Dashboard projects={projects} refreshMs={preferences.pcRefreshMs} onNavigate={navigate} onAskAi={askAi} onOpenSearch={() => setSearchOpen(true)} />,
    ai: <div className="ai-history-layout"><ConversationHistory history={{ ...history, newChat: () => { setAiPrompt(undefined); history.newChat(); }, select: id => { setAiPrompt(undefined); history.select(id); } }} disabled={aiBusy} />{history.ready ? <AckAi prefill={phoneAiDraft} onPrefillConsumed={() => setPhoneAiDraft(undefined)} key={history.activeId || "unsaved"} blocked={history.mutating} onNewChat={() => { setAiPrompt(undefined); history.newChat(); }} onBusyChange={setAiBusy} messages={history.messages} initialPrompt={aiPrompt} onPromptConsumed={consumeAiPrompt} onMessagesChange={history.setMessages} onOpenSettings={() => setPage("settings")} onNavigate={navigate} /> : <p role="status">{history.error || "Sohbetler yükleniyor..."}</p>}</div>,
    settings: <Settings preferences={preferences} onPreferencesChange={setPreferences} desktop={desktop.status} onDesktopChange={desktop.setStatus} />,
    inbox: <PhoneInbox initialId={route.target.id} onAiDraft={(text,attachment) => { setAiPrompt(undefined); setPhoneAiDraft({id:crypto.randomUUID(),text,attachment}); navigate({page:"ai"}); }} />,
    workspaces: <Projects projects={projects} onChange={changeProjects} fullPage workspaceId={route.target.id} onNavigate={navigate} onAskAi={askAi} />,
    subscriptions: <Subscriptions initialId={route.target.id} />,
    calendar: <WeeklyPlan onNavigate={navigate} onAskAi={askAi} />,
    tasks: <Tasks fullPage initialId={route.target.id} focusNew={route.target.intent === "new-task"} initialDate={route.target.date} />,
    projects: <Projects projects={projects} onChange={changeProjects} fullPage initialId={route.target.id} onNavigate={navigate} onAskAi={askAi} />,
    tools: <Tools fullPage onOpen={setPage} />,
    notes: <Notes initialId={route.target.id} createNew={route.target.intent === "new-note"} />,
    qr: <QrTool />,
    ip: <IpTool />,
    pc: <section><h1>PC Durumu</h1><PcStatus refreshMs={preferences.pcRefreshMs} /></section>,
    files: <Shortcuts initialId={route.target.id} />,
    speed: <SpeedTest authorizedStart={route.target.intent === "start-speed"} />,
    archive: <Archive initialId={route.target.id} createNew={route.target.intent === "new-archive"} />,
  };

  return <><div className="app-shell" inert={restoring}>
    <Sidebar activePage={page === "qr" || page === "ip" || page === "speed" || page === "pc" || page === "archive" || page === "files" ? "tools" : page === "workspaces" ? "projects" : page} onNavigate={setPage} />
    <div className="main-column"><UpdateNotice blocked={restoring || aiBusy} hidden={page === "settings"} /><main className={"main-content " + (page === "home" ? "dashboard-main" : "")}>
      {desktop.visible && page !== "home" && <button className="global-search-trigger button button-secondary" type="button" onClick={() => setSearchOpen(true)}>Genel Arama <kbd>Ctrl+K</kbd></button>}
      {(desktopInitialized.current || desktop.visible) && (
        <>
          <div style={{ display: page === "ai" ? "block" : "none", height: "100%" }}>
            <Suspense fallback={<div className="page-skeleton" role="status" aria-label="Sayfa yükleniyor"><div/><div/><div/><span className="sr-only">Sayfa yükleniyor</span></div>}>
              {pageViews.ai}
            </Suspense>
          </div>
          {page !== "ai" && (
            <div key={route.serial}>
              <Suspense fallback={<div className="page-skeleton" role="status" aria-label="Sayfa yükleniyor"><div/><div/><div/><span className="sr-only">Sayfa yükleniyor</span></div>}>
                {pageViews[page]}
              </Suspense>
            </div>
          )}
        </>
      )}
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
