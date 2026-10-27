import { PlanCalendar } from "../../shared/PlanCalendar";
import { StudyPrograms } from "../../shared/StudyProgramPanel";
import { loadStudyPrograms, saveStudyPrograms } from "../studyProgramStore";
import { loadStudyReminders, saveStudyReminder } from "../studyReminderStore";
import { useEffect, useState } from "react";
import { monthlyPlan } from "../../shared/weeklyPlan";
import { intelligenceData } from "../productIntelligence";
import { taskDueAt } from "../taskStore";
import type { NavigationTarget } from "../navigation";

export function WeeklyPlan({ onNavigate }: {
    onNavigate: (target: NavigationTarget) => void;
    onAskAi?: (text: string) => void;
}) {
    const [anchor, setAnchor] = useState(new Date()), [, refresh] = useState(0), [selectedProgram, setSelectedProgram] = useState<string | null>(null);
    useEffect(() => { const update = () => refresh(v => v + 1); window.addEventListener("ack-data-changed", update); return () => window.removeEventListener("ack-data-changed", update); }, []);
    const programs = loadStudyPrograms(), reminders = loadStudyReminders();
    const data = intelligenceData(), events = monthlyPlan(data.tasks.map(t => ({ ...t, dueAt: taskDueAt(t) })), data.subscriptions, anchor);
    return <section className="weekly-plan-page monthly-plan-page"><header className="feature-heading page-header"><div><h1>Aylık plan</h1><p>Çalışma blokların, görevlerin ve yaklaşan ödemelerin aylık görünümü.</p></div></header>{[...data.warnings, ...(programs.warning ? [programs.warning] : [])].map(w => <p key={w} role="alert">{w}</p>)}
    <PlanCalendar anchor={anchor} onAnchor={setAnchor} events={events} programs={programs.entries} onEvent={e => onNavigate({ page: e.source, id: e.id })} onProgram={setSelectedProgram} onNew={day => onNavigate({ page: "tasks", intent: "new-task", date: day })} />
    <StudyPrograms
      programs={programs.entries}
      disabled={programs.locked}
      selectedId={selectedProgram}
      onSelectionHandled={() => setSelectedProgram(null)}
      getReminder={id => reminders.entries.find(r => r.id === id)?.leadMinutes ?? null}
      onReminderChange={(id, lead) => saveStudyReminder(id, lead)}
      onSave={async program => { const loaded=loadStudyPrograms(); if(!saveStudyPrograms([...loaded.entries.filter(p=>p.id!==program.id),program],loaded)) throw Error("Program kaydedilemedi; mevcut kayıtlar korunuyor."); }}
      onDelete={async id => { const loaded=loadStudyPrograms(); if(!saveStudyPrograms(loaded.entries.filter(p=>p.id!==id),loaded)) throw Error("Program silinemedi."); }}
    />
    </section>;
}
