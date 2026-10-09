import { useState } from "react";
import { dateKey, weekDates } from "./weeklyPlan";
import { planAgenda, reminderText, type AgendaEvent } from "./planAgenda";
import type { PlanEvent } from "./weeklyPlan";
import { studyBlocks, studyConflicts, type StudyProgram } from "./studyPrograms";
import "./planner.css";

export function PlanCalendar({ anchor, onAnchor, events, programs, onEvent, onProgram, onNew, mobile = false }: {
  anchor: Date; onAnchor: (date: Date) => void; events: PlanEvent[]; programs: StudyProgram[]; onEvent: (event: AgendaEvent) => void; onProgram: (id: string) => void; onNew: (day: string) => void; mobile?: boolean;
}) {
  const days = weekDates(anchor), [selected, setSelected] = useState(dateKey(new Date())), today = dateKey(new Date());
  const agenda = planAgenda(events), blocks = studyBlocks(programs, anchor), conflicts = new Set(studyConflicts(programs, anchor));
  const activeDay = days.includes(selected) ? selected : days[0];
  const dateLabel = (day: string) => new Date(day + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  const shift = (n: number) => onAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + n));
  return <section className={`plan-calendar ${mobile ? "mobile-calendar" : "desktop-calendar"}`} aria-label="Haftalık takvim">
    <div className="calendar-toolbar"><div className="calendar-range"><strong>{dateLabel(days[0])} – {dateLabel(days[6])}</strong><span>{blocks.length} çalışma bloğu · {agenda.filter(e => !e.reminder).length} kayıt</span></div><div className="calendar-navigation"><button type="button" aria-label="Önceki hafta" onClick={() => shift(-7)}>‹</button><button type="button" onClick={() => { const now = new Date(); onAnchor(now); setSelected(dateKey(now)); }}>Bu hafta</button><button type="button" aria-label="Sonraki hafta" onClick={() => shift(7)}>›</button></div></div>
    <div className="calendar-legend" aria-label="Takvim renkleri"><span className="study">Çalışma</span><span className="tasks">Görev</span><span className="subscriptions">Ödeme</span></div>
    {mobile && <div className="calendar-days" aria-label="Gün seçimi">{days.map(day => <button type="button" key={day} aria-pressed={day === activeDay} className={day === today ? "is-today" : ""} onClick={() => setSelected(day)}><small>{new Date(day + "T12:00:00").toLocaleDateString("tr-TR", { weekday: "short" })}</small><strong>{Number(day.slice(-2))}</strong><span aria-label={`${agenda.filter(e => e.date === day).length + blocks.filter(b => b.date === day).length} kayıt`}>{agenda.some(e => e.date === day) || blocks.some(b => b.date === day) ? "•" : "·"}</span></button>)}</div>}
    <div className="calendar-grid">{(mobile ? [activeDay] : days).map(day => {
      const rows = [...agenda.filter(e => e.date === day).map(e => ({ time: e.time ?? "", event: e, block: null })), ...blocks.filter(b => b.date === day).map(b => ({ time: b.time, event: null, block: b }))].sort((a, b) => a.time.localeCompare(b.time));
      return <section className={`calendar-day ${day === today ? "is-today" : ""}`} key={day}><header><div><strong>{new Date(day + "T12:00:00").toLocaleDateString("tr-TR", { weekday: "long" })}</strong><small>{dateLabel(day)}{day === today ? " · Bugün" : ""}</small></div><button type="button" className="calendar-add" aria-label={`${dateLabel(day)} için görev ekle`} onClick={() => onNew(day)}>+</button></header>
        {!rows.length && <p className="calendar-empty">Planın açık.</p>}
        {rows.map(({ event: e, block: b }) => b ? <button type="button" className={`calendar-event study ${conflicts.has(b.id) ? "overlap" : ""}`} key={b.id} onClick={() => onProgram(b.programId)}><small className="calendar-event-time">{b.time}–{b.endTime}</small><strong>{b.label}</strong>{b.topic && <span>{b.topic}</span>}<small>{b.minutes} dk · {b.programName}</small>{conflicts.has(b.id) && <small className="calendar-conflict">Saatler çakışıyor</small>}</button> : e && <button type="button" className={`calendar-event ${e.source} ${e.reminder ? "reminder" : ""}`} key={`${e.source}:${e.id}:${e.occurrenceKey ?? day}:${e.reminder ? "reminder" : "event"}`} onClick={() => onEvent(e)}><small className="calendar-event-time">{e.time ?? "Gün içinde"} · {e.reminder ? "Hatırlatma" : e.source === "tasks" ? "Görev" : "Ödeme"}</small><strong>{e.label.replace(/ · Hatırlatma$/, "")}</strong>{reminderText(e) && <small className="calendar-reminder">◷ {reminderText(e)}</small>}</button>)}
      </section>;
    })}</div>
  </section>;
}
