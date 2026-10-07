import { validChecklist, validLinks, type ChecklistItem, type RecordLinks } from "../shared/productivity";
import { loadTasks, saveTasks, type Task } from "./taskStore";
export const TEMPLATE_KEY = "ack-deck.templates.v1";
export type WorkTemplate = RecordLinks & {
    id: string;
    name: string;
    text: string;
    checklist: ChecklistItem[];
};
export function validTemplate(v: unknown): v is WorkTemplate { if (!v || typeof v !== "object")
    return false; const t = v as WorkTemplate; return Object.keys(t).every(k => ["id", "name", "text", "checklist", "projectId", "workspaceId"].includes(k)) && typeof t.id === "string" && !!t.id && typeof t.name === "string" && t.name.trim().length > 0 && t.name.length <= 100 && typeof t.text === "string" && t.text.trim().length > 0 && t.text.length <= 160 && validChecklist(t.checklist) && validLinks(t as Record<string, unknown>); }
export const RELEASE_TEMPLATE: WorkTemplate = { id: "release", name: "Yeni sürüm", text: "Yeni sürüm", checklist: ["Testleri çalıştır", "Sürümü artır", "Build", "Updater dosyaları", "GitHub Release", "Güncelleme testi"].map((text, i) => ({ id: `release-${i}`, text, completed: false })) };
export function loadTemplates(): {
    entries: WorkTemplate[];
    locked: boolean;
} { try {
    const raw = window.localStorage.getItem(TEMPLATE_KEY), v = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v) || !v.every(validTemplate) || new Set(v.map(t => t.id)).size !== v.length)
        throw Error();
    return { entries: v, locked: false };
}
catch {
    return { entries: [], locked: true };
} }
export function saveTemplate(template: WorkTemplate) { const loaded = loadTemplates(); if (loaded.locked || !validTemplate(template))
    return false; if(loaded.entries.length>=100&&!loaded.entries.some(t=>t.id===template.id))return false; try {
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify([template, ...loaded.entries.filter(t => t.id !== template.id)]));
    return true;
}
catch {
    return false;
} }
export function templateTask(template: WorkTemplate, projectId = template.projectId, workspaceId = template.workspaceId): Task { if (!validTemplate(template))
    throw Error("Şablon geçersiz."); return { id: crypto.randomUUID(), text: template.text, completed: false, projectId, workspaceId, checklist: template.checklist.map(row => ({ ...row, id: crypto.randomUUID(), completed: false })) }; }
export function createTemplateTask(template: WorkTemplate, projectId?: string, workspaceId?: string) { const loaded = loadTasks(); const task = templateTask(template, projectId, workspaceId); if (!saveTasks([task, ...loaded.entries], loaded))
    throw Error("Şablondan görev kaydedilemedi."); return task; }
