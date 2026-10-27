import { ActionMenu } from "../../src/components/ActionMenu";
import { MobileInboxProcessing } from "./InboxProcessing";
import { MobileSmartCapture, MobileWeek } from "./ProductViews";
import { MobilePrayerCard } from "./MobilePrayerCard";
import { productMetadata } from "../../shared/productivity";
import { moveBy } from "../../src/reorder";
import { NoteAttachments } from "./NoteAttachments";
import { NoteEditor } from "./NoteEditor";
import { NotesList } from "./NotesList";
import { RecurrenceFields } from "../../shared/RecurrenceFields";
import { SubscriptionForm, newSubscription } from "../../shared/SubscriptionForm";
import { money, cycleLabel, paymentLabel, monthlyTotals, type Subscription } from "../../shared/subscriptions";
import { completeOccurrence, nextOccurrence, recurrenceLabel, scheduleDate, isOccurrenceCompleted, uncompleteOccurrence, completedTaskSortTime, type Recurrence } from "../../shared/recurrence";
import { studyBlocks, type StudyProgram } from "../../shared/studyPrograms";
import { savePrayerConfig, loadPrayerConfig, lookupTurkeyCity, type PrayerTimesConfig } from "../../shared/prayerTimes";
import { fetchMobileWeather, loadWeatherCache, type WeatherData } from "../../shared/weather";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { MAX_ATTACHMENT, type CloudRecord, type PhoneTask, type PhoneNote, type Mutation } from "../../shared/phone";
import { api, emptyState, enqueue, json, readState, saveState, synchronize, type MobileState } from "./store";
import { enablePush } from "./push";
import "./style.css";
import "./notes.css";
import { createAttachmentSender } from "./sendFlow";
import { SendCard } from "./SendCard";
import { MobileSettings } from "./MobileSettings";
import { MobileNav } from "./MobileNav";
import { Icon } from "./Icon";

type Inbox = { id: string; kind: string; title: string; content: string; mime: string | null; expiresAt: number | null; size?: number | null; handled: number };
type Workspace = { id: string; name: string; icon: string; description: string };
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function formatAlarmHint(dueTime: string | null, reminderLeadMinutes?: number): string {
  if (!dueTime) return "Alarm";
  if (!reminderLeadMinutes || reminderLeadMinutes === 0) return dueTime;
  const parts = dueTime.split(":");
  if (parts.length !== 2) return dueTime;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return dueTime;
  let totalMin = h * 60 + m - reminderLeadMinutes;
  while (totalMin < 0) totalMin += 24 * 60;
  const ah = Math.floor(totalMin / 60) % 24;
  const am = totalMin % 60;
  return `${String(ah).padStart(2, "0")}:${String(am).padStart(2, "0")}`;
}

function App() {
  const [state, setState] = useState<MobileState>(emptyState);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<string>(() => {
    const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    if (raw === "prayer" || raw.startsWith("prayer")) return "today";
    const params = new URLSearchParams(raw);
    const p = params.get("page");
    if (p === "subscriptions" || p === "plan" || p === "calendar") return "plan";
    if (p === "notes") return "notes";
    if (p === "send") return "send";
    if (p === "settings") return "settings";
    return "today";
  });
  const [weather, setWeather] = useState<WeatherData | null>(() => loadWeatherCache());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState<"task" | "note" | "text" | "link" | "ai_prompt" | null>(null);
  const [editing, setEditing] = useState<CloudRecord | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reminder, setReminder] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [subscriptionDraft, setSubscriptionDraft] = useState<Subscription | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [reminderLead, setReminderLead] = useState(0);
  const [undo, setUndo] = useState<{ row: CloudRecord; expires: number } | null>(null);
  const [notificationTask, setNotificationTask] = useState(() => new URLSearchParams(location.hash.slice(1)).get("task"));

  // Sub-tabs
  const [taskFilter, setTaskFilter] = useState<"today" | "all">("today");
  const [planTab, setPlanTab] = useState<"calendar" | "subscriptions">("calendar");

  // Mobile Subscriptions Ordering & Visibility
  const [hiddenSubs, setHiddenSubs] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("ack-deck.mobile-hidden-subs.v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [subOrder, setSubOrder] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("ack-deck.mobile-sub-order.v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [showHiddenSubs, setShowHiddenSubs] = useState(false);

  function toggleHideSub(id: string) {
    setHiddenSubs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem("ack-deck.mobile-hidden-subs.v1", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function moveSub(id: string, delta: -1 | 1, orderedIds: string[]) {
    const idx = orderedIds.indexOf(id);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= orderedIds.length) return;
    const next = [...orderedIds];
    const [item] = next.splice(idx, 1);
    next.splice(targetIdx, 0, item);
    setSubOrder(next);
    try { localStorage.setItem("ack-deck.mobile-sub-order.v1", JSON.stringify(next)); } catch {}
  }

  // Mobile Study Reminders
  const [studyReminders, setStudyReminders] = useState<{ id: string; leadMinutes: number | null }[]>(() => {
    try { const raw = localStorage.getItem("ack-deck.study-reminders.v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });

  function updateStudyReminder(programId: string, leadMinutes: number | null) {
    setStudyReminders(prev => {
      const next = [...prev.filter(x => x.id !== programId), { id: programId, leadMinutes }];
      try { localStorage.setItem("ack-deck.study-reminders.v1", JSON.stringify(next)); } catch {}
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
    setQuickAdd(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get("pair") ?? "");
  const [name, setName] = useState("iPhone");
  const [online, setOnline] = useState(false);
  const [push, setPush] = useState(false);
  const [inbox, setInbox] = useState<Inbox[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);

  const editorRef = useRef<HTMLElement | null>(null);
  const subscriptionEditorRef = useRef<HTMLElement | null>(null);
  const closeFormRef = useRef(closeForm);
  closeFormRef.current = closeForm;

  useEffect(() => {
    const dialog = editorRef.current ?? subscriptionEditorRef.current;
    if (!dialog) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary")).filter(el => el.getClientRects().length);
    if (!dialog.contains(document.activeElement)) controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeFormRef.current(); setSubscriptionDraft(null); }
      if (event.key!=="Tab") return;
      const all = controls(), first = all[0], last = all[all.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const resize = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const vt = window.visualViewport?.offsetTop ?? 0;
      dialog.style.height = `${vh}px`;
      dialog.style.top = `${vt}px`;
    };
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", key);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
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

  async function refresh(value = ref.current) {
    if (!value.token || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await synchronize(value);
      ref.current = next;
      setState(next);
      const [status, list, spaces] = await Promise.all([
        api<{ online: boolean; notifications: boolean; prayerConfig?: PrayerTimesConfig }>(next, "status"),
        api<{ items: Inbox[] }>(next, "inbox"),
        api<{ workspaces: Workspace[] }>(next, "workspaces"),
      ]);
      setOnline(status.online);
      setPush(status.notifications);
      setInbox(list.items);
      setInboxLoaded(true);
      setWorkspaces(spaces.workspaces);
      if (status.prayerConfig && typeof status.prayerConfig === "object" && status.prayerConfig.city) {
        savePrayerConfig(status.prayerConfig);
      }
      setNotice(next.conflicts.length ? "Eşitleme çakışması var; iki sürüm de korundu." : "Eşitlendi.");
    } catch (e) {
      setError(navigator.onLine ? e instanceof Error ? e.message : "Eşitleme tamamlanamadı." : "Çevrimdışı — bağlantı gelince eşitlenecek.");
      try { const saved = await readState(); ref.current = saved; setState(saved); } catch {}
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void readState().then(value => {
      if (active) {
        ref.current = value;
        setState(value);
        setName(value.name);
        setReady(true);
        void refresh(value);
      }
    }).catch(() => setError("Telefon kayıtları okunamadı. Mevcut veriler korundu."));
    const reconnect = () => { void refresh(); };
    window.addEventListener("online", reconnect);
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  useEffect(() => {
    const stop = () => {
      if (document.hidden && recorder.current && recorder.current.state !== "inactive") {
        recorder.current.stop();
        stream.current?.getTracks().forEach(track => track.stop());
      }
    };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, []);

  useEffect(() => {
    if (page !== "send" && page !== "inbox" && recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    }
  }, [page]);

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
    const task = row?.kind === "tasks" ? row.data as PhoneTask : null;
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

  useEffect(() => {
    let active = true;
    async function updateWeather() {
      try {
        let city = "Karabük";
        const rawCity = localStorage.getItem("ack-deck.weather-city.v1");
        if (rawCity) {
          try {
            const parsed = JSON.parse(rawCity);
            if (typeof parsed === "string" && parsed.trim()) city = parsed.trim();
          } catch {}
        } else {
          const prayer = loadPrayerConfig();
          if (prayer.city) city = prayer.city;
        }

        const cityData = lookupTurkeyCity(city) || { city, lat: 41.20488, lng: 32.62768 };
        const w = await fetchMobileWeather(cityData.city, cityData.lat, cityData.lng);
        if (active && w) {
          setWeather(w);
        }
      } catch {}
    }

    void updateWeather();
    const interval = setInterval(updateWeather, 30 * 60 * 1000);
    window.addEventListener("ack-weather-city-changed", updateWeather);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("ack-weather-city-changed", updateWeather);
    };
  }, []);

  function handleHashRoute(urlOrHash?: string) {
    let hashStr = "";
    if (typeof urlOrHash === "string") {
      const idx = urlOrHash.indexOf("#");
      hashStr = idx !== -1 ? urlOrHash.slice(idx + 1) : urlOrHash;
    } else {
      hashStr = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    }
    if (!hashStr) return;

    if (hashStr === "prayer" || hashStr.startsWith("prayer")) {
      setPage("today");
      setTimeout(() => {
        document.querySelector(".mobile-prayer-card")?.scrollIntoView({ behavior: "smooth" });
      }, 200);
      return;
    }

    const params = new URLSearchParams(hashStr);
    const task = params.get("task");
    if (task) {
      setNotificationTask(task);
      setPage("today");
      return;
    }

    const p = params.get("page");
    if (p === "prayer") {
      setPage("today");
      setTimeout(() => {
        document.querySelector(".mobile-prayer-card")?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    } else if (p === "subscriptions") {
      setPage("plan");
      setPlanTab("subscriptions");
    } else if (p === "plan" || p === "calendar") {
      setPage("plan");
      setPlanTab("calendar");
    } else if (p === "notes") {
      setPage("notes");
    } else if (p === "today" || p === "tasks") {
      setPage("today");
    } else if (p === "send") {
      setPage("send");
    } else if (p === "settings") {
      setPage("settings");
    }
  }

  useEffect(() => {
    handleHashRoute();
    const change = () => handleHashRoute();
    window.addEventListener("hashchange", change);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "ack-navigate" && typeof e.data?.url === "string") {
        handleHashRoute(e.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("hashchange", change);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  function closeForm() {
    if (busy || sending.current) return;
    const previous = editing?.data as PhoneNote | undefined;
    if (form === "note" && (title !== (previous?.title ?? "") || content !== (previous?.content ?? "")) && !confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi? Kaydet düğmesiyle kaydedebilirsin.")) return;
    if (form && !["note", "task"].includes(form) && content.trim() && !confirm("Gönderilmemiş içerikten vazgeçilsin mi?")) return;
    setForm(null);
  }

  async function saveMutation(mutation: Mutation) {
    if (locked.current) throw new Error("Eşitleme sürüyor. Biraz sonra deneyin.");
    if (form && editing && mutation.kind === editing.kind && mutation.id === editing.id) {
      const latest = ref.current.records.find(r => r.kind === editing.kind && r.id === editing.id);
      if (!latest || latest.deleted || latest.version !== editing.version) throw new Error("Kayıt başka bir cihazda değişti. Taslağın burada; güncel kaydı yeniden açıp kontrol et.");
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
        const previous = editing?.data as PhoneTask | undefined;
        const changed = JSON.stringify(recurrence) !== JSON.stringify(previous?.recurrence ?? null) || date !== previous?.dueDate || time !== previous?.dueTime;
        const rule = recurrence && changed ? { ...recurrence, start: date, time } : recurrence;
        const first = rule && changed ? nextOccurrence(rule, Date.parse(date + "T00:00:00Z") - 86400000) : null;
        if (rule && (!date || !time || (changed && !first))) throw new Error("Tekrar için tarih, saat ve günleri kontrol edin.");
        const dueAt = first?.at ?? (!changed && previous?.snoozedUntil ? previous.snoozedUntil : rule ? previous?.dueAt ?? null : date && time ? new Date(`${date}T${time}:00`).getTime() : null);
        await saveMutation({
          mutationId: crypto.randomUUID(),
          kind: "tasks",
          id: editing?.id ?? crypto.randomUUID(),
          baseVersion: editing?.version ?? 0,
          deleted: false,
          data: {
            ...productMetadata(previous ?? {}),
            checklist: previous?.checklist ?? [],
            projectId: projectId || null,
            reminderLeadMinutes: reminderLead,
            text: title.trim(),
            completed: rule && changed ? false : editing?.data && "completed" in editing.data ? editing.data.completed : false,
            dueDate: first?.date ?? (date || null),
            dueTime: time || null,
            recurrence: rule,
            occurrenceAt: first?.at ?? previous?.occurrenceAt ?? dueAt,
            lastCompletedAt: previous?.lastCompletedAt ?? null,
            snoozedUntil: changed ? null : previous?.snoozedUntil ?? null,
            priority: "normal",
            reminder,
            dueAt,
            timezone: rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
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
            ...(((editing?.data as PhoneNote | undefined)?.attachments) ? { attachments: (editing!.data as PhoneNote).attachments } : {}),
            updatedAt: Date.now(),
          },
        });
      } else {
        if (!navigator.onLine) throw new Error("Bu gönderi için internet gerekir. Metniniz burada korunuyor.");
        await api(state, "inbox", json({ id: formRequestId.current, kind: form, title: title.trim() || content.slice(0, 60), content: content.trim() }));
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
    const task = row.data as PhoneTask;
    const future = new Date();
    if (minutes === 1440) future.setDate(future.getDate() + 1);
    else future.setMinutes(future.getMinutes() + minutes);
    future.setSeconds(0, 0);
    try {
      await saveMutation({
        mutationId: crypto.randomUUID(),
        kind: "tasks",
        id: row.id,
        baseVersion: row.version,
        deleted: false,
        data: {
          ...task,
          snoozedUntil: future.getTime(),
          occurrenceAt: task.occurrenceAt ?? task.dueAt,
          dueDate: task.recurrence ? task.dueDate : dateKey(future),
          dueTime: task.recurrence ? task.dueTime : `${String(future.getHours()).padStart(2, "0")}:${String(future.getMinutes()).padStart(2, "0")}`,
          dueAt: future.getTime(),
          timezone: task.recurrence?.timezone ?? task.timezone,
          reminder: true,
          completed: false,
        },
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
    .sort((a, b) => (displayedDate(a.data as PhoneTask) || "9999").localeCompare(displayedDate(b.data as PhoneTask) || "9999") || ((a.data as PhoneTask).dueTime ?? "").localeCompare((b.data as PhoneTask).dueTime ?? ""));

  const todayTasks = unfinished.filter(row => {
    const t = row.data as PhoneTask;
    const d = displayedDate(t);
    return !!d && (d === today || (!t.recurrence && d < today));
  });

  // Study programs today
  const studyPrograms = state.records
    .filter(row => row.kind === "studyPrograms" && !row.deleted && row.data)
    .map(row => row.data as StudyProgram);
  const allWeekStudyBlocks = studyBlocks(studyPrograms, new Date());
  const todayStudyBlocks = allWeekStudyBlocks.filter(b => b.date === today);

  const curMobileWeekDates = (() => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    const list: string[] = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      list.push(dateKey(cur));
    }
    return list;
  })();

  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(today);

  const mobileWeekDays = curMobileWeekDates.map(dStr => {
    const [y, m, d] = dStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = (dateObj.getDay() + 6) % 7;
    const studyCount = allWeekStudyBlocks.filter(b => b.date === dStr).length;
    const taskCount = unfinished.filter(t => scheduleDate(t.data as PhoneTask) === dStr).length;
    return {
      date: dStr,
      shortLabel: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"][dayOfWeek],
      dayNum: dateObj.getDate(),
      studyCount,
      taskCount,
    };
  });

  const isSelectedMobileToday = selectedMobileDate === today;
  const displayedMobileStudyBlocks = allWeekStudyBlocks.filter(b => b.date === selectedMobileDate);
  const displayedMobileTasks = isSelectedMobileToday
    ? todayTasks
    : unfinished.filter(r => scheduleDate(r.data as PhoneTask) === selectedMobileDate);

  type MobileTimelineItem =
    | {
        kind: "study";
        id: string;
        time: string;
        endTime: string;
        label: string;
        topic?: string;
      }
    | {
        kind: "task";
        id: string;
        time: string | null;
        task: PhoneTask;
        row: CloudRecord;
        index: number;
      };

  const mobileTimelineItems: MobileTimelineItem[] = [
    ...displayedMobileStudyBlocks.map(b => ({
      kind: "study" as const,
      id: b.id,
      time: b.time,
      endTime: b.endTime,
      label: b.label,
      topic: b.topic,
    })),
    ...displayedMobileTasks.map((row, index) => {
      const task = row.data as PhoneTask;
      return {
        kind: "task" as const,
        id: row.id,
        time: task.dueTime ?? null,
        task,
        row,
        index,
      };
    }),
  ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const currentHour = new Date().getHours();
  const mobileGreeting =
    currentHour >= 5 && currentHour < 12
      ? "☀️ Günaydın, Alican"
      : currentHour >= 12 && currentHour < 18
      ? "☀️ İyi günler, Alican"
      : currentHour >= 18 && currentHour < 24
      ? "🌆 İyi akşamlar, Alican"
      : "🌙 İyi geceler, Alican";

  const selectedMobileDateLabel = (() => {
    try {
      const [y, m, d] = selectedMobileDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });
    } catch {
      return selectedMobileDate;
    }
  })();

  const notesCount = state.records.filter(r => r.kind === "notes" && !r.deleted).length;

  async function reorderTask(id: string, direction: number) {
    const ordered = moveBy(unfinished, id, direction).map(row => row.id);
    try {
      const latest = await readState();
      const next = { ...latest, taskOrder: ordered };
      await saveState(next);
      setState(next);
    } catch {
      setError("Görev sırası kaydedilemedi.");
    }
  }

  async function reorderNote(id: string, direction: number) {
    const rawNotes = state.records.filter(r => r.kind === "notes" && !r.deleted && r.data);
    const sorted = state.noteOrder ? [...rawNotes].sort((a, b) => {
      const ai = state.noteOrder!.indexOf(a.id), bi = state.noteOrder!.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return 0;
    }) : rawNotes;
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

  if (!state.token) {
    return (
      <main className="pairing-page">
        <header>
          <img src="/icon-192.png" alt="ACK" />
          <h1>ACKDeck</h1>
        </header>
        <div className="pairing-intro">
          <span className="mobile-eyebrow">TELEFON VE BİLGİSAYAR</span>
          <h2>Her şey yanında.</h2>
          <p>Görevlerin, notların, derslerin ve namaz vakitlerin tek yerde.</p>
        </div>
        <h3>Telefonunu eşleştir</h3>
        <p>Safari paylaşım menüsünden Ana Ekrana Ekle'yi seçin. Uygulamayı Ana Ekranınızdan açıp bilgisayardaki Telefon bölümünün kodunu girin.</p>
        <form onSubmit={pair}>
          <label>Cihaz adı<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></label>
          <label>Eşleştirme kodu<input autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required /></label>
          <button disabled={busy || !ready}>Eşleştir</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main className={"mobile-app " + (page==="notes" ? "notes-page" : "")}>
      <div className="mobile-content" inert={!!form || !!subscriptionDraft}>
        {/* Modern App Header */}
        <header className="mobile-header">
          <div className="mobile-brand">
            <img src="/icon-192.png" alt="ACK" className="mobile-brand-icon" />
            <div>
              <strong>ACKDeck</strong>
              <span>{new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" })}</span>
            </div>
          </div>
          <div className="mobile-header-tools">
            <div className={`mobile-connection-pill ${online ? "online" : ""}`}>
              <span className="pill-dot" />
              <span>{online ? "PC Açık" : "Çevrimdışı"}</span>
            </div>
            <button
              type="button"
              className={`refresh-button ${busy ? "is-busy" : ""}`}
              aria-label="Kayıtları yenile"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <Icon name="refresh" size={19} />
            </button>
          </div>
        </header>

        {error && <p role="alert" className="error">{error}</p>}

        {/* 1. TODAY TAB (Günün Akışı & Görevler) */}
        {(page === "today" || page === "tasks") && (
          <>
            {/* Dynamic Greeting Strip with Weather */}
            <div className="mobile-greeting-strip">
              <span className="mobile-greeting-title">{mobileGreeting}</span>
              {weather ? (
                <div
                  className="mobile-greeting-weather"
                  title={`${weather.city} Hava Durumu: ${weather.temperature}°C, ${weather.desc}`}
                >
                  <span className="weather-symbol">{weather.symbol}</span>
                  <span className="weather-text">{weather.city} {weather.temperature}°C · {weather.desc}</span>
                </div>
              ) : (
                <div className="mobile-greeting-weather" title="Hava durumu yükleniyor">
                  <span className="weather-symbol">🌤️</span>
                  <span className="weather-text">Karabük yükleniyor…</span>
                </div>
              )}
            </div>

            {/* Quick Metrics Bar at Top */}
            <div className="mobile-metrics-bar">
              <button type="button" className="metric-chip" onClick={() => setSelectedMobileDate(today)}>
                <strong>{todayStudyBlocks.length > 0 ? todayStudyBlocks.length : todayTasks.length}</strong>
                <span>{todayStudyBlocks.length > 0 ? (todayStudyBlocks.length === 1 ? "1 Ders" : `${todayStudyBlocks.length} Ders`) : "Bugün"}</span>
              </button>
              <button type="button" className="metric-chip" onClick={() => { changePage("plan"); setPlanTab("calendar"); }}>
                <strong>{unfinished.length}</strong>
                <span>Aktif Görev</span>
              </button>
              <button type="button" className="metric-chip" onClick={() => { changePage("plan"); setPlanTab("calendar"); }}>
                <strong>{todayStudyBlocks.length}</strong>
                <span>Ders</span>
              </button>
              <button type="button" className="metric-chip" onClick={() => changePage("notes")}>
                <strong>{notesCount}</strong>
                <span>Not</span>
              </button>
            </div>

            {/* Unified Schedule & Weekly Strip Card */}
            <section className="mobile-timeline-section unified-schedule-box" aria-label="Günün akışı ve haftalık çizelge">
              {/* Header inside the unified card */}
              <div className="timeline-card-header-v2">
                <div className="timeline-header-meta">
                  <div className="timeline-header-icon-box">
                    <Icon name="grid" size={20} />
                  </div>
                  <div>
                    <h3 className="timeline-title-text">Haftalık Çizelge</h3>
                  </div>
                </div>
                <div className="timeline-header-actions">
                  {!isSelectedMobileToday && (
                    <button
                      type="button"
                      className="mobile-back-today-pill"
                      onClick={() => setSelectedMobileDate(today)}
                    >
                      Bugün
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => { changePage("plan"); setPlanTab("calendar"); }}
                    title="Tüm Haftalık Plan"
                  >
                    Tüm Plan ›
                  </button>
                </div>
              </div>

              {/* Horizontal Week Mini Strip directly inside the card */}
              <div className="mobile-week-strip-grid" style={{ marginBottom: "0.75rem" }}>
                {mobileWeekDays.map(day => (
                  <button
                    key={day.date}
                    type="button"
                    className={`mobile-week-cell ${day.date === selectedMobileDate ? "is-selected" : ""} ${day.date === today ? "is-today" : ""}`}
                    onClick={() => setSelectedMobileDate(day.date)}
                  >
                    <span className="mobile-week-cell-day">{day.shortLabel}</span>
                    <span className="mobile-week-cell-num">{day.dayNum}</span>
                  </button>
                ))}
              </div>

              {/* Sub-header matching SS 2 */}
              <div className="timeline-subhead-row">
                <span className="timeline-subhead-dot">•</span>
                <span>{isSelectedMobileToday ? "Bugünkü Oturumlar & İşler" : `${selectedMobileDateLabel} Oturumları & İşleri`}</span>
              </div>

              {/* Day's Chronological Feed */}
              <div className="mobile-timeline-list">
                {mobileTimelineItems.length === 0 ? (
                  <div className="mobile-empty-card">
                    <div className="empty-badge"><Icon name="checkCircle" size={32} /></div>
                    <strong>{isSelectedMobileToday ? "Harika, bugün bekleyen ders veya görev yok!" : `${selectedMobileDateLabel} için ders veya görev yok.`}</strong>
                  </div>
                ) : (
                  mobileTimelineItems.map(item => {
                    if (item.kind === "study") {
                      return (
                        <article className="mobile-timeline-card session-card" key={item.id}>
                          <span className="timeline-time-col">{item.time} – {item.endTime}</span>
                          <div className="timeline-content-col">
                            <strong className="timeline-item-title">{item.label}</strong>
                            {item.topic && <small className="timeline-item-sub">{item.topic}</small>}
                          </div>
                          <div className="timeline-end-col">
                            <span className="timeline-badge study-badge">Ders</span>
                          </div>
                        </article>
                      );
                    }

                    const { task, row } = item;
                    const hasEarlyReminder = Boolean(task.reminder && task.reminderLeadMinutes && task.reminderLeadMinutes > 0);
                    const hasMeta = hasEarlyReminder || task.recurrence;
                    return (
                      <article
                        className="mobile-timeline-card session-card task-session-row clickable"
                        key={row.id}
                        onClick={() => openForm("task", row)}
                      >
                        <span className="timeline-time-col">
                          {task.dueTime || "—"}
                          {task.reminder && <span className="timeline-alarm-bell" title="Alarm açık"> 🔔</span>}
                        </span>
                        <div className="timeline-content-col">
                          <strong className="timeline-item-title">{task.text}</strong>
                          {hasMeta && (
                            <div className="timeline-item-chips">
                              {hasEarlyReminder && (
                                <span className="timeline-chip alarm-chip" title="Erken Alarm">
                                  🔔 {task.reminderLeadMinutes} dk önce
                                </span>
                              )}
                              {task.recurrence && (
                                <span className="timeline-chip recurrence-chip" title="Tekrarlama">
                                  🔁 {recurrenceLabel(task.recurrence)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="timeline-end-col">
                          <span className="timeline-badge task-badge">Görev</span>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            {/* Dedicated Görevler Card */}
            <section className="mobile-tasks-card surface" aria-label="Görevler">
              <div className="mobile-tasks-header">
                <div className="mobile-tasks-title-group">
                  <div className="mobile-tasks-icon-box">
                    <Icon name="checkCircle" size={18} />
                  </div>
                  <div>
                    <h3 className="mobile-tasks-title">Görevler</h3>
                    <p className="mobile-tasks-subtitle">
                      {displayedMobileTasks.filter(r => !isOccurrenceCompleted(r.data as PhoneTask)).length} bekleyen görev
                    </p>
                  </div>
                </div>
                <div className="mobile-tasks-actions">
                  <button
                    className="primary-action-round"
                    type="button"
                    onClick={() => { openForm("task"); if (!isSelectedMobileToday) setDate(selectedMobileDate); }}
                    title="Görev Ekle"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Tasks List for today or selected day */}
              <div className="mobile-tasks-list">
                {tasks.filter(row => {
                  const t = row.data as PhoneTask;
                  if (isOccurrenceCompleted(t)) return false;
                  return t.dueDate === selectedMobileDate || (!t.dueDate && isSelectedMobileToday);
                }).length === 0 ? (
                  <div className="mobile-tasks-empty">
                    <p>Bu gün için bekleyen görev bulunmuyor.</p>
                  </div>
                ) : (
                  tasks
                    .filter(row => {
                      const t = row.data as PhoneTask;
                      if (isOccurrenceCompleted(t)) return false;
                      return t.dueDate === selectedMobileDate || (!t.dueDate && isSelectedMobileToday);
                    })
                    .map(row => {
                      const task = row.data as PhoneTask;
                      const isTaskDone = isOccurrenceCompleted(task);
                      const hasEarlyReminder = Boolean(task.reminder && task.reminderLeadMinutes && task.reminderLeadMinutes > 0);
                      const hasMeta = hasEarlyReminder || task.recurrence;
                      return (
                        <article className={`mobile-task-item ${isTaskDone ? "completed" : ""}`} key={row.id}>
                          <button
                            type="button"
                            className="mobile-task-toggle"
                            disabled={busy}
                            onClick={() => void complete(row)}
                            aria-label="Tamamlandı olarak işaretle"
                          >
                            {isTaskDone && <Icon name="check" size={12} />}
                          </button>
                          <button
                            type="button"
                            className="mobile-task-content"
                            onClick={() => openForm("task", row)}
                          >
                            <strong>{task.text}</strong>
                            <small>
                              {task.dueTime || (task.dueDate ? task.dueDate.split("-").reverse().join(".") : "Tarihsiz")}
                              {task.reminder && " · 🔔"}
                              {hasEarlyReminder && ` · ${task.reminderLeadMinutes} dk önce`}
                              {task.recurrence && ` · 🔁 ${recurrenceLabel(task.recurrence)}`}
                            </small>
                          </button>
                          <ActionMenu label={task.text + " işlemleri"}>
                            <button disabled={busy} onClick={() => void snooze(row, 15)}>15 dk ertele</button>
                            <button disabled={busy} onClick={() => void snooze(row, 60)}>1 saat ertele</button>
                            <button
                              disabled={busy}
                              className="danger-action"
                              onClick={() => {
                                if (confirm("Bu görev silinsin mi?")) {
                                  void saveMutation({ mutationId: crypto.randomUUID(), kind: "tasks", id: row.id, baseVersion: row.version, data: null, deleted: true })
                                    .then(() => setUndo({ row, expires: Date.now() + 10000 }))
                                    .catch(e => setError(e.message));
                                }
                              }}
                            >
                              Görevi sil
                            </button>
                          </ActionMenu>
                        </article>
                      );
                    })
                )}
              </div>

              {/* Completed Tasks Accordion */}
              {tasks.filter(row => isOccurrenceCompleted(row.data as PhoneTask)).length > 0 && (
                <details className="mobile-completed-accordion" style={{ marginTop: "0.85rem" }}>
                  <summary>Tamamlananlar ({tasks.filter(row => isOccurrenceCompleted(row.data as PhoneTask)).length})</summary>
                  <div className="mobile-completed-list">
                    {tasks
                      .filter(row => isOccurrenceCompleted(row.data as PhoneTask))
                      .sort((a, b) => completedTaskSortTime(b.data as PhoneTask) - completedTaskSortTime(a.data as PhoneTask))
                      .map(row => (
                        <article key={row.id} className="mobile-completed-item">
                          <p>{(row.data as PhoneTask).text}</p>
                          <button disabled={busy} onClick={() => void complete(row)}>Yeniden Aç</button>
                        </article>
                      ))}
                  </div>
                </details>
              )}
            </section>

            {/* Namaz Vakitleri Kartı */}
            <MobilePrayerCard records={state.records} onSave={saveMutation} />
          </>
        )}

        {/* 2. NOTES TAB */}
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

        {/* 3. PLAN TAB (Aylık Ders Planı & Abonelikler) */}
        {page === "plan" && (
          <>
            <div className="mobile-segmented-bar plan-toggle-bar">
              <button className={`segment-btn ${planTab === "calendar" ? "is-active" : ""}`} onClick={() => setPlanTab("calendar")}>
                Aylık Plan & Dersler
              </button>
              <button className={`segment-btn ${planTab === "subscriptions" ? "is-active" : ""}`} onClick={() => setPlanTab("subscriptions")}>
                Abonelikler ({state.records.filter(r => r.kind === "subscriptions" && !r.deleted).length})
              </button>
            </div>

            {planTab === "calendar" ? (
              <>
                <MobileWeek
                  disabled={busy}
                  onSave={saveMutation}
                  records={state.records}
                  onOpen={row => row.kind === "subscriptions" ? setSubscriptionDraft(row.data as Subscription) : openForm("task", row)}
                  onNew={day => { openForm("task"); setDate(day); }}
                  getReminder={id => studyReminders.find(r => r.id === id)?.leadMinutes ?? null}
                  onReminderChange={(id, lead) => updateStudyReminder(id, lead)}
                />
              </>
            ) : (
              <>
                <div className="page-heading subscription-page-header">
                  <button className="primary-action" onClick={() => setSubscriptionDraft(newSubscription())}>+ Abonelik Ekle</button>
                </div>
                <div className="subscription-totals">
                  <span>Aylık karşılık</span>
                  <div className="subscription-totals-amounts">
                    {monthlyTotals(state.records.filter(r => r.kind === "subscriptions" && !r.deleted).map(r => r.data as Subscription)).map(([c, a]) => (
                      <strong key={c}>{money(a, c)}</strong>
                    ))}
                  </div>
                </div>
                <p className="status subscription-status-note">Dönem tutarlarının aylık ortalaması; para birimleri ayrı tutulur.</p>

                {(() => {
                  const allRows = state.records.filter(r => r.kind === "subscriptions" && !r.deleted);
                  const sorted = [...allRows].sort((a, b) => {
                    const idxA = subOrder.indexOf(a.id);
                    const idxB = subOrder.indexOf(b.id);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return 0;
                  });
                  const visible = sorted.filter(r => !hiddenSubs.includes(r.id));
                  const hidden = sorted.filter(r => hiddenSubs.includes(r.id));
                  const visibleIds = visible.map(r => r.id);

                  return (
                    <>
                      <div className="subscription-list">
                        {visible.map((row, idx) => {
                          const sub = row.data as Subscription;
                          return (
                            <article className="subscription-row" key={row.id}>
                              <button className="mobile-task-open" type="button" onClick={() => setSubscriptionDraft(sub)}>
                                <h3>{sub.name}</h3>
                                <p className="subscription-price">{money(sub.amount, sub.currency)} / {cycleLabel(sub)}</p>
                                <span className={`subscription-badge status-${sub.status}`}>
                                  {sub.status === "active" ? paymentLabel(sub) : sub.status === "paused" ? "Duraklatıldı" : "İptal edildi"}
                                </span>
                              </button>
                              <div className="subscription-card-actions">
                                <div className="subscription-order-buttons">
                                  <button
                                    type="button"
                                    className="order-btn"
                                    disabled={idx === 0}
                                    onClick={() => moveSub(row.id, -1, visibleIds)}
                                    title="Yukarı taşı"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    className="order-btn"
                                    disabled={idx === visible.length - 1}
                                    onClick={() => moveSub(row.id, 1, visibleIds)}
                                    title="Aşağı taşı"
                                  >
                                    ▼
                                  </button>
                                </div>
                                <ActionMenu label={sub.name + " işlemleri"}>
                                  <button onClick={() => toggleHideSub(row.id)}>Aboneliği Gizle</button>
                                  <button onClick={() => setSubscriptionDraft(sub)}>Düzenle</button>
                                  <button
                                    className="danger-action"
                                    disabled={busy}
                                    onClick={() => {
                                      if (confirm("Yalnızca abonelik kaydı silinsin mi? Hizmet sağlayıcısındaki aboneliğiniz değişmez.")) {
                                        void saveMutation({ mutationId: crypto.randomUUID(), kind: "subscriptions", id: row.id, baseVersion: row.version, data: null, deleted: true })
                                          .then(() => setUndo({ row, expires: Date.now() + 10000 }))
                                          .catch(e => setError(e.message));
                                      }
                                    }}
                                  >
                                    Kaydı sil
                                  </button>
                                </ActionMenu>
                              </div>
                            </article>
                          );
                        })}
                        {visible.length === 0 && <p className="status" style={{ textAlign: "center", padding: "1.5rem" }}>Görünür abonelik yok.</p>}
                      </div>

                      {hidden.length > 0 && (
                        <div className="hidden-subs-container">
                          <button
                            type="button"
                            className="text-action hidden-subs-toggle"
                            onClick={() => setShowHiddenSubs(v => !v)}
                          >
                            {showHiddenSubs ? "Gizlenen abonelikleri kapat" : `Gizlenen abonelikler (${hidden.length})`}
                          </button>
                          {showHiddenSubs && (
                            <div className="subscription-list is-hidden-sub-list">
                              {hidden.map(row => {
                                const sub = row.data as Subscription;
                                return (
                                  <article className="subscription-row is-hidden-sub" key={row.id}>
                                    <button className="mobile-task-open" type="button" onClick={() => setSubscriptionDraft(sub)}>
                                      <h3>{sub.name} <small style={{ color: "var(--app-muted)" }}>(Gizli)</small></h3>
                                      <p className="subscription-price">{money(sub.amount, sub.currency)}</p>
                                    </button>
                                    <button
                                      type="button"
                                      className="unhide-btn"
                                      onClick={() => toggleHideSub(row.id)}
                                    >
                                      Görünür Yap
                                    </button>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* 4. GÖNDER SEKMESİ (Masaüstüne Gönder) */}
        {page === "send" && (
          <div className="more-sections-container">
            <div className="send-tab-header">
              <div>
                <h2>Masaüstüne Gönder</h2>
                <p className="mobile-work-hint">Not, bağlantı, ses veya dosyanı bilgisayarına anında ilet.</p>
              </div>
              <button
                type="button"
                className="settings-open-btn"
                onClick={() => changePage("settings")}
                title="Ayarlar"
              >
                <Icon name="settings" size={18} />
                <span>Ayarlar</span>
              </button>
            </div>

            <section className="more-section-card">
              <SendCard
                busy={busy || sending.current}
                recording={recording}
                audio={audio}
                feedback={sendFeedback}
                file={selectedFile}
                onSelectFile={file => { setSelectedFile(file); if (file) { setSendFeedback(""); setError(""); } }}
                onOpen={kind => { setSendFeedback(""); openForm(kind); }}
                onFile={file => upload(file, file.name)}
                onRecord={() => recording ? recorder.current?.stop() : void startRecording()}
                onAudioSend={() => {
                  if (audio) void upload(audio, `Sesli-not.${audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm"}`);
                }}
                onAudioCancel={() => setAudio(null)}
              />
              {inboxLoaded && inbox.length > 0 && (
                <details className="mobile-completed-accordion" style={{ marginTop: "0.75rem" }}>
                  <summary>Gönderilenler ({inbox.length})</summary>
                  <div className="sent-history-list" style={{ marginTop: "0.5rem" }}>
                    {inbox.slice(0, 8).map(item => (
                      <article key={item.id} className="mobile-sent-card">
                        <div className="mobile-sent-header">
                          <h3>{item.title}</h3>
                          <span className={`sent-status-chip ${item.handled ? "is-handled" : "is-pending"}`}>
                            {item.handled ? "İşlendi" : "Bekliyor"}
                          </span>
                        </div>
                        <MobileInboxProcessing
                          item={item}
                          records={state.records}
                          onSave={saveMutation}
                          onHandled={() => api(state, "inbox/handle", json({ id: item.id })).then(() => setInbox(current => current.map(row => row.id === item.id ? { ...row, handled: Date.now() } : row)))}
                        />
                      </article>
                    ))}
                  </div>
                </details>
              )}
            </section>
          </div>
        )}

        {/* 5. AYARLAR SEKMESİ (Gönder sekmesindeki butondan açılır) */}
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

        {/* Conflicts */}
        {state.conflicts.map((conflict, index) => (
          <article key={index} className="mobile-conflict-card">
            <h3>Eşitleme çakışması</h3>
            <p>Bu kayıt başka cihazda değişti. İki sürüm korundu.</p>
            <div className="actions">
              <button
                disabled={busy}
                onClick={() => {
                  void commit({
                    ...state,
                    conflicts: state.conflicts.filter((_, i) => i !== index),
                    records: conflict.server ? [...state.records.filter(r => r.id !== conflict.server!.id || r.kind !== conflict.server!.kind), conflict.server] : state.records,
                  }).catch(e => setError(e.message));
                }}
              >
                Bulut sürümünü kullan
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const mutation = { ...conflict.mutation, mutationId: crypto.randomUUID(), baseVersion: conflict.server?.version ?? 0 };
                  const next = { ...state, conflicts: state.conflicts.filter((_, i) => i !== index), queue: [...state.queue, mutation] };
                  void commit(next).then(() => refresh(next)).catch(e => setError(e.message));
                }}
              >
                Yerel sürümü gönder
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Subscription Editor */}
      {subscriptionDraft && (
        <section ref={subscriptionEditorRef} className="editor" role="dialog" aria-modal="true" aria-label="Abonelik düzenle" onClick={e => { if (e.target === e.currentTarget) setSubscriptionDraft(null); }}>
          <div>
            <SubscriptionForm
              key={subscriptionDraft.id}
              initial={subscriptionDraft}
              busy={busy}
              onCancel={() => setSubscriptionDraft(null)}
              onSave={async sub => {
                const row = state.records.find(r => r.kind === "subscriptions" && r.id === sub.id);
                await saveMutation({ mutationId: crypto.randomUUID(), kind: "subscriptions", id: sub.id, baseVersion: row?.version ?? 0, data: sub, deleted: false });
                setSubscriptionDraft(null);
              }}
            />
          </div>
        </section>
      )}

      {/* Undo & Notice Toasts */}
      {undo && undo.expires > Date.now() && (
        <div className="undo-toast" role="status">
          Kayıt silindi
          <button
            disabled={busy}
            onClick={() => {
              const row = state.records.find(r => r.kind === undo.row.kind && r.id === undo.row.id);
              void saveMutation({ mutationId: crypto.randomUUID(), kind: undo.row.kind, id: undo.row.id, baseVersion: row?.version ?? undo.row.version + 1, data: undo.row.data, deleted: false })
                .then(() => setUndo(null))
                .catch(e => setError(e.message));
            }}
          >
            Geri al
          </button>
        </div>
      )}

      {notice && <div className="mobile-toast" role="status">{notice}</div>}

      {/* Note Editor */}
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
            onDelete={editing ? () => {
              if (confirm("Bu not silinsin mi?")) {
                void saveMutation({ mutationId: crypto.randomUUID(), kind: "notes", id: editing.id, baseVersion: editing.version, data: null, deleted: true })
                  .then(() => { setUndo({ row: editing, expires: Date.now() + 10000 }); setForm(null); })
                  .catch(e => setError(e.message));
              }
            } : undefined}
          />
        </section>
      )}

      {/* Task / Prompt / Link Editor */}
      {form && form !== "note" && (
        <section ref={editorRef} className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div>
            <div className="editor-heading">
              <h2 id="editor-title">{form === "task" ? "Görev" : form === "link" ? "Link Gönder" : form === "ai_prompt" ? "ACK AI'a Mesaj Bırak" : "Metin Gönder"}</h2>
              <button type="button" aria-label="Düzenleyiciyi kapat" disabled={busy} onClick={closeForm}>×</button>
            </div>
            <form onSubmit={submit}>
              {form === "task" && (
                <label>
                  Görev metni
                  <input autoFocus value={title} onChange={e => setTitle(e.target.value)} required maxLength={2000} />
                </label>
              )}
              {form !== "task" && (
                <label>
                  {form === "link" ? "Web adresi" : "İçerik"}
                  <textarea autoFocus disabled={busy || sending.current} value={content} onChange={e => { setContent(e.target.value); formRequestId.current = crypto.randomUUID(); }} required maxLength={20000} />
                </label>
              )}
              {form === "task" && (
                <>
                  <div className="editor-row">
                    <label>
                      {recurrence ? "Başlangıç günü" : "Tarih"}
                      <input type="date" value={date} onChange={e => { setDate(e.target.value); if (!e.target.value) setReminder(false); }} />
                    </label>
                    <label>
                      Saat
                      <input type="time" value={time} onChange={e => { setTime(e.target.value); if (!e.target.value) setReminder(false); }} />
                    </label>
                  </div>
                  <RecurrenceFields key={editing?.id ?? "new"} value={recurrence} date={date} time={time} onChange={rule => { setRecurrence(rule); if (rule) { setDate(date || rule.start); setTime(time || rule.time); } }} />
                  <label className="toggle">
                    <input type="checkbox" checked={reminder} disabled={!date || !time} onChange={e => setReminder(e.target.checked)} />
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
                        {reminderLead && ![0, 15, 60, 1440].includes(reminderLead) && <option value={reminderLead}>{reminderLead} dakika önce</option>}
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="actions">
                <button disabled={busy}>{form === "task" ? "Kaydet" : "Gönder"}</button>
                <button type="button" disabled={busy} onClick={closeForm}>İptal</button>
                {editing && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Bu kayıt silinsin mi?")) {
                        void saveMutation({ mutationId: crypto.randomUUID(), kind: editing.kind, id: editing.id, baseVersion: editing.version, data: null, deleted: true })
                          .then(() => { setUndo({ row: editing, expires: Date.now() + 10000 }); setForm(null); })
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

      {/* Bottom Native Tab Navigation */}
      <MobileNav page={page} onChange={changePage} />
    </main>
  );
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(reg => {
    void reg.update();
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}
createRoot(document.getElementById("root")!).render(<App />);
