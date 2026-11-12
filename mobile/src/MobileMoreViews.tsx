import type { Dispatch, SetStateAction } from "react";
import type { CloudRecord, Mutation } from "../../shared/phone";
import type { Subscription } from "../../shared/subscriptions";
import { MobileMediaTracker } from "./MobileMediaTracker";
import { MobilePlanView } from "./MobilePlanView";
import { MobileSendView, type MobileInboxItem } from "./MobileSendView";
import { MobileSettings } from "./MobileSettings";
import { NotesList } from "./NotesList";
import type { MobileState } from "./store";

type MobileMoreViewsProps = {
  page: string;
  state: MobileState;
  online: boolean;
  busy: boolean;
  sending: boolean;
  recording: boolean;
  audio: Blob | null;
  sendFeedback: string;
  selectedFile: File | null;
  inboxLoaded: boolean;
  inbox: MobileInboxItem[];
  setInbox: Dispatch<SetStateAction<MobileInboxItem[]>>;
  planTab: "calendar" | "subscriptions";
  setPlanTab: (tab: "calendar" | "subscriptions") => void;
  sendTab: "ai" | "send";
  setSendTab: (tab: "ai" | "send") => void;
  name: string;
  setName: (name: string) => void;
  push: boolean;
  setPush: (push: boolean) => void;
  tasksCount: number;
  notesCount: number;
  studyReminders: { id: string; leadMinutes: number | null }[];
  onChangePage: (next: string) => void;
  onCommit: (next: MobileState) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSaveMutation: (mutation: Mutation) => Promise<void>;
  onOpenForm: (kind: "task" | "note", row?: CloudRecord | null) => void;
  onNewTaskOnDay: (day: string) => void;
  onOpenSubscription: (sub: Subscription) => void;
  onDeleteSubscription: (row: CloudRecord) => void;
  onUpdateStudyReminder: (programId: string, leadMinutes: number | null) => void;
  onReorderNote: (id: string, direction: number) => Promise<void>;
  onSelectFile: (file: File | null) => void;
  onSendText: (kind: "text" | "link" | "ai_prompt", text: string) => Promise<boolean>;
  onUploadFile: (file: File | Blob, filename: string) => Promise<boolean>;
  onToggleRecord: () => void;
  onCancelAudio: () => void;
  onClearSendFeedback: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
};

/** Secondary mobile tab views: Notes, Plan/Subscriptions, Media Collection, AI/Send, and Settings. */
export function MobileMoreViews({
  page,
  state,
  online,
  busy,
  sending,
  recording,
  audio,
  sendFeedback,
  selectedFile,
  inboxLoaded,
  inbox,
  setInbox,
  planTab,
  setPlanTab,
  sendTab,
  setSendTab,
  name,
  setName,
  push,
  setPush,
  tasksCount,
  notesCount,
  studyReminders,
  onChangePage,
  onCommit,
  onRefresh,
  onSaveMutation,
  onOpenForm,
  onNewTaskOnDay,
  onOpenSubscription,
  onDeleteSubscription,
  onUpdateStudyReminder,
  onReorderNote,
  onSelectFile,
  onSendText,
  onUploadFile,
  onToggleRecord,
  onCancelAudio,
  onClearSendFeedback,
  onNotice,
  onError,
}: MobileMoreViewsProps) {
  return (
    <>
      {page === "notes" && (
        <NotesList
          syncLabel={busy ? "Eşitleniyor…" : state.queue.length ? "Eşitleme bekliyor" : "Güncel"}
          records={state.records}
          noteOrder={state.noteOrder}
          onReorder={onReorderNote}
          onNew={() => onOpenForm("note")}
          onOpen={row => onOpenForm("note", row)}
        />
      )}

      {page === "plan" && (
        <MobilePlanView
          planTab={planTab}
          setPlanTab={setPlanTab}
          busy={busy}
          records={state.records}
          studyReminders={studyReminders}
          onSaveMutation={onSaveMutation}
          onOpenTask={row => onOpenForm("task", row)}
          onNewTaskOnDay={onNewTaskOnDay}
          onOpenSubscription={onOpenSubscription}
          onUpdateStudyReminder={onUpdateStudyReminder}
          onDeleteSubscription={onDeleteSubscription}
        />
      )}

      {page === "media" && (
        <MobileMediaTracker
          state={state}
          records={state.records}
          onSave={onSaveMutation}
          disabled={busy}
          onNotice={onNotice}
          onError={onError}
        />
      )}

      {page === "send" && (
        <MobileSendView
          sendTab={sendTab}
          setSendTab={setSendTab}
          state={state}
          online={online}
          busy={busy}
          sending={sending}
          recording={recording}
          audio={audio}
          sendFeedback={sendFeedback}
          selectedFile={selectedFile}
          inboxLoaded={inboxLoaded}
          inbox={inbox}
          setInbox={setInbox}
          onOpenSettings={() => onChangePage("settings")}
          onSelectFile={file => {
            onSelectFile(file);
            if (file) {
              onClearSendFeedback();
              onError("");
            }
          }}
          onSendText={onSendText}
          onUploadFile={onUploadFile}
          onToggleRecord={onToggleRecord}
          onCancelAudio={onCancelAudio}
          onNotice={onNotice}
          onError={onError}
        />
      )}

      {page === "settings" && (
        <MobileSettings
          state={state}
          commit={onCommit}
          busy={busy}
          name={name}
          setName={setName}
          push={push}
          setPush={setPush}
          online={online}
          tasksCount={tasksCount}
          notesCount={notesCount}
          onNotice={onNotice}
          onError={onError}
          onBack={() => onChangePage("send")}
          onSync={onRefresh}
        />
      )}
    </>
  );
}
