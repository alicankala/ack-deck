import { useEffect, useState } from "react";
import { projectHub } from "../productIntelligence";
import { loadTasks, saveTasks } from "../taskStore";
import { loadNotes, saveNotes } from "../notesStore";
import { loadShortcuts } from "../workHubStore";
import { loadFiles } from "../fileStore";
import type { Project } from "../projectStore";
import type { NavigationTarget } from "../navigation";
import { RecordLinkFields } from "./RecordLinkFields";
import { RELEASE_TEMPLATE, loadTemplates, templateTask } from "../templateStore";
import { EditorDialog } from "./EditorDialog";
import type { Task } from "../taskStore";
export function ProjectHub({ project, onChange, onNavigate, onAskAi }: {
    project: Project;
    onChange: (patch: Partial<Project>) => boolean;
    onNavigate?: (target: NavigationTarget) => void;
    onAskAi?: (text: string) => void;
}) {
    const [, refresh] = useState(0), [nextStep, setNextStep] = useState(project.nextStep ?? ""), [stepDirty, setStepDirty] = useState(false), [error, setError] = useState(""), [templateDraft, setTemplateDraft] = useState<Task | null>(null);
    useEffect(() => { if (!stepDirty)
        setNextStep(project.nextStep ?? ""); }, [project.nextStep, stepDirty]);
    useEffect(() => { const update = () => refresh(v => v + 1); window.addEventListener("ack-data-changed", update); return () => window.removeEventListener("ack-data-changed", update); }, []);
    const hub = projectHub(project.id);
    if (!hub)
        return null;
    function link(kind: "tasks" | "notes", id: string) { if (!id)
        return; const ok = kind === "tasks" ? (() => { const l = loadTasks(); return saveTasks(l.entries.map(t => t.id === id ? { ...t, projectId: project.id } : t), l); })() : (() => { const l = loadNotes(); return !l.error && saveNotes(l.notes.map(n => n.id === id ? { ...n, projectId: project.id, updatedAt: Date.now() } : n)); })(); setError(ok ? "" : "Bağlantı kaydedilemedi."); }
    return <section id="project-work-summary" className="project-hub" tabIndex={-1} aria-label={project.name + " çalışma özeti"}>
 <header className="page-header"><h2>{project.name}</h2><button type="button" className="button button-secondary" onClick={() => onAskAi?.(`${project.name} projesinde nerede kalmıştım?`)}>ACK AI'a sor</button></header>
 <form className="next-step-form" data-navigation-dirty={stepDirty ? "true" : undefined} onSubmit={e => { e.preventDefault(); if (onChange({ nextStep: nextStep.trim() })) {
        setStepDirty(false);
        setError("");
    }
    else
        setError("Sıradaki adım kaydedilemedi."); }}><label>Sıradaki adım<input value={nextStep} onChange={e => { setNextStep(e.target.value); setStepDirty(true); }} maxLength={500} placeholder="Bir sonraki küçük iş…"/></label><button className="button button-primary">Kaydet</button></form>
 <label>Proje şablonu<select value="" onChange={e => { const t = [RELEASE_TEMPLATE, ...loadTemplates().entries].find(t => t.id === e.target.value); if (t)
        setTemplateDraft(templateTask(t, project.id, project.workspaceId)); }}><option value="">Şablondan görev hazırla…</option>{[RELEASE_TEMPLATE, ...loadTemplates().entries].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 {templateDraft && <EditorDialog title="Proje görevi taslağı" onClose={() => setTemplateDraft(null)} error={error}><form className="inbox-note-form" onSubmit={e => { e.preventDefault(); const loaded = loadTasks(); if (loaded.entries.some(t => t.id === templateDraft.id)) {
        setTemplateDraft(null);
        return;
    } if (saveTasks([templateDraft, ...loaded.entries], loaded))
        setTemplateDraft(null);
    else
        setError("Şablon görevi kaydedilemedi."); }}><label>Görev<input required maxLength={160} value={templateDraft.text} onChange={e => setTemplateDraft({ ...templateDraft, text: e.target.value })}/></label><ul>{templateDraft.checklist?.map(c => <li key={c.id}>☐ {c.text}</li>)}</ul><button className="button button-primary">Oluştur</button></form></EditorDialog>}
 {error && <p role="alert">{error}</p>}<div className="project-hub-columns"><section><h3>Açık görevler <small>{hub.tasks.filter(t => !t.completed).length}</small></h3>{hub.checklist.total > 0 && <p>Checklist · {hub.checklist.done}/{hub.checklist.total}<progress value={hub.checklist.done} max={hub.checklist.total}/></p>}{hub.tasks.filter(t => !t.completed).map(t => <button className="hub-record-row" type="button" key={t.id} onClick={() => onNavigate?.({ page: "tasks", id: t.id })}>{t.text}<small>{t.checklist?.length ? `${t.checklist.filter(c => c.completed).length}/${t.checklist.length} adım` : ""}</small></button>)}<label>Görev bağla<select value="" onChange={e => link("tasks", e.target.value)}><option value="">Bir görev seç…</option>{loadTasks().entries.filter(t => !t.projectId).map(t => <option key={t.id} value={t.id}>{t.text}</option>)}</select></label></section>
 <section><h3>Son notlar</h3>{hub.notes.map(n => <button className="hub-record-row" type="button" key={n.id} onClick={() => onNavigate?.({ page: "notes", id: n.id })}>{n.title}<small>{n.content.slice(0, 80)}</small></button>)}<label>Not bağla<select value="" onChange={e => link("notes", e.target.value)}><option value="">Bir not seç…</option>{loadNotes().notes.filter(n => !n.projectId).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label></section></div>
 <RecordLinkFields project={false} workspace value={{ workspaceId: project.workspaceId }} onChange={v => onChange({ workspaceId: v.workspaceId })}/>{hub.workspace && <button type="button" className="hub-record-row" onClick={() => onNavigate?.({ page: "workspaces", id: hub.workspace!.id })}>Çalışma alanı · {hub.workspace.name}</button>}
 <section><h3>İlgili Gelenler</h3>{hub.inbox === null ? <p>Gelenler açıldığında ilgili içerikler burada görünür.</p> : hub.inbox.length ? hub.inbox.map(i => <button className="hub-record-row" key={i.id} onClick={() => onNavigate?.({ page: "inbox", id: i.id })}>{i.title}<small>{i.handled ? "İşlendi" : "Bekliyor"}</small></button>) : <p>Bağlı içerik yok.</p>}</section>
 <section><h3>Dosyalar ve kısayollar</h3>{loadShortcuts().entries.filter(s => project.shortcutIds?.includes(s.id)).map(s => <button className="hub-record-row" key={s.id} onClick={() => onNavigate?.({ page: "files", id: s.id })}>{s.name}</button>)}{loadFiles().entries.filter(f => project.fileIds?.includes(f.id)).map(f => <button className="hub-record-row" key={f.id} onClick={() => onNavigate?.({ page: "files", id: f.id })}>{f.name}</button>)}<label>Kısayol bağla<select value="" onChange={e => { if (e.target.value)
        onChange({ shortcutIds: [...new Set([...(project.shortcutIds ?? []), e.target.value])] }); }}><option value="">Kayıtlı kısayol seç…</option>{loadShortcuts().entries.filter(s => !project.shortcutIds?.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Dosya bağla<select value="" onChange={e => { if (e.target.value)
        onChange({ fileIds: [...new Set([...(project.fileIds ?? []), e.target.value])] }); }}><option value="">Kayıtlı dosya seç…</option>{loadFiles().entries.filter(f => !project.fileIds?.includes(f.id)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label></section>
 <section><h3>Son aktiviteler</h3>{hub.activity.length ? hub.activity.map(a => <div className="hub-activity-row" key={a.id}><span>{a.label} · {a.kind === "completed" ? "Tamamlandı" : a.kind === "used" ? "Açıldı" : a.kind === "created" ? "Oluşturuldu" : a.kind === "checklist" ? "Checklist güncellendi" : "Güncellendi"}</span><time>{new Date(a.at).toLocaleString("tr-TR")}</time></div>) : <p>Bu projeye ait kaydedilmiş aktivite yok.</p>}</section>
 </section>;
}
