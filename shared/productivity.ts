/** Portable metadata only: no native paths, credentials, or file contents. */
export type ChecklistItem = {
    id: string;
    text: string;
    completed: boolean;
};
export type RecordLinks = {
    projectId?: string | null;
    workspaceId?: string | null;
    sourceInboxId?: string;
};
export type AttachmentReference = {
    id: string;
    name: string;
    mime: string;
    size: number;
};
export function validAttachments(value: unknown): value is AttachmentReference[] { return Array.isArray(value) && value.length <= 20 && new Set(value.map(v => v?.id)).size === value.length && value.every(v => v && Object.keys(v).every(k => ["id", "name", "mime", "size"].includes(k)) && typeof v.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v.id) && typeof v.name === "string" && v.name.length > 0 && v.name.length <= 180 && !/[\\/<>:"|?*\x00-\x1f]/.test(v.name) && ["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav", "text/plain"].includes(v.mime) && Number.isSafeInteger(v.size) && v.size > 0 && v.size <= 10 * 1024 * 1024); }
export function validReference(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(value); }
export function validLinks(value: Record<string, unknown>): boolean {
    return [value.projectId, value.workspaceId, value.sourceInboxId].every(v => v == null || validReference(v));
}
export function validChecklist(value: unknown): value is ChecklistItem[] {
    return Array.isArray(value) && value.length <= 100 && value.every(v => v && typeof v === "object" &&
        Object.keys(v).every(k => ["id", "text", "completed"].includes(k)) && validReference(v.id) &&
        typeof v.text === "string" && v.text.trim().length > 0 && v.text.length <= 200 && typeof v.completed === "boolean") &&
        new Set(value.map(v => v.id)).size === value.length;
}
export function checklistProgress(items: ChecklistItem[] = []) { return { done: items.filter(v => v.completed).length, total: items.length }; }
export const PRODUCT_FIELDS = ["projectId", "workspaceId", "sourceInboxId", "checklist", "reminderLeadMinutes"];
export function productMetadata(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([k]) => PRODUCT_FIELDS.includes(k))); }
