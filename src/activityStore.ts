import { validReference } from "../shared/productivity";
export const ACTIVITY_KEY = "ack-deck.activity.v1";
export const ACTIVITY_LIMIT = 1000;
export const ACTIVITY_RETENTION = 90 * 86400000;
export type Activity = {
    id: string;
    at: number;
    kind: "created" | "updated" | "completed" | "checklist" | "used" | "processed" | "update";
    source: "tasks" | "notes" | "projects" | "workspaces" | "inbox" | "subscriptions" | "settings";
    recordId: string;
    projectId?: string;
    label: string;
};
export function validActivity(v: unknown): v is Activity {
    if (!v || typeof v !== "object" || Array.isArray(v))
        return false;
    const a = v as Activity;
    return Object.keys(a).every(k => ["id", "at", "kind", "source", "recordId", "projectId", "label"].includes(k)) && validReference(a.id) && Number.isSafeInteger(a.at) && a.at >= 0 && a.at <= 8.64e15 &&
        ["created", "updated", "completed", "checklist", "used", "processed", "update"].includes(a.kind) && ["tasks", "notes", "projects", "workspaces", "inbox", "subscriptions", "settings"].includes(a.source) && validReference(a.recordId) && (a.projectId === undefined || validReference(a.projectId)) && typeof a.label === "string" && a.label.length <= 200;
}
export function loadActivity(): {
    entries: Activity[];
    locked: boolean;
} {
    try {
        const raw = window.localStorage.getItem(ACTIVITY_KEY), v: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(v) || !v.every(validActivity) || new Set(v.map(a => a.id)).size !== v.length)
            throw new Error();
        return { entries: v, locked: false };
    }
    catch {
        return { entries: [], locked: true };
    }
}
export function recordActivity(input: Omit<Activity, "id" | "at">, now = Date.now()): boolean {
    try {
        const loaded = loadActivity();
        if (loaded.locked)
            return false;
        const entry: Activity = { ...input, label: input.label.replace(/AIza[\w-]{20,}/g, "[gizli anahtar]").slice(0, 200), id: crypto.randomUUID(), at: now };
        if (!validActivity(entry))
            return false;
        // Coalesce autosave updates; timestamps still reflect the last actual successful write.
        const previous = loaded.entries[0];
        const entries = previous && input.kind === "updated" && previous.kind === "updated" && previous.source === input.source && previous.recordId === input.recordId && now - previous.at < 60000 ? loaded.entries.slice(1) : loaded.entries;
        try {
            window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify([entry, ...entries.filter(a => a.at >= now - ACTIVITY_RETENTION)].slice(0, ACTIVITY_LIMIT)));
            return true;
        }
        catch {
            return false;
        }
    }
    catch {
        return false;
    }
}
export function recordChanges(source: "tasks" | "notes" | "projects" | "subscriptions", before: {
    id: string;
}[], after: {
    id: string;
}[]) {
    const old = new Map(before.map(v => [v.id, v]));
    for (const value of after) {
        const current = value as {
            id: string;
            text?: string;
            title?: string;
            name?: string;
            projectId?: string;
            completed?: boolean;
            lastCompletedAt?: number;
            checklist?: unknown;
        };
        const previous = old.get(current.id) as typeof current | undefined;
        if (previous && JSON.stringify(previous) === JSON.stringify(current))
            continue;
        if (previous && source === "tasks") {
            const { remindedFor: _r, ...a } = previous as typeof current & {
                remindedFor?: string;
            };
            const { remindedFor: _s, ...b } = current as typeof current & {
                remindedFor?: string;
            };
            if (JSON.stringify(a) === JSON.stringify(b))
                continue;
        }
        const kind = !previous ? "created" : current.completed && !previous.completed || current.lastCompletedAt && current.lastCompletedAt !== previous.lastCompletedAt ? "completed" : JSON.stringify(current.checklist) !== JSON.stringify(previous.checklist) ? "checklist" : "updated";
        let label=current.text ?? current.title ?? current.name ?? "Kayıt";
        if(kind==="checklist"&&Array.isArray(current.checklist)){const previousRows=Array.isArray(previous?.checklist)?previous.checklist:[];const done=current.checklist.filter(row=>row.completed&&!previousRows.find(old=>old.id===row.id)?.completed);if(done.length)label+=` · ${done.length} checklist adımı tamamlandı: ${done.slice(0,2).map(row=>row.text).join(", ")}`;}
        recordActivity({ source, recordId: current.id, projectId: source === "projects" ? current.id : current.projectId, label, kind });
    }
}
