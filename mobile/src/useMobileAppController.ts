import { useEffect, useRef, useState } from "react";
import { useMobileHashRouting, useMobileStudyAttendance, useMobileWeather } from "./mobileAppHelpers";
import { useMobileEditor } from "./useMobileEditor";
import { useMobileSend } from "./useMobileSend";
import { useMobileSync } from "./useMobileSync";

type UseMobileAppControllerParams = {
  audio: Blob | null;
  setAudio: (blob: Blob | null) => void;
  stopRecording: () => void;
};

/** Thin controller composing mobile sync, weather, send, editor, attendance, and hash routing hooks. */
export function useMobileAppController({ audio, setAudio, stopRecording }: UseMobileAppControllerParams) {
  const [page, setPage] = useState<string>("today");
  const [planTab, setPlanTab] = useState<"calendar" | "subscriptions">("calendar");
  const [sendTab, setSendTab] = useState<"ai" | "send">("ai");

  const pageRef = useRef(page);
  pageRef.current = page;

  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  const sending = useRef(false);

  const sync = useMobileSync({ stopRecordingRef });
  const weatherState = useMobileWeather();

  const sendState = useMobileSend({
    audio,
    setAudio,
    stateRef: sync.stateRef,
    lockedRef: sync.lockedRef,
    sendingRef: sending,
    busy: sync.busy,
    setBusy: sync.setBusy,
    setError: sync.setError,
    setNotice: sync.setNotice,
    refresh: sync.refresh,
  });

  const editorState = useMobileEditor({
    state: sync.state,
    stateRef: sync.stateRef,
    lockedRef: sync.lockedRef,
    sendingRef: sending,
    ready: sync.ready,
    busy: sync.busy,
    setBusy: sync.setBusy,
    setError: sync.setError,
    setNotice: sync.setNotice,
    setSendFeedback: sendState.setSendFeedback,
    commit: sync.commit,
    refresh: sync.refresh,
    setPage,
  });

  const attendanceState = useMobileStudyAttendance({
    ready: sync.ready,
    records: sync.state.records,
    isLockedRef: sync.lockedRef,
    getLatestRecords: () => sync.stateRef.current.records,
    saveMutation: editorState.saveMutation,
  });

  useMobileHashRouting({
    setPage,
    setPlanTab,
    setSendTab,
    setNotificationTask: editorState.setNotificationTask,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    if ((page !== "send" || sendTab !== "send") && page !== "inbox") {
      stopRecordingRef.current();
    }
  }, [page, sendTab]);

  function changePage(next: string) {
    setPage(next);
    window.scrollTo(0, 0);
  }

  return {
    state: sync.state,
    ready: sync.ready,
    page,
    pageRef,
    changePage,
    busy: sync.busy,
    error: sync.error,
    setError: sync.setError,
    notice: sync.notice,
    setNotice: sync.setNotice,
    weather: weatherState.weather,
    weatherModalOpen: weatherState.weatherModalOpen,
    setWeatherModalOpen: weatherState.setWeatherModalOpen,
    form: editorState.form,
    setForm: editorState.setForm,
    editing: editorState.editing,
    title: editorState.title,
    setTitle: editorState.setTitle,
    content: editorState.content,
    setContent: editorState.setContent,
    date: editorState.date,
    setDate: editorState.setDate,
    time: editorState.time,
    setTime: editorState.setTime,
    reminder: editorState.reminder,
    setReminder: editorState.setReminder,
    recurrence: editorState.recurrence,
    setRecurrence: editorState.setRecurrence,
    subscriptionDraft: editorState.subscriptionDraft,
    setSubscriptionDraft: editorState.setSubscriptionDraft,
    reminderLead: editorState.reminderLead,
    setReminderLead: editorState.setReminderLead,
    undo: editorState.undo,
    setUndo: editorState.setUndo,
    planTab,
    setPlanTab,
    sendTab,
    setSendTab,
    studyReminders: sync.studyReminders,
    updateStudyReminder: sync.updateStudyReminder,
    formRequestId: editorState.formRequestId,
    sending,
    inboxLoaded: sync.inboxLoaded,
    sendFeedback: sendState.sendFeedback,
    setSendFeedback: sendState.setSendFeedback,
    selectedFile: sendState.selectedFile,
    setSelectedFile: sendState.setSelectedFile,
    code: sync.code,
    setCode: sync.setCode,
    name: sync.name,
    setName: sync.setName,
    online: sync.online,
    push: sync.push,
    setPush: sync.setPush,
    isLocked: sync.isLocked,
    setIsLocked: sync.setIsLocked,
    inbox: sync.inbox,
    setInbox: sync.setInbox,
    attendance: attendanceState.attendance,
    toggleMobileStudyBlock: attendanceState.toggleMobileStudyBlock,
    commit: sync.commit,
    refresh: sync.refresh,
    pair: sync.pair,
    openForm: editorState.openForm,
    closeForm: editorState.closeForm,
    saveMutation: editorState.saveMutation,
    submit: editorState.submit,
    complete: editorState.complete,
    snooze: editorState.snooze,
    upload: sendState.upload,
    handleSendText: sendState.handleSendText,
    reorderNote: editorState.reorderNote,
  };
}
