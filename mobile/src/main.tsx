import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MAX_ATTACHMENT, type PhoneNote } from "../../shared/phone";
import { RecurrenceFields } from "../../shared/RecurrenceFields";
import { SubscriptionForm } from "../../shared/SubscriptionForm";
import { MobileFormModal } from "./MobileFormModal";
import { MobileLockScreen } from "./MobileLockScreen";
import { MobileMoreViews } from "./MobileMoreViews";
import { MobileNav } from "./MobileNav";
import {
  MobileAppHeader,
  MobileConflictCards,
  MobilePairingScreen,
  MobileToasts,
} from "./MobileShellParts";
import { MobileTodayView } from "./MobileTodayView";
import { MobileWeatherModal } from "./MobileWeatherModal";
import { NoteAttachments } from "./NoteAttachments";
import { NoteEditor } from "./NoteEditor";
import { deriveMobileAppData } from "./mobileAppHelpers";
import { useCollapsedCards } from "./useCollapsedCards";
import { useMobileAppController } from "./useMobileAppController";
import "./style.css";
import "./styles/prayer.css";
import "./styles/tasks-inbox.css";
import "./styles/editor-views.css";
import "./styles/timeline-settings.css";
import "./styles/cards-dorm-weather.css";
import "./styles/media-ai.css";
import "./styles/prayer-guide.css";
import "./styles/prayer-guide-details.css";
import "./styles/prayer-month.css";
import "./styles/lock-pomodoro.css";
import "./notes.css";

function App() {
  const { isCollapsed, toggle: toggleCard } = useCollapsedCards();
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const recordingStarting = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = () => {
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
  };

  const ctrl = useMobileAppController({ audio, setAudio, stopRecording });
  const {
    state, ready, page, pageRef, changePage, busy, error, setError, notice, setNotice,
    weather, weatherModalOpen, setWeatherModalOpen, form, setForm, editing,
    title, setTitle, content, setContent, date, setDate, time, setTime,
    reminder, setReminder, recurrence, setRecurrence, subscriptionDraft, setSubscriptionDraft,
    reminderLead, setReminderLead, undo, setUndo, planTab, setPlanTab, sendTab, setSendTab,
    studyReminders, updateStudyReminder, formRequestId, sending, inboxLoaded, sendFeedback,
    setSendFeedback, selectedFile, setSelectedFile, code, setCode, name, setName,
    online, push, setPush, isLocked, setIsLocked, inbox, setInbox,
    attendance, toggleMobileStudyBlock, commit, refresh, pair, openForm, closeForm,
    saveMutation, submit, complete, snooze, upload, handleSendText, reorderNote,
  } = ctrl;

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

  const {
    tasks,
    today,
    unfinished,
    todayTasks,
    allWeekStudyBlocks,
    todayStudyBlocks,
    mobileGreeting,
    notesCount,
  } = deriveMobileAppData(state.records);

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
        <MobileAppHeader online={online} busy={busy} onRefresh={() => void refresh()} />
        {error && <p role="alert" className="error">{error}</p>}

        {(page === "today" || page === "tasks") && (
          <MobileTodayView
            mobileGreeting={mobileGreeting}
            weather={weather}
            today={today}
            tasks={tasks}
            unfinished={unfinished}
            todayTasks={todayTasks}
            todayStudyBlocks={todayStudyBlocks}
            allWeekStudyBlocks={allWeekStudyBlocks}
            notesCount={notesCount}
            attendance={attendance}
            records={state.records}
            busy={busy}
            isCollapsed={isCollapsed}
            toggleCard={toggleCard}
            onOpenWeatherModal={() => setWeatherModalOpen(true)}
            onOpenPlanCalendar={() => {
              changePage("plan");
              setPlanTab("calendar");
            }}
            onOpenNotes={() => changePage("notes")}
            onOpenTaskForm={row => openForm("task", row)}
            onNewTask={defaultToday => {
              openForm("task");
              if (defaultToday) setDate(today);
            }}
            onToggleStudyBlock={toggleMobileStudyBlock}
            onCompleteTask={row => void complete(row)}
            onSnoozeTask={(row, mins) => void snooze(row, mins)}
            onSaveMutation={saveMutation}
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
        )}

        <MobileMoreViews
          page={page}
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
          planTab={planTab}
          setPlanTab={setPlanTab}
          sendTab={sendTab}
          setSendTab={setSendTab}
          name={name}
          setName={setName}
          push={push}
          setPush={setPush}
          tasksCount={tasks.length}
          notesCount={notesCount}
          studyReminders={studyReminders}
          onChangePage={changePage}
          onCommit={commit}
          onRefresh={() => refresh()}
          onSaveMutation={saveMutation}
          onOpenForm={(kind, row) => openForm(kind, row)}
          onNewTaskOnDay={day => {
            openForm("task");
            setDate(day);
          }}
          onOpenSubscription={sub => setSubscriptionDraft(sub)}
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
          onUpdateStudyReminder={updateStudyReminder}
          onReorderNote={reorderNote}
          onSelectFile={setSelectedFile}
          onSendText={handleSendText}
          onUploadFile={(file, filename) => upload(file, filename)}
          onToggleRecord={() => (recording ? recorder.current?.stop() : void startRecording())}
          onCancelAudio={() => setAudio(null)}
          onClearSendFeedback={() => setSendFeedback("")}
          onNotice={setNotice}
          onError={setError}
        />

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
        <MobileFormModal
          editorRef={editorRef}
          form={form}
          editing={editing}
          busy={busy}
          sending={sending.current}
          error={error}
          title={title}
          setTitle={setTitle}
          content={content}
          setContent={setContent}
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          reminder={reminder}
          setReminder={setReminder}
          reminderLead={reminderLead}
          setReminderLead={setReminderLead}
          hasRecurrence={Boolean(recurrence)}
          recurrenceSection={
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
          }
          onResetFormRequestId={() => {
            formRequestId.current = crypto.randomUUID();
          }}
          onSubmit={event => void submit(event)}
          onClose={closeForm}
          onSaveMutation={saveMutation}
          onDeleted={row => {
            setUndo({ row, expires: Date.now() + 10000 });
            setForm(null);
          }}
          onError={setError}
        />
      )}

      {weatherModalOpen && weather && (
        <MobileWeatherModal weather={weather} onClose={() => setWeatherModalOpen(false)} />
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
