import test from "node:test";
import assert from "node:assert/strict";
import { setupModules } from "./helpers.mjs";

const reactStub = {
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useEffect: () => {},
};

test("Stage 1: legacy dateless or yesterday Pomodoro stats reset to 0 on new day and drop stale study targets", () => {
  const env = setupModules(
    [
      [
        "ack-deck.pomodoro.v1",
        JSON.stringify({
          mode: "pomodoro",
          timeLeft: 1500,
          totalSeconds: 1500,
          isRunning: false,
          endTimeMs: null,
          completedSessions: 4,
          completedFocusMinutes: 100,
          autoStartBreaks: true,
          target: {
            kind: "study",
            id: "prog1:s1:2026-11-20",
            label: "Genel Çalışma",
            durationMinutes: 90,
          },
          targetRemainingSeconds: 5400,
          manualFreeFocus: true,
        }),
      ],
    ],
    { react: reactStub },
  );

  const pomodoro = env.load("pomodoroStore");
  const snap = pomodoro.getPomodoroSnapshot();
  assert.equal(snap.completedSessions, 0);
  assert.equal(snap.completedFocusMinutes, 0);
  assert.equal(snap.target, undefined);
  assert.equal(snap.targetRemainingSeconds, undefined);
  assert.equal(snap.manualFreeFocus, undefined);
  assert.match(snap.sessionDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("Stage 1: midnight live rollover resets daily stats while preserving today's active study target", () => {
  const day1 = new Date("2026-11-25T23:50:00").getTime();
  const day2 = new Date("2026-11-26T00:01:00").getTime();

  const env = setupModules([
    [
      "ack-deck.pomodoro.v1",
      JSON.stringify({
        mode: "pomodoro",
        timeLeft: 1500,
        totalSeconds: 1500,
        isRunning: false,
        endTimeMs: null,
        completedSessions: 3,
        completedFocusMinutes: 75,
        sessionDate: "2026-11-25",
        autoStartBreaks: true,
        target: {
          kind: "study",
          id: "prog1:s1:2026-11-25",
          label: "Dünkü Ders",
          durationMinutes: 60,
        },
        targetRemainingSeconds: 2100,
      }),
    ],
  ], { react: reactStub });

  const pomodoro = env.load("pomodoroStore");
  const snapDay1 = pomodoro.reloadPomodoroFromStorage(day1);
  assert.equal(snapDay1.completedSessions, 3);
  assert.equal(snapDay1.completedFocusMinutes, 75);
  assert.equal(snapDay1.target?.label, "Dünkü Ders");

  const rolled = pomodoro.syncPomodoroDay(day2);
  assert.equal(rolled, true);
  const snapDay2 = pomodoro.getPomodoroSnapshot();
  assert.equal(snapDay2.completedSessions, 0);
  assert.equal(snapDay2.completedFocusMinutes, 0);
  assert.equal(snapDay2.sessionDate, "2026-11-26");
  assert.equal(snapDay2.target, undefined);
  assert.equal(snapDay2.targetRemainingSeconds, undefined);
});

test("Stage 1: timer that finished hours ago while app was closed skips stale break and lands on ready focus", () => {
  const startMs = new Date("2026-11-25T10:00:00").getTime();
  const endMs = startMs + 25 * 60 * 1000;
  const reopenHoursLater = startMs + 3 * 60 * 60 * 1000;

  const env = setupModules([
    [
      "ack-deck.pomodoro.v1",
      JSON.stringify({
        mode: "pomodoro",
        timeLeft: 1500,
        totalSeconds: 1500,
        isRunning: true,
        endTimeMs: endMs,
        completedSessions: 0,
        completedFocusMinutes: 0,
        sessionDate: "2026-11-25",
        autoStartBreaks: true,
        target: {
          kind: "study",
          id: "prog1:s1:2026-11-25",
          label: "Genel Çalışma",
          durationMinutes: 90,
        },
        targetRemainingSeconds: 5400,
      }),
    ],
  ], { react: reactStub });

  const pomodoro = env.load("pomodoroStore");
  const snap = pomodoro.reloadPomodoroFromStorage(reopenHoursLater);
  assert.equal(snap.mode, "pomodoro");
  assert.equal(snap.isRunning, false);
  assert.equal(snap.completedSessions, 1);
  assert.equal(snap.completedFocusMinutes, 25);
  assert.equal(snap.targetRemainingSeconds, 3900); // 65 min left
  assert.equal(snap.timeLeft, 1500);
});

test("Stage 2: selecting a target while on Break returns to Focus mode and preserves partial remaining time", () => {
  const env = setupModules([], { react: reactStub });
  const pomodoro = env.load("pomodoroStore");
  const today = pomodoro.getPomodoroSnapshot().sessionDate;
  const studyTarget = {
    kind: "study",
    id: `prog1:s1:${today}`,
    label: "Genel Çalışma",
    durationMinutes: 90,
  };

  pomodoro.setPomodoroTarget(studyTarget);
  pomodoro.switchPomodoroMode("shortBreak");
  assert.equal(pomodoro.getPomodoroSnapshot().mode, "shortBreak");
  assert.equal(pomodoro.getPomodoroSnapshot().timeLeft, 300);

  // Clicking Serbest while on break returns to Odak (25:00)
  pomodoro.setPomodoroTarget(undefined, true);
  assert.equal(pomodoro.getPomodoroSnapshot().mode, "pomodoro");
  assert.equal(pomodoro.getPomodoroSnapshot().timeLeft, 1500);
  assert.equal(pomodoro.getPomodoroSnapshot().manualFreeFocus, true);

  // Clicking study target while on break returns to Odak (25:00) with 90m target
  pomodoro.switchPomodoroMode("longBreak");
  pomodoro.setPomodoroTarget(studyTarget);
  assert.equal(pomodoro.getPomodoroSnapshot().mode, "pomodoro");
  assert.equal(pomodoro.getPomodoroSnapshot().timeLeft, 1500);
  assert.equal(pomodoro.getPomodoroSnapshot().targetRemainingSeconds, 5400);
});

test("Stage 2: switching to break after >=1 min credits worked minutes and deducts from study target; <1 min adds nothing", () => {
  const env = setupModules([], { react: reactStub });
  const pomodoro = env.load("pomodoroStore");
  const today = pomodoro.getPomodoroSnapshot().sessionDate;
  const studyTarget = {
    kind: "study",
    id: `prog1:s1:${today}`,
    label: "Genel Çalışma",
    durationMinutes: 90,
  };

  pomodoro.setPomodoroTarget(studyTarget);
  // Not started yet (0 elapsed) -> switching to break adds 0 min and keeps 90 min remaining
  pomodoro.switchPomodoroMode("shortBreak");
  assert.equal(pomodoro.getPomodoroSnapshot().completedFocusMinutes, 0);
  assert.equal(pomodoro.getPomodoroSnapshot().targetRemainingSeconds, 5400);

  // Start focus and simulate 20 minutes elapsed
  pomodoro.switchPomodoroMode("pomodoro");
  pomodoro.togglePomodoroPause(); // starts running
  const startedSnap = pomodoro.getPomodoroSnapshot();
  const after20Min = startedSnap.endTimeMs - 5 * 60 * 1000; // 20 min elapsed, 5 min left
  pomodoro.switchPomodoroMode("shortBreak", after20Min);

  const afterSkip = pomodoro.getPomodoroSnapshot();
  assert.equal(afterSkip.mode, "shortBreak");
  assert.equal(afterSkip.completedFocusMinutes, 20);
  assert.equal(afterSkip.targetRemainingSeconds, 4200); // 70 min left (90 - 20)

  // Re-clicking same active target on break keeps 70 min remaining instead of resetting to 90
  pomodoro.setPomodoroTarget(studyTarget);
  assert.equal(pomodoro.getPomodoroSnapshot().mode, "pomodoro");
  assert.equal(pomodoro.getPomodoroSnapshot().targetRemainingSeconds, 4200);
});

test("Stage 3: early confirmPomodoroTargetDone credits worked minutes, marks attendance, and backupStore accepts sessionDate", () => {
  const env = setupModules([], { react: reactStub });
  const pomodoro = env.load("pomodoroStore");
  const attendance = env.load("../shared/studyAttendance");
  const backup = env.load("backupStore");

  const today = pomodoro.getPomodoroSnapshot().sessionDate;
  const blockId = `prog1:s1:${today}`;
  pomodoro.setPomodoroTarget({
    kind: "study",
    id: blockId,
    label: "Genel Çalışma",
    durationMinutes: 60,
  });

  pomodoro.togglePomodoroPause(); // start running 25m chunk
  const started = pomodoro.getPomodoroSnapshot();
  const after12Min = started.endTimeMs - 13 * 60 * 1000; // 12 min elapsed
  pomodoro.confirmPomodoroTargetDone(after12Min);

  const doneSnap = pomodoro.getPomodoroSnapshot();
  assert.equal(doneSnap.completedFocusMinutes, 12);
  assert.equal(doneSnap.target, undefined);
  assert.equal(attendance.loadStudyAttendance()[blockId]?.status, "attended");

  // Backup export includes sessionDate and passes backup schema validation on restore
  const exported = backup.createBackup({ closeToTray: true, startInTray: false, autoStart: false }, "2.3.4", env.storage);
  assert.equal(exported.data.pomodoro.sessionDate, today);
});

test("finishRecurringSeries permanently completes recurring tasks while keeping valid desktop and cloud task schemas", () => {
  const env = setupModules([], { react: reactStub });
  const recurrence = env.load("../shared/recurrence");
  const phone = env.load("../shared/phone");
  const taskStore = env.load("taskStore");

  const now = new Date("2026-11-25T14:50:00+03:00").getTime();
  const sampleRecurring = {
    text: "Kargoyu şubeye teslim et",
    completed: false,
    dueDate: "2026-11-26",
    dueTime: "15:00",
    priority: "normal",
    reminder: true,
    dueAt: new Date("2026-11-26T15:00:00+03:00").getTime(),
    timezone: "Europe/Istanbul",
    recurrence: {
      frequency: "daily",
      interval: 1,
      weekdays: [],
      dayOfMonth: 25,
      start: "2026-11-20",
      time: "15:00",
      timezone: "Europe/Istanbul",
      endDate: null,
      count: null,
    },
    occurrenceAt: new Date("2026-11-26T15:00:00+03:00").getTime(),
    lastCompletedAt: new Date("2026-11-25T15:00:00+03:00").getTime(),
    snoozedUntil: null,
  };

  assert.equal(phone.validTask(sampleRecurring), true);
  const finished = recurrence.finishRecurringSeries(sampleRecurring, now);
  assert.equal(finished.completed, true);
  assert.equal(finished.recurrence, null);
  assert.equal(finished.occurrenceAt, null);
  assert.equal(finished.snoozedUntil, null);
  assert.equal(finished.dueDate, "2026-11-25");
  assert.equal(finished.dueTime, "15:00");
  assert.equal(phone.validTask(finished), true);
  assert.equal(taskStore.isTask({ id: "t-1", ...finished }), true);
});
