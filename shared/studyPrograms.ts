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
export const WEEKDAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;
export const WEEKDAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
const DAY_TOKENS: [RegExp, number[]][] = [
  [/(?:^|[^\p{L}])(?:pazartesi|pzt)(?=$|[^\p{L}])/iu, [1]], [/(?:^|[^\p{L}])(?:sal[ıi]|sal)(?=$|[^\p{L}])/iu, [2]], [/(?:^|[^\p{L}])(?:[cç]ar[sş]amba|[cç]ar)(?=$|[^\p{L}])/iu, [3]],
  [/(?:^|[^\p{L}])(?:per[sş]embe|per)(?=$|[^\p{L}])/iu, [4]], [/(?:^|[^\p{L}])(?:cuma|cum)(?=$|[^\p{L}])/iu, [5]], [/(?:^|[^\p{L}])(?:cumartesi|cmt)(?=$|[^\p{L}])/iu, [6]], [/(?:^|[^\p{L}])(?:pazar|paz)(?=$|[^\p{L}])/iu, [7]],
  [/hafta\s*i[cç]i/iu, [1, 2, 3, 4, 5]], [/hafta\s*sonu/iu, [6, 7]], [/her\s*g[uü]n/iu, [1, 2, 3, 4, 5, 6, 7]],
];
export function parseWeekdays(input: string): number[] {
  const days = new Set<number>();
  for (const [pattern, nums] of DAY_TOKENS) if (pattern.test(input)) nums.forEach(n => days.add(n));
  return [...days].sort((a, b) => a - b);
}
export function normalizeStudySessions(raw: unknown): StudySession[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).flatMap((item, idx) => {
    if (!object(item)) return [];
    const subject = typeof item.subject === "string" ? item.subject.trim().slice(0, 160) : "";
    if (!subject) return [];
    const topic = typeof item.topic === "string" ? item.topic.trim().slice(0, 500) : "";
    const rawDays = Array.isArray(item.weekdays) ? item.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7) : typeof item.weekdays === "string" ? parseWeekdays(item.weekdays) : [1];
    const weekdays = [...new Set(rawDays.length ? rawDays : [1])].sort((a, b) => a - b);
    const timeMatch = typeof item.time === "string" ? item.time.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
    const rawTime = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "19:00";
    const safeTime = time(rawTime) ? rawTime : "19:00";
    const startMins = Number(safeTime.slice(0, 2)) * 60 + Number(safeTime.slice(3));
    const maxMins = Math.min(240, 1440 - startMins);
    const minutes = Math.max(10, Math.min(maxMins >= 10 ? maxMins : 50, Math.round(Number(item.minutes) || 50)));
    const sessionId = id(item.id) ? String(item.id) : typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${idx + 1}`;
    return [{ id: sessionId, subject, topic, weekdays, time: safeTime, minutes }];
  });
}
export function formatStudySchedule(program: Pick<StudyProgram, "name" | "startDate" | "endDate" | "sessions">): string {
  const range = program.endDate ? `${program.startDate} – ${program.endDate}` : `${program.startDate} itibarıyla her hafta`;
  const byDay = WEEKDAY_SHORT.map((dayName, idx) => {
    const dayNum = idx + 1;
    const items = program.sessions.filter(s => s.weekdays.includes(dayNum)).sort((a, b) => a.time.localeCompare(b.time));
    if (!items.length) return null;
    return `${dayName}: ` + items.map(s => {
      const end = Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)) + s.minutes;
      const endStr = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
      return `${s.time}–${endStr} ${s.subject} (${s.minutes} dk${s.topic ? " · " + s.topic : ""})`;
    }).join(" | ");
  }).filter(Boolean);
  return `${program.name} (${range})\n` + byDay.join("\n");
}
const MONTHS: Record<string, string> = { ocak: "01", subat: "02", şubat: "02", mart: "03", nisan: "04", mayis: "05", mayıs: "05", haziran: "06", temmuz: "07", agustos: "08", ağustos: "08", eylul: "09", eylül: "09", ekim: "10", kasim: "11", kasım: "11", aralik: "12", aralık: "12" };
export function parseEndDateHint(input: string, now = new Date()): string | null {
  const iso = input.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && date(iso[1])) return iso[1];
  const trDate = input.toLocaleLowerCase("tr-TR").match(/(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(\d{4}))?/iu);
  if (trDate) {
    const month = MONTHS[trDate[2].toLocaleLowerCase("tr-TR")];
    const dayStr = trDate[1].padStart(2, "0");
    let year = trDate[3] ? Number(trDate[3]) : now.getFullYear();
    let candidate = `${year}-${month}-${dayStr}`;
    if (!trDate[3] && candidate < dateKey(now)) candidate = `${year + 1}-${month}-${dayStr}`;
    if (date(candidate)) return candidate;
  }
  return null;
}
export function extractStudyProgramDraft(markdown: string, now = new Date()): StudyProgram {
  const startDate = dateKey(now), endDate = parseEndDateHint(markdown, now);
  const lines = markdown.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const heading = lines.find(l => /^#{1,3}\s+/.test(l))?.replace(/^#{1,3}\s+/, "").replace(/[*_`]/g, "").trim();
  const name = (heading && heading.length <= 80 ? heading : "AI Ders Programı").slice(0, 160);
  const sessions: StudySession[] = [];
  let currentDays: number[] = [];
  for (const rawLine of lines) {
    if (/^\|[\s:-]+\|$/.test(rawLine)) continue;
    const clean = rawLine.replace(/[*_`]/g, "").trim();
    const rowDays = parseWeekdays(clean);
    const isDayHeading = rowDays.length > 0 && clean.length < 40 && !/\d{1,2}:\d{2}/.test(clean) && !clean.includes("|");
    if (isDayHeading) { currentDays = rowDays; continue; }
    const days = rowDays.length ? rowDays : currentDays;
    if (!days.length) continue;
    const timeMatch = clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d))?/);
    const durMatch = clean.match(/\b(\d{2,3})\s*(?:dk|dakika)\b/iu);
    if (!timeMatch && !durMatch && !rawLine.startsWith("|") && !/^[-*+•]|\d+[.)]/.test(rawLine)) continue;
    const startTime = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "19:00";
    let minutes = durMatch ? Number(durMatch[1]) : 50;
    if (timeMatch && timeMatch[3] && timeMatch[4]) {
      const diff = (Number(timeMatch[3]) * 60 + Number(timeMatch[4])) - (Number(timeMatch[1]) * 60 + Number(timeMatch[2]));
      if (diff >= 10 && diff <= 240) minutes = diff;
    }
    minutes = Math.max(10, Math.min(240, minutes));
    let rest = clean
      .replace(/^\|+|\|+$/g, "")
      .replace(/^[-*+•]\s*|\d+[.)]\s*/, "")
      .replace(/(?<=^|[^\p{L}])(?:pazartesi|pzt|sal[ıi]|sal|[cç]ar[sş]amba|[cç]ar|per[sş]embe|per|cuma|cum|cumartesi|cmt|pazar|paz|hafta\s*i[cç]i|hafta\s*sonu|her\s*g[uü]n)(?=$|[^\p{L}])[,:\s|-]*/giu, " ")
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d))?/g, " ")
      .replace(/\(?\b\d{2,3}\s*(?:dk|dakika)\b\)?/giu, " ");
    const parts = rest.split(/\s*(?:\||—|–| - | : )\s*/).map(p => p.replace(/^[,:\-–—|\s]+|[,:\-–—|\s]+$/g, "").trim()).filter(p => p && !/^(?:gün|saat|ders|konu|süre|hedef|açıklama)$/iu.test(p));
    const subject = (parts[0] || "").slice(0, 160);
    if (!subject || subject.length < 2) continue;
    const topic = parts.slice(1).join(" · ").slice(0, 500);
    const existing = sessions.find(s => s.subject.toLocaleLowerCase("tr-TR") === subject.toLocaleLowerCase("tr-TR") && s.time === startTime && s.minutes === minutes && s.topic === topic);
    if (existing) existing.weekdays = [...new Set([...existing.weekdays, ...days])].sort((a, b) => a - b);
    else if (sessions.length < 60) sessions.push({ id: crypto.randomUUID(), subject, topic, weekdays: days, time: startTime, minutes });
  }
  return {
    id: crypto.randomUUID(),
    name,
    startDate,
    endDate: endDate && endDate >= startDate ? endDate : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    active: true,
    sessions: sessions.length ? sessions : [newStudySession()],
    updatedAt: Date.now(),
  };
}
