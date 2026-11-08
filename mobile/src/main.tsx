import { MobilePrayerCard } from "./MobilePrayerCard";
import { MobileDormMenuCard } from "./MobileDormMenuCard";
import { MobilePomodoroCard } from "./MobilePomodoroCard";
import { MobileMediaTracker } from "./MobileMediaTracker";
import { MobileWeatherModal } from "./MobileWeatherModal";
import { MobileTimelineCard } from "./MobileTimelineCard";
import { MobileTasksCard } from "./MobileTasksCard";
import { MobilePlanView } from "./MobilePlanView";
import { MobileSendView, type MobileInboxItem } from "./MobileSendView";
import {
  MobilePairingScreen,
  MobileAppHeader,
  MobileTodayHero,
  MobileConflictCards,
  MobileToasts,
} from "./MobileShellParts";
import {
  dateKey,
  migrateLegacyMobileStorage,
  buildTaskMutationData,
  buildSnoozedTaskData,
  useMobileWeather,
  useMobileStudyAttendance,
  useMobileHashRouting,
} from "./mobileAppHelpers";
import { useCollapsedCards } from "./useCollapsedCards";
import { productMetadata } from "../../shared/productivity";
import { moveBy } from "../../src/reorder";
import { NoteAttachments } from "./NoteAttachments";
import { NoteEditor } from "./NoteEditor";
import { NotesList } from "./NotesList";
import { RecurrenceFields } from "../../shared/RecurrenceFields";
import { SubscriptionForm } from "../../shared/SubscriptionForm";
import type { Subscription } from "../../shared/subscriptions";
import {
  completeOccurrence,
  scheduleDate,
  isOccurrenceCompleted,
  uncompleteOccurrence,
  type Recurrence,
} from "../../shared/recurrence";
import { studyBlocks, type StudyProgram } from "../../shared/studyPrograms";
import { savePrayerConfig, type PrayerTimesConfig } from "../../shared/prayerTimes";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { MAX_ATTACHMENT, type CloudRecord, type PhoneTask, type PhoneNote, type Mutation } from "../../shared/phone";
import { api, emptyState, enqueue, json, readState, saveState, synchronize, type MobileState } from "./store";
import "./style.css";
import "./styles/prayer.css";
import "./styles/tasks-inbox.css";
import "./styles/editor-views.css";
import "./styles/timeline-settings.css";
import "./styles/cards-dorm-weather.css";
import "./styles/media-ai.css";
import "./styles/prayer-guide.css";
import "./styles/prayer-guide-details.css";
import "./styles/lock-pomodoro.css";
import "./styles/activity-overview.css";
import { saveActivityGoals, type ActivityGoals } from "../../shared/activityOverview";
import "./notes.css";
import { createAttachmentSender } from "./sendFlow";
import { MobileSettings } from "./MobileSettings";
import { MobileActivityOverview } from "./MobileActivityOverview";
import { MobileNav } from "./MobileNav";
import { MobileLockScreen } from "./MobileLockScreen";
import { isSecurityLocked, initAutoLockListener } from "./mobileSecurity";

function App() {
  const [state, setState] = useState<MobileState>(emptyState);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<string>("today");
  const { isCollapsed, toggle: toggleCard } = useCollapsedCards();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { weather, weatherModalOpen, setWeatherModalOpen, handleMobileChangeCity } = useMobileWeather(setNotice);

  const [form, setForm] = useState<"task" | "note" | "text" | "link" | "ai_prompt" | null>(null);
  const [editing, setEditing] = useState<CloudRecord | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reminder, setReminder] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [subscriptionDraft, setSubscriptionDraft] = useState<Subscription | null>(null);
  const [projectId, setProjectId] = useState("");
  const [reminderLead, setReminderLead] = useState(0);
  const [undo, setUndo] = useState<{ row: CloudRecord; expires: number } | null>(null);
  const [notificationTask, setNotificationTask] = useState(() => new URLSearchParams(location.hash.slice(1)).get("task"));

  const [planTab, setPlanTab] = useState<"calendar" | "subscriptions">("calendar");
  const [sendTab, setSendTab] = useState<"ai" | "send">("ai");

  const [studyReminders, setStudyReminders] = useState<{ id: string; leadMinutes: number | null }[]>(() => {
    try {
      const raw = localStorage.getItem("ack-deck.study-reminders.v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  function updateStudyReminder(programId: string, leadMinutes: number | null) {
    setStudyReminders(prev => {
      const next = [...prev.filter(x => x.id !== programId), { id: programId, leadMinutes }];
      try {
        localStorage.setItem("ack-deck.study-reminders.v1", JSON.stringify(next));
      } catch {}
      if (ref.current.token) {
        void api(ref.current, "study-reminders", json({ studyReminders: next })).catch(() => {});
      }
      return next;
    });
  }

  const formRequestId = useRef(crypto.randomUUID());
  const sending = useRef(false);
  const recordingStarting = useRef(false);
  const [inboxLoaded, setInboxLoaded] = useState(false);
  const [sendFeedback, setSendFeedback] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const attachmentSender = useRef<ReturnType<typeof createAttachmentSender> | null>(null);

  function changePage(next: string) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 1600);
    return () => clearTimeout(timer);
  }, [notice]);

  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get("pair") ?? "");
  const [name, setName] = useState("iPhone");
  const [online, setOnline] = useState(false);
  const [push, setPush] = useState(false);
  const [isLocked, setIsLocked] = useState(() => isSecurityLocked());

  useEffect(() => {
    const cleanup = initAutoLockListener();
    const handleLockState = () => setIsLocked(isSecurityLocked());
    window.addEventListener("ack-mobile-lock-state-changed", handleLockState);
    return () => {
      cleanup();
      window.removeEventListener("ack-mobile-lock-state-changed", handleLockState);
    };
  }, []);

  const [inbox, setInbox] = useState<MobileInboxItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);

  const editorRef = useRef<HTMLElement | null>(null);
  const subscriptionEditorRef = useRef<HTMLElement | null>(null);
  const closeFormRef = useRef(closeForm);
  closeFormRef.current = closeForm;

  useEffect(() => {
    const dialog = editorRef.current ?? subscriptionEditorRef.current;
    if (!dialog) {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      return;
    }
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "";
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary"
        )
      ).filter(el => el.getClientRects().length);
    if (!dialog.contains(document.activeElement)) controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeFormRef.current();
        setSubscriptionDraft(null);
      }
      if (event.key!=="Tab") return;
      const all = controls(),
        first = all[0],
        last = all[all.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    let rAF: number | null = null;
    const resize = () => {
      if (dialog.classList.contains("note-editor")) {
        dialog.style.top = "0px";
        dialog.style.bottom = "0px";
        dialog.style.left = "0px";
        dialog.style.right = "0px";
        dialog.style.height = "100%";
        return;
      }
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const vt = window.visualViewport?.offsetTop ?? 0;
      dialog.style.height = `${vh}px`;
      dialog.style.top = `${vt}px`;
    };
    const scheduleResize = () => {
      if (rAF !== null) return;
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        rAF = window.requestAnimationFrame(() => {
          rAF = null;
          resize();
        });
      } else {
        resize();
      }
    };
    resize();
    window.visualViewport?.addEventListener("resize", scheduleResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleResize, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      if (rAF !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(rAF);
        rAF = null;
      }
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", key);
      window.visualViewport?.removeEventListener("resize", scheduleResize);
      window.visualViewport?.removeEventListener("scroll", scheduleResize);
      previous?.focus();
    };
  }, [!!form, !!subscriptionDraft]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), Math.max(0, undo.expires - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);

  const ref = useRef(state);
  const locked = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  ref.current = state;

  async function commit(value: MobileState) {
    await saveState(value);
    ref.current = value;
    setState(value);
  }

  const lastSyncTimeRef = useRef<number>(Date.now());
  const resumeTimerRef = useRef<number | null>(null);
  const RESUME_SYNC_THRESHOLD_MS = 30_000;

  async function refresh(value = ref.current, silent = false) {
    if (!value.token || locked.current) return;
    locked.current = true;
    if (!silent) {
      setBusy(true);
      setError("");
    }
    const startTime = Date.now();
    try {
      const next = await synchronize(value);
      ref.current = next;
      setState(next);
      lastSyncTimeRef.current = Date.now();
      const [status, list] = await Promise.all([
        api<{
          online: boolean;
          notifications: boolean;
          prayerConfig?: PrayerTimesConfig;
          studyReminders?: { id: string; leadMinutes: number | null }[];
          activityGoals?: ActivityGoals;
        }>(next, "status"),
        api<{ items: MobileInboxItem[] }>(next, "inbox"),
      ]);
      setOnline(status.online);
      setPush(status.notifications);
      setInbox(list.items);
      setInboxLoaded(true);
      if (status.prayerConfig && typeof status.prayerConfig === "object" && status.prayerConfig.city) {
        savePrayerConfig(status.prayerConfig);
      }
      if (Array.isArray(status.studyReminders)) {
        setStudyReminders(status.studyReminders);
        try {
          localStorage.setItem("ack-deck.study-reminders.v1", JSON.stringify(status.studyReminders));
        } catch {}
      }
      if (status.activityGoals && typeof status.activityGoals === "object") {
        saveActivityGoals(status.activityGoals);
      }
      if (!silent) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 350) await new Promise(r => setTimeout(r, 350 - elapsed));
        const timeStr = new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setNotice(next.conflicts.length ? "Eşitleme çakışması var; iki sürüm de korundu." : "Eşitlendi");
      } else if (next.conflicts.length) {
        setNotice("Eşitleme çakışması var; iki sürüm de korundu.");
      }
    } catch (e) {
      if (!silent) {
        setError(
          navigator.onLine
            ? e instanceof Error
              ? e.message
              : "Eşitleme tamamlanamadı."
            : "Çevrimdışı — bağlantı gelince eşitlenecek."
        );
      }
      try {
        const saved = await readState();
        ref.current = saved;
        setState(saved);
      } catch {}
    } finally {
      locked.current = false;
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void readState()
      .then(async value => {
        if (active) {
          const initial = await migrateLegacyMobileStorage(value);
          ref.current = initial;
          setState(initial);
          setName(initial.name);
          setReady(true);
          void refresh(initial);
        }
      })
      .catch(() => setError("Telefon kayıtları okunamadı. Mevcut veriler korundu."));
    const reconnect = () => void refresh();
    window.addEventListener("online", reconnect);
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  async function checkOnlineStatus() {
    if (!ref.current.token || document.hidden || !navigator.onLine || locked.current) return;
    try {
      const res = await api<{ online: boolean }>(ref.current, "status");
      setOnline(res.online);
    } catch {}
  }

  async function handleResumeSync() {
    if (document.hidden || !ref.current.token || !navigator.onLine) return;
    if (Date.now() - lastSyncTimeRef.current >= RESUME_SYNC_THRESHOLD_MS) {
      await refresh(ref.current, true);
    } else {
      await checkOnlineStatus();
    }
  }

  useEffect(() => {
    const triggerResumeCheck = () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = window.setTimeout(() => void handleResumeSync(), 120);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (recorder.current && recorder.current.state !== "inactive") {
          recorder.current.stop();
          stream.current?.getTracks().forEach(track => track.stop());
        }
      } else {
        triggerResumeCheck();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", triggerResumeCheck);
    const poller = setInterval(() => void checkOnlineStatus(), 15000);
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", triggerResumeCheck);
      clearInterval(poller);
    };
  }, []);

  useEffect(() => {
    if (
      (page !== "send" || sendTab !== "send") &&
      page !== "inbox" &&
      recorder.current &&
      recorder.current.state !== "inactive"
    ) {
      recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    }
  }, [page, sendTab]);

  async function pair(event: FormEvent) {
    event.preventDefault();
    if (!ready || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string }>(state, "pair/exchange", json({ code: code.trim(), name: name.trim() }));
      const next = { ...state, token: result.token, name: name.trim() };
      await commit(next);
      history.replaceState(null, "", location.pathname);
      setCode("");
      setNotice("Telefon eşleştirildi.");
      locked.current = false;
      void refresh(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eşleştirme tamamlanamadı.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function openForm(kind: NonNullable<typeof form>, row: CloudRecord | null = null) {
    const task = row?.kind === "tasks" ? (row.data as PhoneTask) : null;
    setProjectId((row?.data as PhoneNote | PhoneTask | undefined)?.projectId ?? "");
    setReminderLead(task?.reminderLeadMinutes ?? 0);
    setError("");
    formRequestId.current = crypto.randomUUID();
    setForm(kind);
    setEditing(row);
    setTitle(row?.kind === "notes" ? (row.data as PhoneNote).title : task?.text ?? "");
    setContent(row?.kind === "notes" ? (row.data as PhoneNote).content : "");
    setDate(task?.dueDate ?? "");
    setTime(task?.dueTime ?? "");
    setReminder(task?.reminder ?? false);
    setRecurrence(task?.recurrence ?? null);
  }

  async function saveMutation(mutation: Mutation) {
    if (locked.current) throw new Error("Eşitleme sürüyor. Biraz sonra deneyin.");
    if (form && editing && mutation.kind === editing.kind && mutation.id === editing.id) {
      const latest = ref.current.records.find(r => r.kind === editing.kind && r.id === editing.id);
      if (!latest || latest.deleted || latest.version !== editing.version)
        throw new Error("Kayıt başka bir cihazda değişti. Taslağın burada; güncel kaydı yeniden açıp kontrol et.");
    }
    locked.current = true;
    let next: MobileState;
    try {
      next = enqueue(ref.current, mutation);
      await commit(next);
    } finally {
      locked.current = false;
    }
    setNotice(navigator.onLine ? "Kaydedildi; eşitleniyor…" : "Çevrimdışı — bağlantı gelince eşitlenecek.");
    void refresh(next);
  }

  const { attendance, toggleMobileStudyBlock } = useMobileStudyAttendance({
    ready,
    records: state.records,
    isLockedRef: locked,
    getLatestRecords: () => ref.current.records,
    saveMutation,
  });

  useEffect(() => {
    const taskId = notificationTask;
    if (!taskId || !ready) return;
    const row = state.records.find(item => item.kind === "tasks" && item.id === taskId && !item.deleted);
    if (row) {
      setPage("today");
      openForm("task", row);
      history.replaceState(null, "", location.pathname);
      setNotificationTask(null);
    }
  }, [ready, state.records, notificationTask]);

  useMobileHashRouting({ setPage, setPlanTab, setSendTab, setNotificationTask });

  function closeForm() {
    if (busy || sending.current) return;
    const previous = editing?.data as PhoneNote | undefined;
    if (
      form === "note" &&
      (title !== (previous?.title ?? "") || content !== (previous?.content ?? "")) &&
      !confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi? Kaydet düğmesiyle kaydedebilirsin.")
    )
      return;
    if (form && !["note", "task"].includes(form) && content.trim() && !confirm("Gönderilmemiş içerikten vazgeçilsin mi?"))
      return;
    setForm(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || busy) return;
    sending.current = true;
    const isSend = form !== "task" && form !== "note";
    let sent = false;
    if (isSend) setBusy(true);
    setError("");
    try {
      if (form === "task") {
        const taskData = buildTaskMutationData({
          editing,
          title,
          date,
          time,
          reminder,
          reminderLead,
          projectId,
          recurrence,
        });
        await saveMutation({
          mutationId: crypto.randomUUID(),
          kind: "tasks",
          id: editing?.id ?? crypto.randomUUID(),
          baseVersion: editing?.version ?? 0,
          deleted: false,
          data: taskData,
        });
      } else if (form === "note") {
        await saveMutation({
          mutationId: crypto.randomUUID(),
          kind: "notes",
          id: editing?.id ?? crypto.randomUUID(),
          baseVersion: editing?.version ?? 0,
          deleted: false,
          data: {
            ...productMetadata((editing?.data as Record<string, unknown>) ?? {}),
            projectId: projectId || null,
            title: title.trim() || content.trim().slice(0, 60),
            content: content.trim(),
            ...((editing?.data as PhoneNote | undefined)?.attachments
              ? { attachments: (editing!.data as PhoneNote).attachments }
              : {}),
            updatedAt: Date.now(),
          },
        });
      } else {
        if (!navigator.onLine) throw new Error("Bu gönderi için internet gerekir. Metniniz burada korunuyor.");
        await api(
          state,
          "inbox",
          json({ id: formRequestId.current, kind: form, title: title.trim() || content.slice(0, 60), content: content.trim() })
        );
        sent = true;
        setNotice("Gönderildi.");
        setSendFeedback("İçerik bilgisayarına gönderildi.");
      }
      setForm(null);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      sending.current = false;
      if (isSend) {
        setBusy(false);
        if (sent) void refresh();
      }
    }
  }

  async function complete(row: CloudRecord) {
    const task = row.data as PhoneTask;
    const isCompleted = isOccurrenceCompleted(task);
    const nextData = isCompleted ? uncompleteOccurrence(task) : completeOccurrence(task);
    try {
      await saveMutation({
        mutationId: crypto.randomUUID(),
        kind: "tasks",
        id: row.id,
        baseVersion: row.version,
        deleted: false,
        data: nextData,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Görev kaydedilemedi.");
    }
  }

  async function snooze(row: CloudRecord, minutes: number) {
    try {
      await saveMutation({
        mutationId: crypto.randomUUID(),
        kind: "tasks",
        id: row.id,
        baseVersion: row.version,
        deleted: false,
        data: buildSnoozedTaskData(row.data as PhoneTask, minutes),
      });
    } catch {
      setError("Hatırlatma ertelenemedi.");
    }
  }

  if (!attachmentSender.current) {
    attachmentSender.current = createAttachmentSender(async (blob, fileName, id) => {
      if (!navigator.onLine) throw new Error("Dosya göndermek için internet gerekir. İçeriğin burada korunuyor.");
      if (!blob.size || blob.size > MAX_ATTACHMENT) throw new Error("Dosya boş olamaz ve en fazla 10 MB olabilir.");
      await api(ref.current, "attachments", {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(fileName),
          "X-Request-Id": id,
        },
        body: blob,
      });
    });
  }

  async function upload(blob: Blob, fileName: string): Promise<boolean> {
    if (sending.current || busy || locked.current) return false;
    sending.current = true;
    setBusy(true);
    setError("");
    let success = false;
    try {
      success = await attachmentSender.current!(blob, fileName);
      if (success) {
        setNotice("Dosya gönderildi.");
        setSendFeedback("Dosya bilgisayarına gönderildi. Bulutta 30 gün saklanır.");
        if (blob === audio) setAudio(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya gönderilemedi. İçeriğin burada korunuyor; tekrar deneyebilirsin.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
    if (success) void refresh();
    return success;
  }

  async function handleSendText(kind: "text" | "link" | "ai_prompt", text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!navigator.onLine) {
      setError("Bu gönderi için internet gerekir. Metniniz burada korunuyor.");
      return false;
    }
    if (sending.current || busy || locked.current) return false;
    sending.current = true;
    setBusy(true);
    setError("");
    let sent = false;
    try {
      const id = crypto.randomUUID();
      const firstLine = trimmed.split("\n")[0].slice(0, 100);
      const title =
        kind === "link"
          ? trimmed.slice(0, 100)
          : firstLine || (kind === "ai_prompt" ? "ACK AI İstemi" : "Metin Notu");
      await api(state, "inbox", json({ id, kind, title, content: trimmed }));
      sent = true;
      setNotice("Gönderildi.");
      setSendFeedback(
        kind === "ai_prompt"
          ? "ACK AI görevi bilgisayarına gönderildi."
          : kind === "link"
          ? "Bağlantı bilgisayarına gönderildi."
          : "Metin bilgisayarına gönderildi."
      );
      void refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderilemedi.");
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function startRecording() {
    if (recordingStarting.current || recording || sending.current) return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setError("Ses kaydı bu cihazda desteklenmiyor. Mevcut bir ses dosyasını seçebilirsiniz.");
      return;
    }
    recordingStarting.current = true;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({audio:true});
      if (document.hidden || !["send", "inbox"].includes(pageRef.current)) {
        stream.current.getTracks().forEach(track => track.stop());
        throw new Error("Kayıt iptal edildi.");
      }
      const mime = ["audio/mp4", "audio/webm", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      let size = 0;
      rec.ondataavailable = e => {
        size += e.data.size;
        if (size > MAX_ATTACHMENT) {
          setError("Sesli not en fazla 10 MB olabilir.");
          rec.stop();
          return;
        }
        chunks.push(e.data);
      };
      rec.onstop = () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        stream.current?.getTracks().forEach(track => track.stop());
        setRecording(false);
        if (size <= MAX_ATTACHMENT) setAudio(new Blob(chunks, { type: rec.mimeType.split(";")[0] }));
      };
      recorder.current = rec;
      rec.start(1000);
      setRecording(true);
      recordingTimer.current = setTimeout(()=>rec.state !== "inactive" && rec.stop(), 120000);
    } catch {
      setError("Mikrofon açılamadı. İzni cihaz ayarlarından kontrol edin.");
    } finally {
      recordingStarting.current = false;
    }
  }

  const tasks = state.records.filter(row => row.kind === "tasks" && !row.deleted && row.data);
  const today = dateKey();
  const displayedDate = (task: PhoneTask) => scheduleDate(task) ?? "";
  const unfinished = tasks
    .filter(row => !isOccurrenceCompleted(row.data as PhoneTask))
    .sort(
      (a, b) =>
        (displayedDate(a.data as PhoneTask) || "9999").localeCompare(displayedDate(b.data as PhoneTask) || "9999") ||
        ((a.data as PhoneTask).dueTime ?? "").localeCompare((b.data as PhoneTask).dueTime ?? "")
    );

  const todayTasks = unfinished.filter(row => {
    const t = row.data as PhoneTask;
    const d = displayedDate(t);
    return !d || d === today || (!t.recurrence && d < today);
  });

  const studyPrograms = state.records
    .filter(row => row.kind === "studyPrograms" && !row.deleted && row.data)
    .map(row => row.data as StudyProgram);
  const allWeekStudyBlocks = studyBlocks(studyPrograms, new Date());
  const todayStudyBlocks = allWeekStudyBlocks.filter(b => b.date === today);

  const currentHour = new Date().getHours();
  const mobileGreeting =
    currentHour >= 5 && currentHour < 12
      ? "Günaydın, Alican"
      : currentHour >= 12 && currentHour < 18
      ? "İyi günler, Alican"
      : currentHour >= 18 && currentHour < 24
      ? "İyi akşamlar, Alican"
      : "İyi geceler, Alican";

  const notesCount = state.records.filter(r => r.kind === "notes" && !r.deleted).length;

  async function reorderNote(id: string, direction: number) {
    const rawNotes = state.records.filter(r => r.kind === "notes" && !r.deleted && r.data);
    const sorted = state.noteOrder
      ? [...rawNotes].sort((a, b) => {
          const ai = state.noteOrder!.indexOf(a.id),
            bi = state.noteOrder!.indexOf(b.id);
          if (ai >= 0 && bi >= 0) return ai - bi;
          if (ai >= 0) return -1;
          if (bi >= 0) return 1;
          return 0;
        })
      : rawNotes;
    const ordered = moveBy(sorted, id, direction).map(row => row.id);
    try {
      const latest = await readState();
      const next = { ...latest, noteOrder: ordered };
      await saveState(next);
      setState(next);
    } catch {
      setError("Not sırası kaydedilemedi.");
    }
  }

  if (isLocked) {
    return <MobileLockScreen onUnlock={() => setIsLocked(false)} />;
  }

  if (!ready) {
    return <main className="mobile-app" style={{ background: "var(--app-bg)", minHeight: "100vh" }} />;
  }

  if (!state.token) {
    return (
      <MobilePairingScreen
        name={name}
        setName={setName}
        code={code}
        setCode={setCode}
        busy={busy}
        ready={ready}
        error={error}
        onSubmit={pair}
      />
    );
  }

  return (
    <main className={"mobile-app " + (page==="notes" ? "notes-page" : "")}>
      <div className="mobile-content" inert={!!form || !!subscriptionDraft}>
        <MobileAppHeader
          online={online}
          page={page}
          busy={busy}
          onToggleOverview={() => setPage(page === "overview" ? "today" : "overview")}
          onRefresh={() => void refresh()}
        />

        {error && <p role="alert" className="error">{error}</p>}

        {(page === "today" || page === "tasks") && (
          <>
            <MobileTodayHero
              mobileGreeting={mobileGreeting}
              weather={weather}
              unfinishedCount={unfinished.length}
              todayStudyCount={todayStudyBlocks.length}
              notesCount={notesCount}
              onOpenOverview={() => setPage("overview")}
              onOpenWeatherModal={() => setWeatherModalOpen(true)}
              onOpenPlanCalendar={() => {
                changePage("plan");
                setPlanTab("calendar");
              }}
              onOpenNotes={() => changePage("notes")}
            />

            <MobileTimelineCard
              today={today}
              todayStudyBlocks={todayStudyBlocks}
              allWeekStudyBlocks={allWeekStudyBlocks}
              todayTasks={todayTasks}
              unfinished={unfinished}
              attendance={attendance}
              isCollapsed={isCollapsed("timeline")}
              onToggleCollapse={() => toggleCard("timeline")}
              onOpenFullPlan={() => {
                changePage("plan");
                setPlanTab("calendar");
              }}
              onOpenTaskForm={row => openForm("task", row)}
            />

            <MobileTasksCard
              today={today}
              tasks={tasks}
              todayStudyBlocks={todayStudyBlocks}
              allWeekStudyBlocks={allWeekStudyBlocks}
              attendance={attendance}
              busy={busy}
              isCollapsed={isCollapsed("tasks")}
              onToggleCollapse={() => toggleCard("tasks")}
              onNewTask={defaultToday => {
                openForm("task");
                if (defaultToday) setDate(today);
              }}
              onOpenTask={row => openForm("task", row)}
              onToggleStudyBlock={toggleMobileStudyBlock}
              onCompleteTask={row => void complete(row)}
              onSnoozeTask={(row, mins) => void snooze(row, mins)}
              onDeleteTask={row => {
                if (confirm("Bu görev silinsin mi?")) {
                  void saveMutation({
                    mutationId: crypto.randomUUID(),
                    kind: "tasks",
                    id: row.id,
                    baseVersion: row.version,
                    data: null,
                    deleted: true,
                  })
                    .then(() => setUndo({ row, expires: Date.now() + 10000 }))
                    .catch(e => setError(e.message));
                }
              }}
            />

            <MobilePrayerCard
              records={state.records}
              onSave={saveMutation}
              isCollapsed={isCollapsed("prayer")}
              onToggleCollapse={() => toggleCard("prayer")}
            />

            <MobileDormMenuCard
              isCollapsed={isCollapsed("dormMenu")}
              onToggleCollapse={() => toggleCard("dormMenu")}
            />

            <MobilePomodoroCard
              isCollapsed={isCollapsed("pomodoro")}
              onToggleCollapse={() => toggleCard("pomodoro")}
            />
          </>
        )}

        {page==="notes" && (
          <NotesList
            syncLabel={busy ? "Eşitleniyor…" : state.queue.length ? "Eşitleme bekliyor" : "Güncel"}
            records={state.records}
            noteOrder={state.noteOrder}
            onReorder={reorderNote}
            onNew={() => openForm("note")}
            onOpen={row => openForm("note", row)}
          />
        )}

        {page === "plan" && (
          <MobilePlanView
            planTab={planTab}
            setPlanTab={setPlanTab}
            busy={busy}
            records={state.records}
            studyReminders={studyReminders}
            onSaveMutation={saveMutation}
            onOpenTask={row => openForm("task", row)}
            onNewTaskOnDay={day => {
              openForm("task");
              setDate(day);
            }}
            onOpenSubscription={sub => setSubscriptionDraft(sub)}
            onUpdateStudyReminder={updateStudyReminder}
            onDeleteSubscription={row => {
              if (confirm("Yalnızca abonelik kaydı silinsin mi? Hizmet sağlayıcısındaki aboneliğiniz değişmez.")) {
                void saveMutation({
                  mutationId: crypto.randomUUID(),
                  kind: "subscriptions",
                  id: row.id,
                  baseVersion: row.version,
                  data: null,
                  deleted: true,
                })
                  .then(() => setUndo({ row, expires: Date.now() + 10000 }))
                  .catch(e => setError(e.message));
              }
            }}
          />
        )}

        {page === "media" && (
          <MobileMediaTracker
            state={state}
            records={state.records}
            onSave={saveMutation}
            disabled={busy}
            onNotice={setNotice}
            onError={setError}
          />
        )}

        {page === "send" && (
          <MobileSendView
            sendTab={sendTab}
            setSendTab={setSendTab}
            state={state}
            online={online}
            busy={busy}
            sending={sending.current}
            recording={recording}
            audio={audio}
            sendFeedback={sendFeedback}
            selectedFile={selectedFile}
            inboxLoaded={inboxLoaded}
            inbox={inbox}
            setInbox={setInbox}
            onOpenSettings={() => changePage("settings")}
            onSelectFile={file => {
              setSelectedFile(file);
              if (file) {
                setSendFeedback("");
                setError("");
              }
            }}
            onSendText={handleSendText}
            onUploadFile={(file, filename) => upload(file, filename)}
            onToggleRecord={() => (recording ? recorder.current?.stop() : void startRecording())}
            onCancelAudio={() => setAudio(null)}
            onNotice={setNotice}
            onError={setError}
          />
        )}

        {page === "settings" && (
          <MobileSettings
            state={state}
            commit={commit}
            busy={busy}
            name={name}
            setName={setName}
            push={push}
            setPush={setPush}
            online={online}
            tasksCount={tasks.length}
            notesCount={notesCount}
            onNotice={setNotice}
            onError={setError}
            onBack={() => changePage("send")}
            onSync={() => refresh()}
          />
        )}

        {page === "overview" && (
          <MobileActivityOverview onBack={() => changePage("today")} records={state.records} state={state} />
        )}

        <MobileConflictCards
          state={state}
          busy={busy}
          commit={commit}
          refresh={next => refresh(next)}
          onError={setError}
        />
      </div>

      {subscriptionDraft && (
        <section
          ref={subscriptionEditorRef}
          className="editor"
          role="dialog"
          aria-modal="true"
          aria-label="Abonelik düzenle"
          onClick={e => {
            if (e.target === e.currentTarget) setSubscriptionDraft(null);
          }}
        >
          <div>
            <SubscriptionForm
              key={subscriptionDraft.id}
              initial={subscriptionDraft}
              busy={busy}
              onCancel={() => setSubscriptionDraft(null)}
              onSave={async sub => {
                const row = state.records.find(r => r.kind === "subscriptions" && r.id === sub.id);
                await saveMutation({
                  mutationId: crypto.randomUUID(),
                  kind: "subscriptions",
                  id: sub.id,
                  baseVersion: row?.version ?? 0,
                  data: sub,
                  deleted: false,
                });
                setSubscriptionDraft(null);
              }}
            />
          </div>
        </section>
      )}

      <MobileToasts
        undo={undo}
        notice={notice}
        busy={busy}
        records={state.records}
        saveMutation={saveMutation}
        onClearUndo={() => setUndo(null)}
        onError={setError}
      />

      {form === "note" && (
        <section ref={editorRef} className="editor note-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
          <NoteEditor
            linkControl={<NoteAttachments files={(editing?.data as PhoneNote | undefined)?.attachments ?? []} state={state} />}
            title={title}
            content={content}
            onTitle={setTitle}
            onContent={setContent}
            onClose={closeForm}
            onSubmit={event => void submit(event)}
            busy={busy}
            error={error}
            updatedAt={(editing?.data as PhoneNote | undefined)?.updatedAt}
            onDelete={
              editing
                ? () => {
                    if (confirm("Bu not silinsin mi?")) {
                      void saveMutation({
                        mutationId: crypto.randomUUID(),
                        kind: "notes",
                        id: editing.id,
                        baseVersion: editing.version,
                        data: null,
                        deleted: true,
                      })
                        .then(() => {
                          setUndo({ row: editing, expires: Date.now() + 10000 });
                          setForm(null);
                        })
                        .catch(e => setError(e.message));
                    }
                  }
                : undefined
            }
          />
        </section>
      )}

      {form && form !== "note" && (
        <section
          ref={editorRef}
          className="editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="editor-title"
          onClick={e => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div>
            <div className="editor-heading">
              <h2 id="editor-title">
                {form === "task"
                  ? "Görev"
                  : form === "link"
                  ? "Link Gönder"
                  : form === "ai_prompt"
                  ? "ACK AI'a Mesaj Bırak"
                  : "Metin Gönder"}
              </h2>
              <button type="button" aria-label="Düzenleyiciyi kapat" disabled={busy} onClick={closeForm}>
                ×
              </button>
            </div>
            <form onSubmit={submit}>
              {form === "task" && (
                <label>
                  Görev metni
                  <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={2000} />
                </label>
              )}
              {form !== "task" && (
                <label>
                  {form === "link" ? "Web adresi" : "İçerik"}
                  <textarea
                    disabled={busy || sending.current}
                    value={content}
                    onChange={e => {
                      setContent(e.target.value);
                      formRequestId.current = crypto.randomUUID();
                    }}
                    required
                    maxLength={20000}
                  />
                </label>
              )}
              {form === "task" && (
                <>
                  <div className="editor-row">
                    <label>
                      {recurrence ? "Başlangıç günü" : "Tarih"}
                      <input
                        type="date"
                        value={date}
                        onChange={e => {
                          setDate(e.target.value);
                          if (!e.target.value) setReminder(false);
                        }}
                      />
                    </label>
                    <label>
                      Saat
                      <input
                        type="time"
                        value={time}
                        onChange={e => {
                          setTime(e.target.value);
                          if (!e.target.value) setReminder(false);
                        }}
                      />
                    </label>
                  </div>
                  <RecurrenceFields
                    key={editing?.id ?? "new"}
                    value={recurrence}
                    date={date}
                    time={time}
                    onChange={rule => {
                      setRecurrence(rule);
                      if (rule) {
                        setDate(date || rule.start);
                        setTime(time || rule.time);
                      }
                    }}
                  />
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={reminder}
                      disabled={!date || !time}
                      onChange={e => setReminder(e.target.checked)}
                    />
                    Hatırlat
                  </label>
                  {reminder && (
                    <label>
                      Hatırlatma
                      <select value={reminderLead} onChange={e => setReminderLead(Number(e.target.value))}>
                        <option value="0">Görev saatinde</option>
                        <option value="15">15 dakika önce</option>
                        <option value="60">1 saat önce</option>
                        <option value="1440">1 gün önce</option>
                        {reminderLead && ![0, 15, 60, 1440].includes(reminderLead) && (
                          <option value={reminderLead}>{reminderLead} dakika önce</option>
                        )}
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="actions">
                <button disabled={busy}>{form === "task" ? "Kaydet" : "Gönder"}</button>
                <button type="button" disabled={busy} onClick={closeForm}>
                  İptal
                </button>
                {editing && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Bu kayıt silinsin mi?")) {
                        void saveMutation({
                          mutationId: crypto.randomUUID(),
                          kind: editing.kind,
                          id: editing.id,
                          baseVersion: editing.version,
                          data: null,
                          deleted: true,
                        })
                          .then(() => {
                            setUndo({ row: editing, expires: Date.now() + 10000 });
                            setForm(null);
                          })
                          .catch(e => setError(e.message));
                      }
                    }}
                  >
                    Kaydı Sil
                  </button>
                )}
              </div>
              {error && <p role="alert" className="error">{error}</p>}
            </form>
          </div>
        </section>
      )}

      {weatherModalOpen && weather && (
        <MobileWeatherModal
          weather={weather}
          onClose={() => setWeatherModalOpen(false)}
          onChangeCity={handleMobileChangeCity}
        />
      )}

      <MobileNav page={page} onChange={changePage} />
    </main>
  );
}

if ("serviceWorker" in navigator) {
  let refreshing = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register("/sw.js")
    .then(reg => void reg.update())
    .catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing && hadController) {
      refreshing = true;
      window.location.reload();
    }
  });
}
createRoot(document.getElementById("root")!).render(<App />);
