import type { PlanEvent } from "./weeklyPlan";
export type AgendaEvent = PlanEvent & { reminderDate?: string; reminderTime?: string | null };
// Presentation only: notification scheduling and recurrence remain unchanged.
export function planAgenda(events: PlanEvent[]): AgendaEvent[] {
  const result: AgendaEvent[] = [];
  const main = new Map(events.filter(e => !e.reminder).map(e => [e.occurrenceKey, e]));
  const alerts = new Map(events.filter(e => e.reminder).map(e => [e.occurrenceKey, e]));
  for (const event of events) {
    if (event.reminder && event.occurrenceKey && main.has(event.occurrenceKey)) continue;
    const alert = event.occurrenceKey ? alerts.get(event.occurrenceKey) : undefined;
    result.push({ ...event, ...(alert && !event.reminder ? { reminderDate: alert.date, reminderTime: alert.time } : {}) });
  }
  return result;
}
export function reminderText(event: AgendaEvent) {
  if (!event.reminderDate) return null;
  return event.reminderDate === event.date ? `Hatırlatma ${event.reminderTime ?? ""}` : `Hatırlatma ${new Date(event.reminderDate + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${event.reminderTime ?? ""}`;
}
