import { dateKey, weekDates } from "./weeklyPlan";
import { zonedParts } from "./recurrence";
import { hasCredentials } from "./privacy";

export type StudySession = { id: string; subject: string; topic: string; weekdays: number[]; time: string; minutes: number };
export type StudyProgram = { id: string; name: string; startDate: string; endDate: string | null; timezone: string; active: boolean; sessions: StudySession[]; updatedAt: number };
export type StudyBlock = { id: string; programId: string; programName: string; label: string; topic: string; date: string; time: string; endTime: string; minutes: number };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(v);
const text = (v: unknown, limit: number, required = false) => typeof v === "string" && v.length <= limit && (!required || !!v.trim()) && !hasCredentials(v) && !/[A-Za-z]:[\\/]|\\\\/.test(v);
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + "T12:00:00Z")) && new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
const time = (v: unknown) => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const fields = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => k in v);
export function validStudyProgram(v: unknown): v is StudyProgram {
  if (!object(v) || !fields(v, ["id", "name", "startDate", "endDate", "timezone", "active", "sessions", "updatedAt"]) || !id(v.id) || !text(v.name, 160, true) || !date(v.startDate) || (v.endDate !== null && (!date(v.endDate) || String(v.endDate) < String(v.startDate))) || typeof v.active !== "boolean" || !Number.isSafeInteger(v.updatedAt) || Number(v.updatedAt) < 0 || !text(v.timezone, 100, true)) return false;
  try { new Intl.DateTimeFormat("tr", { timeZone: String(v.timezone) }); } catch { return false; }
  if (!Array.isArray(v.sessions) || v.sessions.length < 1 || v.sessions.length > 60 || new Set(v.sessions.map(s => s?.id)).size !== v.sessions.length) return false;
  return v.sessions.every(s => object(s) && fields(s, ["id", "subject", "topic", "weekdays", "time", "minutes"]) && id(s.id) && text(s.subject, 160, true) && text(s.topic, 500) && time(s.time) && Number.isInteger(s.minutes) && Number(s.minutes) >= 10 && Number(s.minutes) <= 240 && Number(String(s.time).slice(0, 2)) * 60 + Number(String(s.time).slice(3)) + Number(s.minutes) <= 1440 && Array.isArray(s.weekdays) && s.weekdays.length > 0 && s.weekdays.length <= 7 && s.weekdays.every(d => Number.isInteger(d) && Number(d) >= 1 && Number(d) <= 7) && new Set(s.weekdays).size === s.weekdays.length);
}
export const newStudySession = (): StudySession => ({ id: crypto.randomUUID(), subject: "", topic: "", weekdays: [1], time: "19:00", minutes: 50 });
export const newStudyProgram = (): StudyProgram => ({ id: crypto.randomUUID(), name: "", startDate: dateKey(new Date()), endDate: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, active: true, sessions: [newStudySession()], updatedAt: Date.now() });
export function studyBlocks(programs: StudyProgram[], anchor = new Date()): StudyBlock[] {
  const result: StudyBlock[] = [];
  for (const p of programs.filter(p => p.active)) for (const day of weekDates(anchor)) {
    if (day < p.startDate || (p.endDate && day > p.endDate)) continue;
    const weekday = (new Date(day + "T12:00:00").getDay() + 6) % 7 + 1;
    for (const s of p.sessions.filter(s => s.weekdays.includes(weekday))) {
      const finish = Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)) + s.minutes;
      result.push({ id: `${p.id}:${s.id}:${day}`, programId: p.id, programName: p.name, label: s.subject, topic: s.topic, date: day, time: s.time, endTime: `${String(Math.floor(finish / 60)).padStart(2, "0")}:${String(finish % 60).padStart(2, "0")}`, minutes: s.minutes });
    }
  }
  return result.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
export function studyConflicts(programs: StudyProgram[], anchor = new Date()): string[] {
  const blocks = studyBlocks(programs, anchor), conflicts = new Set<string>();
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    if (a.date === b.date && a.time < b.endTime && b.time < a.endTime) { conflicts.add(a.id); conflicts.add(b.id); }
  }
  return [...conflicts];
}
export function programToday(program: StudyProgram, at = Date.now()) { return zonedParts(at, program.timezone).date; }
