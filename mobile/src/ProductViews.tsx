import { PlanCalendar } from "../../shared/PlanCalendar";
import { StudyPrograms } from "../../shared/StudyProgramPanel";
import type { StudyProgram } from "../../shared/studyPrograms";
import { useRef, useState } from "react";
import type { CloudRecord, Mutation, PhoneTask, PhoneNote, PhoneProject } from "../../shared/phone";
import { parseSmartCapture } from "../../shared/smartCapture";
import { todaySummary, weeklyPlan } from "../../shared/weeklyPlan";
import { zonedAt } from "../../shared/recurrence";
import type { Subscription } from "../../shared/subscriptions";
export function MobileSmartCapture({ records, onSave }: {
    records: CloudRecord[];
    onSave: (mutation: Mutation) => Promise<void>;
}) {
    const [text, setText] = useState(""), [preview, setPreview] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false), running = useRef(false), requestId = useRef(crypto.randomUUID());
    const projects = records.filter(r => r.kind === "projects" && !r.deleted).map(r => ({ id: r.id, name: (r.data as PhoneProject).name }));
    const [draft,setDraft] = useState<ReturnType<typeof parseSmartCapture>>(null);
    async function create() { if (!draft || running.current)
        return; running.current = true; setBusy(true); try {
        const { kind, ...fields } = draft;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const data = kind === "task" ? { ...fields, text: (draft as Extract<typeof draft, {
                kind: "task";
            }>).text, completed: false, priority: "normal" as const, reminder: (draft as Extract<typeof draft, {
                kind: "task";
            }>).reminder, dueAt: draft.kind === "task" && draft.dueDate && draft.dueTime ? draft.occurrenceAt ?? zonedAt(draft.dueDate, draft.dueTime, timezone) : null, timezone } : { ...fields, updatedAt: Date.now() };
        await onSave({ mutationId: requestId.current, kind: kind === "task" ? "tasks" : "notes", id: requestId.current, baseVersion: 0, deleted: false, data: data as PhoneTask | PhoneNote });
        setText("");
        setPreview(false);
        requestId.current = crypto.randomUUID();
        setError("");
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi; taslağın burada.");
    }
    finally {
        running.current = false;
        setBusy(false);
    } }
    return <section className="mobile-smart-capture"><form onSubmit={e => { e.preventDefault(); const candidate=parseSmartCapture(text,projects);setDraft(candidate);setPreview(true);setError(candidate ? "" : "Tarihli görev veya ‘not al: …’ yaz. Belirsiz komutta normal Görev/Not eklemeyi kullan."); }}><label className="sr-only" htmlFor="smart-capture">Tek satır hızlı yakalama</label><input id="smart-capture" value={text} placeholder="Yarın 14:00 kargoyu ara…" maxLength={2000} disabled={busy} onChange={e => { setText(e.target.value); setPreview(false); requestId.current = crypto.randomUUID(); }}/><button aria-label="Hızlı ekleme taslağını önizle" disabled={!text.trim() || busy}>→</button></form>{preview && draft && <div className="capture-preview"><strong>{draft.kind === "task" ? draft.text : draft.title}</strong>{draft.kind === "task" && <p>{draft.dueDate ?? "Tarihsiz"} {draft.dueTime ?? ""}{draft.reminder && ` · ${draft.reminderLeadMinutes ?? 0} dakika önce hatırlat`}{draft.recurrence && " · Tekrar eder"}</p>}<button disabled={busy} onClick={() => void create()}>{busy ? "Kaydediliyor…" : "Oluştur"}</button><button disabled={busy} onClick={() => setPreview(false)}>Vazgeç</button></div>}{error && <p role="alert" className="error">{error}</p>}</section>;
}
export function MobileTodaySummary({ records, inbox, onPage }: {
    records: CloudRecord[];
    inbox: {
        handled: number;
    }[] | null;
    onPage: (page: string) => void;
}) {
  const summary = todaySummary(records.filter(r=>r.kind==="tasks"&&!r.deleted).map(r=>({id:r.id,...r.data as PhoneTask})), records.filter(r=>r.kind==="subscriptions"&&!r.deleted).map(r=>r.data as Subscription), inbox?.filter(i=>!i.handled).length??null);
  const projects=records.filter(r=>r.kind==="projects"&&!r.deleted&&!!(r.data as PhoneProject).nextStep).slice(0,2);
  return <section className="mobile-daily-summary" aria-label="Günün özeti"><div className="daily-focus"><div><small>GÜNÜN AKIŞI</small><strong>{summary.today ? "Bugün " + summary.today + " görevin var" : "Bugün planın açık"}</strong><span>{summary.overdue ? summary.overdue + " geciken görev" : "Geciken görev yok"}</span></div><button type="button" onClick={()=>onPage("calendar")} aria-label="Haftalık planı aç">Haftalık plan <span aria-hidden="true">›</span></button></div><div className="daily-secondary"><button type="button" onClick={()=>onPage("inbox")}><strong>{summary.unhandledInbox??"—"}</strong><span>Bekleyen gönderi</span></button><button type="button" onClick={()=>onPage("subscriptions")}><strong>{summary.subscriptions.length}</strong><span>Yaklaşan ödeme</span></button></div>{projects.map(p=><button type="button" className="mobile-next-step" key={p.id} onClick={()=>onPage("projects")}><small>Sıradaki adım · {(p.data as PhoneProject).name}</small><strong>{(p.data as PhoneProject).nextStep}</strong></button>)}</section>;
}
export function MobileProjects({ records, onSave, onOpen }: {
    records: CloudRecord[];
    onSave: (mutation: Mutation) => Promise<void>;
    onOpen: (row: CloudRecord) => void;
}) { const [selected, setSelected] = useState(""), [nextStep, setNextStep] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""); const rows = records.filter(r => r.kind === "projects" && !r.deleted); return <><div className="mobile-project-list">{rows.map(row => { const p = row.data as PhoneProject, tasks = records.filter(r => r.kind === "tasks" && !r.deleted && (r.data as PhoneTask).projectId === row.id), notes = records.filter(r => r.kind === "notes" && !r.deleted && (r.data as PhoneNote).projectId === row.id); return <article key={row.id}><button className="mobile-task-open" onClick={() => { setSelected(selected === row.id ? "" : row.id); setNextStep(p.nextStep); }}><h3>{p.name}</h3><p>{p.nextStep ? "→ " + p.nextStep : "Sıradaki adım belirlenmedi"}</p><small>{tasks.filter(t => !(t.data as PhoneTask).completed).length} açık görev · {notes.length} not</small></button>{selected === row.id && <section className="mobile-project-detail"><form onSubmit={e => { e.preventDefault(); if (busy)
    return; setBusy(true); void onSave({ mutationId: crypto.randomUUID(), kind: "projects", id: row.id, baseVersion: row.version, deleted: false, data: { ...p, nextStep: nextStep.trim() } }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}><label>Sıradaki adım<input value={nextStep} maxLength={500} onChange={e => setNextStep(e.target.value)}/></label><button disabled={busy}>Kaydet</button></form>{tasks.filter(t => !(t.data as PhoneTask).completed).map(t => <button className="mobile-task-open" key={t.id} onClick={() => onOpen(t)}>{(t.data as PhoneTask).text}<small>{(t.data as PhoneTask).checklist?.filter(c => c.completed).length ?? 0}/{(t.data as PhoneTask).checklist?.length ?? 0} adım</small></button>)}{notes.slice(0, 3).map(n => <button className="mobile-task-open" key={n.id} onClick={() => onOpen(n)}>{(n.data as PhoneNote).title}</button>)}</section>}</article>; })}</div>{!rows.length && <p>Bilgisayardaki projeler eşitlenince burada görünecek.</p>}{error && <p className="error" role="alert">{error}</p>}</>; }
export function MobileWeek({ records, onOpen, onNew, onSave, disabled = false }: {
    records: CloudRecord[]; onOpen: (row: CloudRecord) => void; onNew: (day: string) => void; onSave: (mutation: Mutation) => Promise<void>; disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState(new Date()), [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const programs = records.filter(r=>r.kind==="studyPrograms"&&!r.deleted).map(r=>r.data as StudyProgram);
  const events = weeklyPlan(records.filter(r=>r.kind==="tasks"&&!r.deleted).map(r=>({id:r.id,...r.data as PhoneTask})), records.filter(r=>r.kind==="subscriptions"&&!r.deleted).map(r=>r.data as Subscription), anchor);
  return <><PlanCalendar mobile anchor={anchor} onAnchor={setAnchor} events={events} programs={programs} onProgram={setSelectedProgram} onNew={onNew} onEvent={e=>{const row=records.find(r=>r.id===e.id&&r.kind===e.source);if(row)onOpen(row);}} />
  <StudyPrograms programs={programs} disabled={disabled} selectedId={selectedProgram} onSelectionHandled={()=>setSelectedProgram(null)} onSave={async program=>{ const row=records.find(r=>r.kind==="studyPrograms"&&r.id===program.id);await onSave({mutationId:crypto.randomUUID(),kind:"studyPrograms",id:program.id,baseVersion:row?.version??0,data:program,deleted:false}); }} onDelete={async id=>{const row=records.find(r=>r.kind==="studyPrograms"&&r.id===id);if(row)await onSave({mutationId:crypto.randomUUID(),kind:"studyPrograms",id,baseVersion:row.version,data:null,deleted:true});}} /></>;
}
