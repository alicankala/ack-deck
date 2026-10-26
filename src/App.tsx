import { nativeNavigation } from "./nativeNavigation";
import { FooterTicker } from "./components/FooterTicker";
import { UpdateNotice } from "./components/UpdateNotice";
import { Subscriptions } from "./components/Subscriptions";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDesktop } from "./useDesktop";
import { getDesktopStatus } from "./desktopClient";
import { usePhoneCompanion } from "./usePhoneCompanion";
import { PhoneCommands } from "./components/PhoneCommands";
import { useReminders } from "./useReminders";
import { usePaletteBridge } from "./usePaletteBridge";
import { useNavigationHistory } from "./useNavigationHistory";
import { Dashboard } from "./components/Dashboard";
import type { AiPromptHandoff } from "./aiPromptHandoff";
import { UndoToast } from "./components/UndoToast";
const ConversationHistory = lazy(() => import("./components/ConversationHistory").then(module => ({ default: module.ConversationHistory })));
import { useConversations } from "./useConversations";
const AckAi = lazy(() => import("./components/AckAi").then(module => ({ default: module.AckAi })));
import { Icon } from "./components/Icon";
const Projects = lazy(() => import("./components/Projects").then(module => ({ default: module.Projects })));
const WeeklyPlan = lazy(() => import("./components/WeeklyPlan").then(module => ({ default: module.WeeklyPlan })));
const Tasks = lazy(() => import("./components/Tasks").then(module => ({ default: module.Tasks })));
const PhoneInbox = lazy(() => import("./components/PhoneInbox").then(module => ({ default: module.PhoneInbox })));
import { Sidebar, type Page } from "./components/Sidebar";
const Settings = lazy(() => import("./components/Settings").then(module => ({ default: module.Settings })));
const Notes = lazy(() => import("./components/Notes").then(module => ({ default: module.Notes })));
import { useAutoBackup } from "./useAutoBackup";
import { loadPreferences } from "./preferences";
import { invoke, isTauri } from "@tauri-apps/api/core";
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
  const { route, navigate } = useNavigationHistory({ page: preferences.startPage }, () => restoring || aiBusy || history.mutating);
  const page = route.target.page;
  const setPage = (page: Page) => navigate({ page });
  usePaletteBridge(navigate);
  useAutoBackup();

  useEffect(() => {
    if (isTauri()) {
      invoke("clear_notifications").catch(() => {});
      const onFocus = () => {
        invoke("clear_notifications").catch(() => {});
      };
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    }
  }, []);
  const [restoring, setRestoring] = useState(false);
  const [restoreBlocked, setRestoreBlocked] = useState(false);
  useEffect(() => { const blocked = () => { setRestoreBlocked(true); setRestoring(true); }; window.addEventListener("ack-restore-blocked", blocked); return () => window.removeEventListener("ack-restore-blocked", blocked); }, []);
  useEffect(() => { const active = (event: Event) => { setRestoring((event as CustomEvent).detail === true); }; window.addEventListener("ack-restore-active", active); return () => window.removeEventListener("ack-restore-active", active); }, []);
  const navigateNative = useCallback((target: string) => {
    const next = nativeNavigation(target); if (next) navigate(next);
  }, [navigate]);
  const desktop = useDesktop(navigateNative);
  const history = useConversations();

  useEffect(() => {
    if (route.target.page === "ai" && route.target.id) {
      history.select(route.target.id);
    }
  }, [route.target.page, route.target.id, history.select]);

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
  function changeProjects(next: Project[]) {
    if (!saveProjects(next, loadProjectSnapshot())) { setNotice("Projeler kaydedilemedi. Mevcut veriler korunuyor."); return false; }
    setProjects(next); return true;
  }
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function showDesktopNotification(title: string, body: string, target?: string) {
    if (isTauri()) {
      invoke("notify_desktop", { title, body, target: target ?? null }).catch(() => {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const notif = new Notification(title, { body });
            notif.onclick = () => {
              void invoke("show_main_window", { target: target ?? null }).catch(() => {});
              window.focus();
              if (target) navigateNative(target);
            };
          }
        } catch {}
      });
      return;
    }
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const notif = new Notification(title, { body });
        notif.onclick = () => {
          window.focus();
          if (target) navigateNative(target);
        };
      }
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

    const noteContent = item.title || "Mobil İstek";
    const userPrompt = noteContent.trim();

    setNotice(`📲 Mobilden gelen not ACK AI ile işleniyor: "${userPrompt.slice(0, 40)}"`);

    try {
      const { context } = await collectAckContext(userPrompt);
      const userMsg: AiMessage = { role: "user", text: redactSecrets(userPrompt) };
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
        title: "📲 " + userPrompt.slice(0, 50),
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
        label: userPrompt,
        kind: "processed",
      });
      window.dispatchEvent(new Event("ack-data-changed"));

      const shortSummary = cleanReply.slice(0, 120).replace(/\s+/g, " ");
      showDesktopNotification("ACK AI: Mobilden notun işlendi", `"${userPrompt.slice(0, 35)}": ${shortSummary}`, `ai:${threadId}`);
      setNotice(`🤖 ACK AI: Mobilden attığın "${userPrompt.slice(0, 35)}" işlendi! Çıktı sohbette hazır.`);
    } catch (err) {
      setNotice(`ACK AI mobil notunu işleyemedi: ${err instanceof Error ? err.message : "Hata oluştu"}`);
    }
  };

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const checkIncomingItems = (overrideList?: InboxReference[]) => {
      const inboxList = overrideList || loadInboxIndex();
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
        showDesktopNotification("Telefondan Yeni Öğe", `${label}: "${itemTitle}"`, `inbox:${item.id}`);
        setNotice(`📲 Telefondan yeni ${label.toLowerCase()} geldi: "${itemTitle}"`);
      }
    };

    const refreshInboxNow = async () => {
      try {
        const res = await phoneRequest<{ items: InboxReference[] }>("inbox");
        if (res?.items && Array.isArray(res.items)) {
          saveInboxIndex(res.items);
          checkIncomingItems(res.items);
        }
      } catch {}
    };

    void refreshInboxNow();
    window.addEventListener("ack-data-changed", () => checkIncomingItems());
    window.addEventListener("ack-inbox-updated", () => checkIncomingItems());
    const initialTimer = window.setTimeout(refreshInboxNow, 2000);
    const pollInterval = window.setInterval(refreshInboxNow, 25000);

    return () => {
      window.removeEventListener("ack-data-changed", () => checkIncomingItems());
      window.removeEventListener("ack-inbox-updated", () => checkIncomingItems());
      window.clearTimeout(initialTimer);
      window.clearInterval(pollInterval);
    };
  }, []);

  const currentTool: "converter" | "speed" | "ip" | "qr" = page === "speed" ? "speed" : page === "ip" ? "ip" : page === "qr" ? "qr" : "converter";
  const projectsView = <Projects projects={projects} onChange={changeProjects} fullPage initialId={route.target.id} initialTool={currentTool} onNavigate={navigate} onAskAi={askAi} />;

  const pageViews: Record<Page, ReactNode> = {
    home: <Dashboard targetId={route.target.id} projects={projects} refreshMs={preferences.pcRefreshMs} onNavigate={navigate} onAskAi={askAi} />,
    ai: <div className="ai-history-layout"><ConversationHistory history={{ ...history, newChat: () => { setAiPrompt(undefined); history.newChat(); }, select: id => { setAiPrompt(undefined); history.select(id); } }} disabled={aiBusy} />{history.ready ? <AckAi prefill={phoneAiDraft} onPrefillConsumed={() => setPhoneAiDraft(undefined)} key={history.activeId || "unsaved"} blocked={history.mutating} onNewChat={() => { setAiPrompt(undefined); history.newChat(); }} onBusyChange={setAiBusy} messages={history.messages} initialPrompt={aiPrompt} onPromptConsumed={consumeAiPrompt} onMessagesChange={history.setMessages} onOpenSettings={() => setPage("settings")} onNavigate={navigate} /> : <p role="status">{history.error || "Sohbetler yükleniyor..."}</p>}</div>,
    settings: <Settings preferences={preferences} onPreferencesChange={setPreferences} desktop={desktop.status} onDesktopChange={desktop.setStatus} />,
    inbox: <PhoneInbox initialId={route.target.id} onAiDraft={(text,attachment) => { setAiPrompt(undefined); setPhoneAiDraft({id:crypto.randomUUID(),text,attachment}); navigate({page:"ai"}); }} />,
    subscriptions: <Subscriptions initialId={route.target.id} />,
    calendar: <WeeklyPlan onNavigate={navigate} onAskAi={askAi} />,
    tasks: <Tasks fullPage initialId={route.target.id} focusNew={route.target.intent === "new-task"} initialDate={route.target.date} />,
    projects: projectsView,
    notes: <Notes initialId={route.target.id} createNew={route.target.intent === "new-note"} />,
    workspaces: projectsView,
    tools: projectsView,
    qr: projectsView,
    ip: projectsView,
    files: projectsView,
    speed: projectsView,
    pc: <Dashboard projects={projects} refreshMs={preferences.pcRefreshMs} onNavigate={navigate} onAskAi={askAi} />,
    archive: <Dashboard projects={projects} refreshMs={preferences.pcRefreshMs} onNavigate={navigate} onAskAi={askAi} />,
  };

  const activeSidebarPage = (["qr", "ip", "speed", "tools", "workspaces", "files"].includes(page)
    ? "projects"
    : ["pc", "archive"].includes(page)
    ? "home"
    : page) as Page;

  return <><div className="app-shell" inert={restoring}>
    <Sidebar activePage={activeSidebarPage} onNavigate={setPage} />
    <div className="main-column"><UpdateNotice blocked={restoring || aiBusy} hidden={page === "settings"} /><main className={"main-content " + (page === "home" ? "dashboard-main" : "")}>
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
                {pageViews[page] ?? pageViews.home}
              </Suspense>
            </div>
          )}
        </>
      )}
    </main>
    {desktop.visible && !restoring && <FooterTicker />}
    </div>
    <PhoneCommands paused={restoring} onNotice={setNotice} />
    <UndoToast />
    {notice && <div className="toast" role="status"><Icon name="info" size={17} />{notice}</div>}
  </div>{restoring && <div className="restore-overlay" role={restoreBlocked ? "alert" : "status"}>{restoreBlocked ? "Geri yükleme kurtarılamadı. Kurtarma kaydı korunuyor. ACKDeck'i kapatıp yeniden açın; kurtarma tamamlanana kadar değişiklik yapamazsınız." : "Veriler güvenli biçimde geri yükleniyor. Lütfen bekleyin."}</div>}</>;
}

export default App;
