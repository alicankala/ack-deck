import { StudyReminderSettings } from "./StudyReminderSettings";
import { PlanCalendar } from "../../shared/PlanCalendar";
import { StudyPrograms } from "../../shared/StudyProgramPanel";
import { loadStudyPrograms, saveStudyPrograms } from "../studyProgramStore";
import { useEffect, useState } from "react";
import { weeklyPlan } from "../../shared/weeklyPlan";
import { intelligenceData, weeklyReview } from "../productIntelligence";
import { taskDueAt } from "../taskStore";
import type { NavigationTarget } from "../navigation";
export function WeeklyPlan({ onNavigate, onAskAi }: {
    onNavigate: (target: NavigationTarget) => void;
    onAskAi: (text: string) => void;
}) {
    const [anchor, setAnchor] = useState(new Date()), [review, setReview] = useState(false), [, refresh] = useState(0), [selectedProgram, setSelectedProgram] = useState<string | null>(null);
    useEffect(() => { const update = () => refresh(v => v + 1); window.addEventListener("ack-data-changed", update); return () => window.removeEventListener("ack-data-changed", update); }, []);
    const programs = loadStudyPrograms();
    const data = intelligenceData(), events = weeklyPlan(data.tasks.map(t => ({ ...t, dueAt: taskDueAt(t) })), data.subscriptions, anchor), summary = weeklyReview(data);
    return <section className="weekly-plan-page"><header className="feature-heading page-header"><div><h1>Haftalık plan</h1><p>Çalışma blokların, görevlerin ve yaklaşan ödemelerin bir arada.</p></div><button type="button" className="button button-secondary" aria-expanded={review} onClick={() => setReview(v => !v)}>Haftayı toparla</button></header>{[...data.warnings, ...(programs.warning ? [programs.warning] : [])].map(w => <p key={w} role="alert">{w}</p>)}
    <PlanCalendar anchor={anchor} onAnchor={setAnchor} events={events} programs={programs.entries} onEvent={e => onNavigate({ page: e.source, id: e.id })} onProgram={setSelectedProgram} onNew={day => onNavigate({ page: "tasks", intent: "new-task", date: day })} />
    <StudyPrograms programs={programs.entries} disabled={programs.locked} selectedId={selectedProgram} onSelectionHandled={() => setSelectedProgram(null)} onSave={async program => { const loaded=loadStudyPrograms(); if(!saveStudyPrograms([...loaded.entries.filter(p=>p.id!==program.id),program],loaded)) throw Error("Program kaydedilemedi; mevcut kayıtlar korunuyor."); }} onDelete={async id => { const loaded=loadStudyPrograms(); if(!saveStudyPrograms(loaded.entries.filter(p=>p.id!==id),loaded)) throw Error("Program silinemedi."); }} />
 <StudyReminderSettings programs={programs.entries}/>
 {review && <section className="weekly-review surface"><h2>Haftayı toparla</h2><div className="review-counts"><button onClick={() => onNavigate({ page: "tasks" })}>{summary.overdue.length} geciken görev</button><button onClick={() => onNavigate({ page: "inbox" })}>{summary.inbox?.length ?? "—"} işlenmemiş Gelen</button><button onClick={() => onNavigate({ page: "subscriptions" })}>{summary.subscriptions.length} yaklaşan abonelik</button><span>{summary.completed.length} kayıtlı tamamlanma</span></div>{summary.staleProjects.map(p => <button className="hub-record-row" key={p.id} onClick={() => onNavigate({ page: "projects", id: p.id })}>{p.name}<small>{p.nextStep || "14 gündür aktivite yok"}</small></button>)}<small>Geçmiş tutulmaya başlamadan önceki tamamlanmalar tahmin edilmez. {summary.unknownProjects.length > 0 && `${summary.unknownProjects.length} projenin kullanım geçmişi henüz yok.`}</small><button className="button button-primary" onClick={() => onAskAi("Haftamı toparla.")}>ACK AI ile toparla</button></section>}</section>;
}
