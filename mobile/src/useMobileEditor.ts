import { useEffect, useRef, useState, type FormEvent } from "react";
import { moveBy } from "../../src/reorder";
import type { CloudRecord, Mutation, PhoneNote, PhoneTask } from "../../shared/phone";
import { productMetadata } from "../../shared/productivity";
import { completeOccurrence, isOccurrenceCompleted, uncompleteOccurrence, type Recurrence } from "../../shared/recurrence";
import type { Subscription } from "../../shared/subscriptions";
import { buildSnoozedTaskData, buildTaskMutationData } from "./mobileAppHelpers";
import { api, enqueue, json, readState, type MobileState } from "./store";

type UseMobileEditorParams = {
  state: MobileState;
  stateRef: { current: MobileState };
  lockedRef: { current: boolean };
  sendingRef: { current: boolean };
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setSendFeedback: (feedback: string) => void;
  commit: (value: MobileState) => Promise<void>;
  refresh: (value?: MobileState, silent?: boolean) => Promise<void>;
  setPage: (page: string) => void;
};

/** Form/modal editing, optimistic conflict checks, task/note mutations, undo, and deep-link handling. */
export function useMobileEditor({
  state,
  stateRef,
  lockedRef,
  sendingRef,
  ready,
  busy,
  setBusy,
  setError,
  setNotice,
  setSendFeedback,
  commit,
  refresh,
  setPage,
}: UseMobileEditorParams) {
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
  const formRequestId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), Math.max(0, undo.expires - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);

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

  useEffect(() => {
    const taskId = notificationTask;
    if (!taskId || !ready) return;
    const row = state.records.find((item) => item.kind === "tasks" && item.id === taskId && !item.deleted);
    if (row) {
      setPage("today");
      openForm("task", row);
      history.replaceState(null, "", location.pathname);
      setNotificationTask(null);
    }
  }, [ready, state.records, notificationTask]);

  async function saveMutation(mutation: Mutation) {
    if (lockedRef.current) throw new Error("Eşitleme sürüyor. Biraz sonra deneyin.");
    if (form && editing && mutation.kind === editing.kind && mutation.id === editing.id) {
      const latest = stateRef.current.records.find((r) => r.kind === editing.kind && r.id === editing.id);
      if (!latest || latest.deleted || latest.version !== editing.version) {
        throw new Error("Kayıt başka bir cihazda değişti. Taslağın burada; güncel kaydı yeniden açıp kontrol et.");
      }
    }
    lockedRef.current = true;
    let next: MobileState;
    try {
      next = enqueue(stateRef.current, mutation);
      await commit(next);
    } finally {
      lockedRef.current = false;
    }
    setNotice(navigator.onLine ? "Kaydedildi; eşitleniyor…" : "Çevrimdışı — bağlantı gelince eşitlenecek.");
    void refresh(next);
  }

  function closeForm() {
    if (busy || sendingRef.current) return;
    const previous = editing?.data as PhoneNote | undefined;
    if (
      form === "note" &&
      (title !== (previous?.title ?? "") || content !== (previous?.content ?? "")) &&
      !confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi? Kaydet düğmesiyle kaydedebilirsin.")
    ) {
      return;
    }
    if (form && !["note", "task"].includes(form) && content.trim() && !confirm("Gönderilmemiş içerikten vazgeçilsin mi?")) {
      return;
    }
    setForm(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sendingRef.current || busy) return;
    sendingRef.current = true;
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
          stateRef.current,
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
      sendingRef.current = false;
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

  async function reorderNote(id: string, direction: number) {
    const rawNotes = state.records.filter((r) => r.kind === "notes" && !r.deleted && r.data);
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
    const ordered = moveBy(sorted, id, direction).map((row) => row.id);
    try {
      const latest = await readState();
      const next = { ...latest, noteOrder: ordered };
      await commit(next);
    } catch {
      setError("Not sırası kaydedilemedi.");
    }
  }

  return {
    form,
    setForm,
    editing,
    title,
    setTitle,
    content,
    setContent,
    date,
    setDate,
    time,
    setTime,
    reminder,
    setReminder,
    recurrence,
    setRecurrence,
    subscriptionDraft,
    setSubscriptionDraft,
    reminderLead,
    setReminderLead,
    undo,
    setUndo,
    setNotificationTask,
    formRequestId,
    openForm,
    closeForm,
    saveMutation,
    submit,
    complete,
    snooze,
    reorderNote,
  };
}
