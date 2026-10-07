import { loadProjectSnapshot, type Project } from "./projectStore";
import { loadTasks, taskDueAt, type Task } from "./taskStore";
import { loadNotes, type Note } from "./notesStore";
import { loadSubscriptions } from "./subscriptionStore";
import { loadWorkspaces } from "./workHubStore";
import { loadActivity, type Activity } from "./activityStore";
import { todaySummary, weeklyPlan, weekDates } from "../shared/weeklyPlan";
import type { Subscription } from "../shared/subscriptions";
import { redactSecrets } from "./privacy";
export type InboxReference = {
    id: string;
    title: string;
    kind: string;
    handled: number;
    createdAt: number;
};
export const INBOX_INDEX_KEY = "ack-deck.inbox-index.v1";
export function loadInboxIndex(): InboxReference[] | null { try {
    const raw = window.localStorage.getItem(INBOX_INDEX_KEY);
    if (!raw)
        return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length <= 100 && v.every(i => i && typeof i.id === "string" && typeof i.title === "string" && typeof i.kind === "string" && [0, 1].includes(i.handled) && Number.isSafeInteger(i.createdAt)) ? v : null;
}
catch {
    return null;
} }
export function saveInboxIndex(items: InboxReference[]) { try {
    window.localStorage.setItem(INBOX_INDEX_KEY, JSON.stringify(items.slice(0, 100).map(({ id, title, kind, handled, createdAt }) => ({ id, title: title.slice(0, 180), kind, handled, createdAt }))));
    window.dispatchEvent?.(new Event("ack-data-changed"));
}
catch { } }
export type IntelligenceData = {
    projects: Project[];
    tasks: Task[];
    notes: Note[];
    subscriptions: Subscription[];
    activity: Activity[];
    inbox: InboxReference[] | null;
    warnings: string[];
};
export function intelligenceData(): IntelligenceData { const projects = loadProjectSnapshot(), tasks = loadTasks(), notes = loadNotes(), subscriptions = loadSubscriptions(), activity = loadActivity(); return { projects: projects.entries, tasks: tasks.entries, notes: notes.notes, subscriptions: subscriptions.entries, activity: activity.entries, inbox: loadInboxIndex(), warnings: [...(projects.locked ? ["Projeler okunamadı"] : []), ...(tasks.locked ? ["Görevler okunamadı"] : []), ...(notes.error ? ["Notlar okunamadı"] : []), ...(subscriptions.locked ? ["Abonelikler okunamadı"] : []), ...(activity.locked ? ["Aktivite geçmişi okunamadı"] : [])] }; }
export function projectHub(projectId: string, data = intelligenceData()) {
    const project = data.projects.find(p => p.id === projectId);
    if (!project)
        return null;
    const tasks = data.tasks.filter(t => t.projectId === projectId), notes = data.notes.filter(n => n.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt);
    const inbox = data.inbox?.filter(i => project.inboxIds?.includes(i.id));
    return { project, tasks, notes: notes.slice(0, 5), inbox: inbox ?? null, workspace: loadWorkspaces().entries.find(w => w.id === project.workspaceId) ?? null, activity: data.activity.filter(a => a.projectId === projectId || a.source === "projects" && a.recordId === projectId).slice(0, 8), checklist: { done: tasks.flatMap(t => t.checklist ?? []).filter(c => c.completed).length, total: tasks.flatMap(t => t.checklist ?? []).length } };
}
export function dailySummary(data = intelligenceData(), now = new Date()) { return todaySummary(data.tasks, data.subscriptions, data.inbox?.filter(i => !i.handled).length ?? null, now); }
export function weeklyReview(data = intelligenceData(), now = new Date()) {
    const since = now.getTime() - 7 * 86400000, summary = dailySummary(data, now);
    return { overdue: data.tasks.filter(t => !t.completed && t.dueDate && !t.recurrence && t.dueDate < now.toLocaleDateString("sv-SE")), inbox: data.inbox?.filter(i => !i.handled) ?? null, staleProjects: data.projects.filter(p => { const last = data.activity.filter(a => a.projectId === p.id || a.source === "projects" && a.recordId === p.id).reduce((n, a) => Math.max(n, a.at), 0); return last > 0 && last < now.getTime() - 14 * 86400000; }), unknownProjects: data.projects.filter(p => !data.activity.some(a => a.projectId === p.id || a.source === "projects" && a.recordId === p.id)), subscriptions: summary.subscriptions, completed: data.activity.filter(a => a.source === "tasks" && a.kind === "completed" && a.at >= since && a.at <= now.getTime()), activity: data.activity.filter(a => a.at >= since && a.at <= now.getTime()).slice(0, 30) };
}
const normalize = (s: string) => s.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i");
const safe = (s: string) => redactSecrets(s).replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s,;]+/g, "[yerel konum]");
function boundedContext(value: unknown): string {
    for (const limit of [20, 8, 3, 1]) {
        const text = JSON.stringify(value, (_key, item) => typeof item === "string" ? safe(item).slice(0, limit === 1 ? 100 : 400) : Array.isArray(item) ? item.slice(0, limit) : item);
        if (text.length <= 12000)
            return text;
    }
    return JSON.stringify({ warning: "Bağlam sınırı aşıldı. Soruyu tek proje veya güne daraltın." });
}
export function buildIntelligenceContext(query: string, data = intelligenceData(), now = new Date()): {
    text: string;
    records: {
        source: string;
        id: string;
        label: string;
    }[];
} | null {
    const q = normalize(query), matches = data.projects.filter(p => q.includes(normalize(p.name))), project = matches.length === 1 ? matches[0] : undefined;
    if (!/ner(?:e|ede|de).*kal|bu hafta|hafta.*toparla|gun.*planla|yarin.*(?:dolu|var)|siradaki|proj.*(?:kaldi|ne var|toparla)|bugun.*(?:saat|plan)/.test(q))
        return null;
    const records: {
        source: string;
        id: string;
        label: string;
    }[] = [];
    let context: unknown;
    if (project) {
        const hub = projectHub(project.id, data)!;
        context = { project: { id: project.id, name: safe(project.name), nextStep: safe(project.nextStep ?? "") }, openTasks: hub.tasks.filter(t => !t.completed).slice(0, 12).map(t => ({ id: t.id, text: safe(t.text), checklist: t.checklist, dueDate: t.dueDate })), checklist: hub.checklist, lastNotes: hub.notes.map(n => ({ id: n.id, title: safe(n.title), content: safe(n.content).slice(0, 400) })), inbox: hub.inbox, activity: hub.activity };
        records.push({ source: "projects", id: project.id, label: project.name }, ...hub.tasks.slice(0, 8).map(t => ({ source: "tasks", id: t.id, label: t.text })), ...hub.notes.slice(0, 3).map(n => ({ source: "notes", id: n.id, label: n.title })));
    }
    else if (/bu hafta ne yapt|hafta.*toparla/.test(q)) {
        const review = weeklyReview(data, now);
        context = { ...review, staleProjects: review.staleProjects.map(p => ({ id: p.id, name: p.name, nextStep: p.nextStep })), unknownProjects: review.unknownProjects.map(p => ({ id: p.id, name: p.name })), completedCount: review.completed.length, historyCoverage: "Yalnız kaydedilmiş son 90 gün / 1000 olay; geçmiş olaylar tahmin edilmez." };
        records.push(...review.completed.slice(0, 8).map(a => ({ source: a.source, id: a.recordId, label: a.label })));
    }
    else if (/ner(?:e|ede|de).*kal/.test(q)) {
        context = { lastActivity: data.activity.slice(0, 12), projects: data.projects.filter(p => p.nextStep).slice(0, 8).map(p => ({ id: p.id, name: p.name, nextStep: p.nextStep })) };
        records.push(...data.activity.slice(0, 8).map(a => ({ source: a.source, id: a.recordId, label: a.label })));
    }
    else {
        const anchor = new Date(now);
        if (/yarin/.test(q))
            anchor.setDate(anchor.getDate() + 1);
        const plan = weeklyPlan(data.tasks.map(t => ({ ...t, dueAt: taskDueAt(t) })), data.subscriptions, anchor);
        context = { today: dailySummary(data, now), days: weekDates(anchor), plan: plan.slice(0, 40), openUndated: data.tasks.filter(t => !t.completed && !t.dueDate).slice(0, 8).map(t => ({ id: t.id, text: t.text })), durationUnknown: "Görevlerin süre tahmini kayıtlı değil; iki saate sığacağı kesin söylenemez." };
        records.push(...plan.slice(0, 8).map(p => ({ source: p.source, id: p.id, label: p.label })));
    }
    return { text: boundedContext({ localTime: now.toLocaleString("sv-SE"), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, warnings: data.warnings, data: context }), records: [...new Map(records.map(r => [r.source + ":" + r.id, { ...r, label: safe(r.label).slice(0, 200) }])).values()].slice(0, 20) };
}
export function localIntelligenceAnswer(query: string, data = intelligenceData(), now = new Date()) {
    const q = normalize(query);
    if (!/ner(?:e|ede|de).*kal|bu hafta ne yapt|proj.*(?:ne kaldi|ne var)/.test(q))
        return null;
    const context = buildIntelligenceContext(query, data, now);
    if (!context)
        return null;
    const projects = data.projects.filter(p => q.includes(normalize(p.name))), project = projects.length === 1 ? projects[0] : null;
    let text: string;
    if (project) {
        const hub = projectHub(project.id, data)!;
        text = `${project.name}\nSıradaki adım: ${project.nextStep || "Belirlenmedi"}\nAçık görev: ${hub.tasks.filter(t => !t.completed).length}\nChecklist: ${hub.checklist.done}/${hub.checklist.total}\nSon not: ${hub.notes[0]?.title ?? "Bağlı not yok"}\nBekleyen Gelen: ${hub.inbox === null ? "Henüz kontrol edilmedi" : hub.inbox.filter(i => !i.handled).length}\nSon tamamlanan: ${hub.activity.find(a => a.kind === "completed")?.label ?? "Kaydedilmiş tamamlanma yok"}`;
    }
    else if (/bu hafta ne yapt/.test(q)) {
        const review = weeklyReview(data, now), counts = (source: Activity["source"], kind?: Activity["kind"]) => data.activity.filter(a => a.at >= now.getTime() - 7 * 86400000 && a.at <= now.getTime() && a.source === source && (!kind || a.kind === kind)).length;
        text = `Son 7 günde kaydedilen işler\n• ${review.completed.length} görev tamamlanması\n• ${counts("notes", "updated")} not güncellemesi\n• ${counts("workspaces", "used")} çalışma alanı kullanımı\n${review.activity.filter(a => a.source === "settings" && a.kind === "update").map(a => "• " + a.label).join("\n")}\nGeçmiş yalnız kaydedilmiş olayları kapsar; eski işler tahmin edilmez.`;
    }
    else {
        text = `Son kaldığın yer\n${data.activity.slice(0, 5).map(a => `• ${a.label} · ${new Date(a.at).toLocaleString("tr-TR")}`).join("\n") || "Henüz kaydedilmiş aktivite yok."}\n${data.projects.filter(p => p.nextStep).slice(0, 3).map(p => `${p.name} → ${p.nextStep}`).join("\n")}`;
    }
    return { ...context, answer: redactSecrets(text), warnings: data.warnings };
}
