import test from "node:test";
import assert from "node:assert/strict";
import { setupModules } from "./helpers.mjs";

test("calculateDaySummary calculates rings, progress and overallScore accurately", () => {
  const env = setupModules();
  const overview = env.load("../shared/activityOverview");

  const dateStr = "2026-11-04";
  const prayerLogs = [
    {
      id: "2026-11-04",
      date: "2026-11-04",
      prayers: {
        fajr: "prayed",
        dhuhr: "prayed",
        asr: "prayed",
        maghrib: "prayed",
        isha: "prayed",
      },
      notes: [],
      updatedAt: Date.now(),
    },
  ];

  const pomodoroHistory = {
    "2026-11-04": { sessions: 4, minutes: 100 },
  };

  const tasks = [
    { id: "1", text: "Task 1", completed: true, lastCompletedAt: new Date("2026-11-04T10:00:00").getTime() },
    { id: "2", text: "Task 2", completed: true, lastCompletedAt: new Date("2026-11-04T14:00:00").getTime() },
    { id: "3", text: "Task 3", completed: true, lastCompletedAt: new Date("2026-11-04T17:00:00").getTime() },
    { id: "4", text: "Task 4", completed: false },
  ];

  const summary = overview.calculateDaySummary(dateStr, prayerLogs, pomodoroHistory, tasks, overview.DEFAULT_ACTIVITY_GOALS);

  assert.equal(summary.date, "2026-11-04");
  assert.equal(summary.rings.prayer.current, 5);
  assert.equal(summary.rings.prayer.target, 5);
  assert.equal(summary.rings.prayer.progress, 1);

  assert.equal(summary.rings.pomodoro.current, 4);
  assert.equal(summary.rings.pomodoro.target, 4);
  assert.equal(summary.rings.pomodoro.progress, 1);

  assert.equal(summary.rings.tasks.current, 3);
  assert.equal(summary.rings.tasks.target, 3);
  assert.equal(summary.rings.tasks.progress, 1);

  assert.equal(summary.allGoalsMet, true);
  assert.equal(summary.overallScore, 100);
});

test("calculateDaySummary handles partial completion and custom goals", () => {
  const env = setupModules();
  const overview = env.load("../shared/activityOverview");

  const dateStr = "2026-11-03";
  const prayerLogs = [
    {
      id: "2026-11-03",
      date: "2026-11-03",
      prayers: {
        fajr: "prayed",
        dhuhr: "prayed",
        asr: "missed",
        maghrib: "missed",
        isha: "missed",
      },
      notes: [],
      updatedAt: Date.now(),
    },
  ];

  const pomodoroHistory = {
    "2026-11-03": { sessions: 2, minutes: 50 },
  };

  const tasks = [
    { id: "1", text: "Task 1", completed: true, lastCompletedAt: new Date("2026-11-03T09:00:00").getTime() },
  ];

  const customGoals = {
    prayerTarget: 5,
    pomodoroTarget: 4,
    tasksTarget: 2,
  };

  const summary = overview.calculateDaySummary(dateStr, prayerLogs, pomodoroHistory, tasks, customGoals);

  assert.equal(summary.rings.prayer.current, 2);
  assert.equal(summary.rings.prayer.progress, 0.4);

  assert.equal(summary.rings.pomodoro.current, 2);
  assert.equal(summary.rings.pomodoro.progress, 0.5);

  assert.equal(summary.rings.tasks.current, 1);
  assert.equal(summary.rings.tasks.progress, 0.5);

  assert.equal(summary.allGoalsMet, false);
  assert.equal(summary.overallScore, 47);
});

test("getWeeklySummaries generates exactly 7 days starting from Monday", () => {
  const env = setupModules();
  const overview = env.load("../shared/activityOverview");

  const week = overview.getWeeklySummaries("2026-11-04", [], {}, [], overview.DEFAULT_ACTIVITY_GOALS);
  assert.equal(week.length, 7);
  assert.equal(week[0].date, "2026-11-02");
  assert.equal(week[6].date, "2026-11-08");
});

test("getMonthlySummaries generates correct number of days for the month", () => {
  const env = setupModules();
  const overview = env.load("../shared/activityOverview");

  const monthNov = overview.getMonthlySummaries(2026, 11, [], {}, [], overview.DEFAULT_ACTIVITY_GOALS);
  assert.equal(monthNov.length, 30);
  assert.equal(monthNov[0].date, "2026-11-01");
  assert.equal(monthNov[29].date, "2026-11-30");

  const monthOct = overview.getMonthlySummaries(2026, 10, [], {}, [], overview.DEFAULT_ACTIVITY_GOALS);
  assert.equal(monthOct.length, 31);
});

test("calculateStreaks accurately calculates consecutive day streaks", () => {
  const env = setupModules();
  const overview = env.load("../shared/activityOverview");

  const days = [
    { date: "2026-11-01", allGoalsMet: true },
    { date: "2026-11-02", allGoalsMet: true },
    { date: "2026-11-03", allGoalsMet: true },
    { date: "2026-11-04", allGoalsMet: false },
  ];

  const streaks = overview.calculateStreaks(days);
  assert.equal(streaks.bestStreak, 3);
  assert.equal(streaks.totalGoalsMetDays, 3);
});

const plain = v => JSON.parse(JSON.stringify(v));

test("goals saving and loading respects bounds", () => {
  const env = setupModules();
  const overview = env.load("../shared/activityOverview");

  assert.deepEqual(plain(overview.loadActivityGoals()), plain(overview.DEFAULT_ACTIVITY_GOALS));

  overview.saveActivityGoals({ prayerTarget: 4, pomodoroTarget: 6, tasksTarget: 5 });
  assert.deepEqual(plain(overview.loadActivityGoals()), { prayerTarget: 4, pomodoroTarget: 6, tasksTarget: 5 });

  // Out of bounds clamped
  overview.saveActivityGoals({ prayerTarget: 10, pomodoroTarget: 99, tasksTarget: 100 });
  assert.deepEqual(plain(overview.loadActivityGoals()), { prayerTarget: 5, pomodoroTarget: 30, tasksTarget: 50 });
});
