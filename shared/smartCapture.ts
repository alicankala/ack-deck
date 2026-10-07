import { nextOccurrence, type Recurrence } from "./recurrence";
export type CaptureDraft = {
    kind: "task";
    text: string;
    dueDate: string | null;
    dueTime: string | null;
    reminder: boolean;
    reminderLeadMinutes?: number;
    recurrence?: Recurrence;
    occurrenceAt?: number;
    projectId?: string;
} | {
    kind: "note";
    title: string;
    content: string;
    projectId?: string;
};
const normalize = (s: string) => s.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i");
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Conservative exact commands. Ambiguous dates/IDs remain ordinary input, never silently created. */
export function parseSmartCapture(input: string, projects: {
    id: string;
    name: string;
}[] = [], now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): CaptureDraft | null {
    let value = input.trim();
    if (!value || value.length > 2000)
        return null;
    const note = value.match(/^(?:şunu not al|not al|not)\s*:\s*([\s\S]+)$/iu);
    if (note)
        return { kind: "note", title: note[1].trim().split("\n")[0].slice(0, 160), content: note[1].trim() };
    let projectId: string | undefined;
    const project = value.match(/^(.+?)\s+projesine\s+(.+?)\s+görevi?\s+ekle[.!]?$/iu);
    if (project) {
        const matches = projects.filter(p => normalize(p.name) === normalize(project[1].trim()));
        if (matches.length !== 1)
            return null;
        projectId = matches[0].id;
        value = project[2];
    }
    if (!project && /\s+(?:görevlerime|görev listeme|görevlere|görev olarak|görevi|görevini)\s+ekle[.!]?$/iu.test(value))
        return null;
    if (/görev(?:i|ini)\s+(?:tamamla|sil|düzenle|değiştir)/iu.test(value))
        return null;
    const temporal = /^(?:bugün|yarın|her\s+(?:gün|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar))\s+/iu.test(value);
    if (!temporal && !project && !/^(?:yeni\s+)?görev\s*:/iu.test(value))
        return null;
    let date: string | null = null, time: string | null = null, recurrence: Recurrence | undefined;
    const tomorrow = /^yarın\s+/iu.test(value);
    if (/^(?:bugün|yarın)\s+/iu.test(value)) {
        const d = new Date(now);
        if (tomorrow)
            d.setDate(d.getDate() + 1);
        date = dateKey(d);
        value = value.replace(/^(?:bugün|yarın)\s+/iu, "");
    }
    const repeat = value.match(/^her\s+(gün|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar)\s+/iu);
    if (repeat) {
        date = dateKey(now);
        value = value.slice(repeat[0].length);
    }
    const clock = value.match(/^(?:saat\s+)?((?:[01]?\d|2[0-3]):[0-5]\d)\s+/u);
    if (clock) {
        time = clock[1].padStart(5, "0");
        value = value.slice(clock[0].length);
    }
    let lead: number | undefined;
    const reminder = value.match(/\s+(\d{1,3})\s+(saat|dakika)\s+önce\s+hatırlat[.!]?$/iu);
    if (reminder) {
        lead = Number(reminder[1]) * (normalize(reminder[2]) === "saat" ? 60 : 1);
        if (!date || !time || lead > 10080)
            return null;
        value = value.slice(0, -reminder[0].length);
    }
    else if (/\s+hatırlat[.!]?$/iu.test(value)) {
        if (!date || !time)
            return null;
        lead = 0;
        value = value.replace(/\s+hatırlat[.!]?$/iu, "");
    }
    value = value.replace(/^(?:yeni\s+)?görev\s*:\s*/iu, "").trim();
    if (!value || value.length > 160 || /\b\d{1,2}:\d{2}\b/.test(value))
        return null;
    let occurrenceAt: number | undefined;
    if (repeat) {
        if (!time)
            return null;
        const weekdays = ["pazar", "pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi"];
        const day = normalize(repeat[1]);
        recurrence = { frequency: day === "gun" ? "daily" : "weekly", interval: 1, weekdays: day === "gun" ? [] : [weekdays.indexOf(day)], dayOfMonth: now.getDate(), start: date!, time, timezone, endDate: null, count: null };
        const occurrence = nextOccurrence(recurrence, now.getTime() - 1);
        if (!occurrence)
            return null;
        date = occurrence.date;
        occurrenceAt = occurrence.at;
    }
    return { kind: "task", text: value, dueDate: date, dueTime: time, reminder: lead !== undefined, ...(lead !== undefined ? { reminderLeadMinutes: lead } : {}), ...(recurrence ? { recurrence, occurrenceAt } : {}), ...(projectId ? { projectId } : {}) };
}
