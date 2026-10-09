import { nextOccurrence, scheduleDate, zonedAt, zonedParts, type Recurrence } from "./recurrence";
import { paymentOccurrence, subscriptionReminder, type Subscription } from "./subscriptions";
export type PlanTask = {
    id: string;
    text: string;
    completed: boolean;
    dueDate?: string | null;
    dueTime?: string | null;
    recurrence?: Recurrence | null;
    occurrenceAt?: number | null;
    lastCompletedAt?: number | null;
    snoozedUntil?: number | null;
    reminder?: boolean;
    reminderLeadMinutes?: number;
    dueAt?: number | null;
    timezone?: string;
};
export type PlanEvent = {
    occurrenceKey?: string;
    id: string;
    source: "tasks" | "subscriptions";
    label: string;
    date: string;
    time: string | null;
    reminder?: boolean;
};
export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function weekDates(anchor = new Date()) { const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return dateKey(d); }); }
export function weeklyPlan(tasks: PlanTask[], subscriptions: Subscription[], anchor = new Date()): PlanEvent[] {
    const days = weekDates(anchor), start = new Date(days[0] + "T00:00:00").getTime(), end = new Date(days[6] + "T23:59:59.999").getTime(), events: PlanEvent[] = [];
    for (const t of tasks.filter(t => !t.completed)) {
        const timezone = t.recurrence?.timezone ?? t.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, lead = (t.reminderLeadMinutes ?? 0) * 60000;
        const add = (at: number, reminder = false, occurrence = at) => { const p = zonedParts(at, timezone); if (days.includes(p.date))
            events.push({ occurrenceKey: `tasks:${t.id}:${occurrence}`, id: t.id, source: "tasks", label: t.text + (reminder ? " · Hatırlatma" : ""), date: p.date, time: p.time, ...(reminder ? { reminder: true } : {}) }); };
        if (t.recurrence) {
            const lastDay = new Date(days[6] + "T12:00:00");
            lastDay.setDate(lastDay.getDate() + 1);
            const zoneStart = zonedAt(days[0], "00:00", timezone) ?? start, zoneEnd = (zonedAt(dateKey(lastDay), "00:00", timezone) ?? end + 1) - 1;
            let occurrence = nextOccurrence(t.recurrence, Math.max(zoneStart - 1, t.lastCompletedAt ?? 0));
            for (let n = 0; occurrence && occurrence.at <= zoneEnd + (t.reminder ? lead : 0) && n < 15; n++) {
                const snoozed = t.snoozedUntil && occurrence.at === t.occurrenceAt ? t.snoozedUntil : null, at = snoozed ?? occurrence.at;
                add(at);
                if (t.reminder)
                    add(at - (snoozed ? 0 : lead), true, at);
                occurrence = nextOccurrence(t.recurrence, occurrence.at);
            }
            if (t.snoozedUntil && t.occurrenceAt && t.occurrenceAt < zoneStart) {
                add(t.snoozedUntil);
                if (t.reminder)
                    add(t.snoozedUntil, true);
            }
        }
        else {
            if (t.snoozedUntil)
                add(t.snoozedUntil);
            else if (t.dueDate && days.includes(t.dueDate))
                events.push({ occurrenceKey: `tasks:${t.id}:${t.dueAt ?? `${t.dueDate}:${t.dueTime ?? ""}`}`, id: t.id, source: "tasks", label: t.text, date: t.dueDate, time: t.dueTime ?? null });
            if (t.reminder && t.dueAt)
                add((t.snoozedUntil ?? t.dueAt) - (t.snoozedUntil ? 0 : lead), true, t.snoozedUntil ?? t.dueAt);
        }
    }
    for (const s of subscriptions.filter(s => s.status === "active")) {
        let occurrence = paymentOccurrence(s, start - 1);
        for (let n = 0; occurrence && occurrence.at <= end && n < 7; n++) {
            if (days.includes(occurrence.date))
                events.push({ occurrenceKey: `subscriptions:${s.id}:${occurrence.at}`, id: s.id, source: "subscriptions", label: s.name, date: occurrence.date, time: "09:00" });
            occurrence = paymentOccurrence(s, occurrence.at);
        }
        const reminder = subscriptionReminder(s, start - 1);
        if (reminder && reminder.at <= end) {
            const p = zonedParts(reminder.at, s.timezone);
            events.push({ occurrenceKey: `subscriptions:${s.id}:${reminder.paymentAt}`, id: s.id, source: "subscriptions", label: s.name + " · Hatırlatma", date: p.date, time: p.time, reminder: true });
        }
    }
    return events.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
}
export function todaySummary(tasks: PlanTask[], subscriptions: Subscription[], unhandledInbox: number | null, now = new Date()) {
    const today = dateKey(now), active = tasks.filter(t => !t.completed), dated = active.map(t => ({ t, date: scheduleDate(t, now.getTime()) }));
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 7);
    return { today: dated.filter(v => v.date === today).length, overdue: dated.filter(v => !!v.date && v.date < today).length, unhandledInbox, subscriptions: subscriptions.filter(s => s.status === "active").map(s => ({ id: s.id, name: s.name, date: paymentOccurrence(s, now.getTime() - 1)?.date ?? null })).filter(s => s.date && s.date <= dateKey(horizon)) };
}
