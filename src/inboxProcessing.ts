import { loadTasks, saveTasks } from "./taskStore";
import { loadNotes, saveNotes, type NoteAttachment } from "./notesStore";
import { loadProjectSnapshot, saveProjects } from "./projectStore";
import { loadArchive, saveArchive } from "./archiveStore";
import { recordActivity } from "./activityStore";
export type ProcessingDraft = {
    sourceId: string;
    title: string;
    content: string;
    projectId?: string | null;
    attachment?: NoteAttachment;
};
export function inboxToTask(draft: ProcessingDraft, id: string = crypto.randomUUID()) {
    const loaded = loadTasks();
    const existing = loaded.entries.find(t => t.sourceInboxId === draft.sourceId);
    if (existing)
        return existing.id;
    const task = { id, text: draft.title.trim().slice(0, 160), completed: false, sourceInboxId: draft.sourceId, projectId: draft.projectId };
    if (!task.text || !saveTasks([task, ...loaded.entries], loaded))
        throw Error("Görev kaydedilemedi. Gelen içerik korunuyor.");
    recordActivity({ source: "inbox", recordId: draft.sourceId, label: draft.title, projectId: draft.projectId ?? undefined, kind: "processed" });
    return id;
}
export function inboxToNote(draft: ProcessingDraft, id: string = crypto.randomUUID(), existingId?: string) {
    const loaded = loadNotes();
    if (loaded.error)
        throw Error(loaded.error);
    const duplicate = loaded.notes.find(n => n.sourceInboxId === draft.sourceId);
    if (duplicate && !existingId)
        return duplicate.id;
    const existing = existingId ? loaded.notes.find(n => n.id === existingId) : undefined;
    if (existingId && !existing)
        throw Error("Seçilen not artık bulunamıyor.");
    const attachments = [...(existing?.attachments ?? []), ...(draft.attachment && !existing?.attachments?.some(a => a.id === draft.attachment!.id) ? [draft.attachment] : [])];
    const note = { ...existing, id: existing?.id ?? id, title: existing?.title ?? draft.title.trim().slice(0, 160), content: existing ? [existing.content, draft.content].filter(Boolean).join("\n\n") : draft.content, updatedAt: Date.now(), projectId: existing?.projectId ?? draft.projectId, sourceInboxId: existing?.sourceInboxId ?? draft.sourceId, ...(attachments.length ? { attachments } : {}) };
    if (note.content.length > 30000 || attachments.length > 20 || !saveNotes([note, ...loaded.notes.filter(n => n.id !== note.id)]))
        throw Error("Not kaydedilemedi. İçerik veya ek sınırını kontrol edin.");
    recordActivity({ source: "inbox", recordId: draft.sourceId, label: draft.title, projectId: note.projectId ?? undefined, kind: "processed" });
    return note.id;
}
export function linkInboxProject(sourceId: string, projectId: string) { const loaded = loadProjectSnapshot(), project = loaded.entries.find(p => p.id === projectId); if (!project)
    throw Error("Proje bulunamadı."); if (!saveProjects(loaded.entries.map(p => p.id === projectId ? { ...p, inboxIds: [...new Set([...(p.inboxIds ?? []), sourceId])] } : p), loaded))
    throw Error("Proje bağlantısı kaydedilemedi."); recordActivity({ source: "inbox", recordId: sourceId, projectId, label: project.name, kind: "processed" }); }
export function inboxToArchive(draft: ProcessingDraft, id: string = crypto.randomUUID()) {
    const loaded = loadArchive(), existing = loaded.entries.find(a => a.sourceInboxId === draft.sourceId);
    if (existing)
        return existing.id;
    const entry = { id, title: draft.title.trim(), description: draft.content, category: "Belge" as const, date: null, tags: [], file: null, createdAt: Date.now(), updatedAt: Date.now(), sourceInboxId: draft.sourceId, ...(draft.attachment ? { attachments: [draft.attachment] } : {}) };
    if (!saveArchive([entry, ...loaded.entries], loaded))
        throw Error("Arşiv kaydı kaydedilemedi.");
    recordActivity({ source: "inbox", recordId: draft.sourceId, label: draft.title, projectId: draft.projectId ?? undefined, kind: "processed" });
    return id;
}
