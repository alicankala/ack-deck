import { nextOccurrence, type Recurrence } from "../shared/recurrence";
import type { StudyProgram } from "../shared/studyPrograms";
export const STUDY_REMINDER_KEY = "ack-deck.study-reminders.v1";
export type StudyReminderPreference = { id: string; leadMinutes: number | null };
export function validStudyReminder(v: unknown): v is StudyReminderPreference { if (!v || typeof v !== "object") return false; const p = v as StudyReminderPreference; return Object.keys(p).sort().join() === ["id", "leadMinutes"].sort().join() && typeof p.id === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(p.id) && (p.leadMinutes === null || [0, 15, 30, 60].includes(p.leadMinutes)); }
export function loadStudyReminders(): { entries: StudyReminderPreference[]; locked: boolean } { try { const raw = window.localStorage.getItem(STUDY_REMINDER_KEY), v: unknown = raw === null ? [] : JSON.parse(raw); if (!Array.isArray(v) || !v.every(validStudyReminder) || new Set(v.map(p => p.id)).size !== v.length) throw Error(); return { entries: v, locked: false }; } catch { return { entries: [], locked: true }; } }
export function saveStudyReminder(id: string, leadMinutes: number | null): boolean { const loaded = loadStudyReminders(), p = { id, leadMinutes }; if (loaded.locked || !validStudyReminder(p) || window.localStorage.getItem("ack-deck.restore-journal.v1") !== null) return false; try { window.localStorage.setItem(STUDY_REMINDER_KEY, JSON.stringify([...loaded.entries.filter(p => p.id !== id), p])); window.dispatchEvent(new Event("ack-data-changed")); return true; } catch { return false; } }
export function pendingStudyReminders(programs: StudyProgram[], preferences: StudyReminderPreference[], delivered: string[] = [], now = Date.now()) {
  return programs.filter(p => p.active).flatMap(p => {
    const preference = preferences.find(v => v.id === p.id); if (!preference || preference.leadMinutes === null) return [];
    const lead = preference.leadMinutes * 60000;
    return p.sessions.flatMap(s => {
      const id = "study:" + p.id + ":" + s.id;
      const cursor = Math.max(0, ...delivered.filter(k => k.startsWith(id + "|")).map(k => Number(k.split("|")[1]) || 0));
      const rule: Recurrence = { frequency: "weekly", interval: 1, weekdays: s.weekdays.map(d => d % 7), dayOfMonth: 1, start: p.startDate, time: s.time, timezone: p.timezone, endDate: p.endDate, count: null };
      const next = nextOccurrence(rule, Math.max(now - 1 + lead, cursor + lead));
      return next ? [{ id, text: (s.subject + " · " + p.name).slice(0, 160), dueAt: next.at - lead }] : [];
    });
  });
}
