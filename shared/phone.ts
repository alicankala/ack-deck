import { validStudyProgram, type StudyProgram } from "./studyPrograms";
import { validLinks, validChecklist, validAttachments, type AttachmentReference, type ChecklistItem, type RecordLinks } from "./productivity";
import { validRecurrence, type Recurrence } from "./recurrence";
import { validSubscription, type Subscription } from "./subscriptions";
export const MAX_ATTACHMENT = 10 * 1024 * 1024;
export const RETENTION_SECONDS = 30 * 24 * 60 * 60;
export type Kind = "tasks" | "notes" | "subscriptions" | "projects" | "studyPrograms";
export type PhoneTask = RecordLinks & { checklist?:ChecklistItem[]; reminderLeadMinutes?:number; text: string; completed: boolean; dueDate: string | null; dueTime: string | null; priority: "normal" | "important"; reminder: boolean; dueAt: number | null; timezone: string; recurrence?: Recurrence | null; occurrenceAt?: number | null; lastCompletedAt?: number | null; snoozedUntil?: number | null };
export type PhoneNote = RecordLinks & { attachments?:AttachmentReference[]; title: string; content: string; updatedAt: number };
export type PhoneProject = {name:string;description:string;nextStep:string;workspaceId:string|null;inboxIds:string[]};
export function validProject(v:unknown):v is PhoneProject{return object(v)&&exact(v,["name","description","nextStep","workspaceId","inboxIds"])&&text(v.name,160,true)&&text(v.description,2000)&&text(v.nextStep,500)&&(v.workspaceId===null||id(v.workspaceId))&&Array.isArray(v.inboxIds)&&v.inboxIds.length<=200&&v.inboxIds.every(id)&&new Set(v.inboxIds).size===v.inboxIds.length&&![v.name,v.description,v.nextStep].some(s=>/[A-Za-z]:[\\/]|\\\\/.test(String(s)));}
export type RecordData = PhoneTask | PhoneNote | Subscription | PhoneProject | StudyProgram;
export type CloudRecord = { kind: Kind; id: string; version: number; data: RecordData | null; deleted: boolean; updatedAt: number };
export type Mutation = { mutationId: string; kind: Kind; id: string; baseVersion: number; data: RecordData | null; deleted: boolean };
export const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const exact = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).every(key => fields.includes(key)) && fields.every(key => key in value);
export const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(value);
export const text = (value: unknown, max: number, required = false): value is string => typeof value === "string" && value.length <= max && (!required || !!value.trim()) && !/AIza[\w-]{30,}/.test(value);
export const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
export function validTask(value: unknown): value is PhoneTask {
  if (!object(value) || !exact(Object.fromEntries(Object.entries(value).filter(([key])=>!["recurrence","occurrenceAt","lastCompletedAt","snoozedUntil","checklist","projectId","workspaceId","sourceInboxId","reminderLeadMinutes"].includes(key))), ["text", "completed", "dueDate", "dueTime", "priority", "reminder", "dueAt", "timezone"])) return false;
  if (!validLinks(value) || value.checklist!==undefined&&!validChecklist(value.checklist) || value.reminderLeadMinutes!==undefined&&(!Number.isInteger(value.reminderLeadMinutes)||Number(value.reminderLeadMinutes)<0||Number(value.reminderLeadMinutes)>10080))return false;
  if (!text(value.text, 2000, true) || typeof value.completed !== "boolean" || !["normal", "important"].includes(String(value.priority)) || typeof value.reminder !== "boolean" || !text(value.timezone, 100, true)) return false;
  try { new Intl.DateTimeFormat("tr", { timeZone: value.timezone }); } catch { return false; }
  if (value.dueDate !== null) {
    if (typeof value.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)) return false;
    const parsed = new Date(value.dueDate + "T00:00:00Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value.dueDate) return false;
  }
  if (value.dueTime !== null && (typeof value.dueTime !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.dueTime))) return false;
  if(value.recurrence != null && (!validRecurrence(value.recurrence) || !value.dueDate || !value.dueTime))return false;
  if([value.occurrenceAt,value.lastCompletedAt,value.snoozedUntil].some(v=>v!=null&&!timestamp(v)))return false;
  return (value.dueAt === null || timestamp(value.dueAt)) && (!value.reminder || (!!value.dueDate && !!value.dueTime && timestamp(value.dueAt)));
}
export function validNote(value: unknown): value is PhoneNote { return object(value) && validLinks(value) && (value.attachments===undefined||validAttachments(value.attachments)) && exact(Object.fromEntries(Object.entries(value).filter(([key])=>!["projectId","workspaceId","sourceInboxId","attachments"].includes(key))), ["title", "content", "updatedAt"]) && text(value.title, 200, true) && text(value.content, 20000) && timestamp(value.updatedAt); }
export function validMutation(value: unknown): value is Mutation {
  return object(value) && exact(value, ["mutationId", "kind", "id", "baseVersion", "data", "deleted"]) && id(value.mutationId) && id(value.id) && ["tasks", "notes", "subscriptions", "projects", "studyPrograms"].includes(String(value.kind)) && timestamp(value.baseVersion) && typeof value.deleted === "boolean" && (value.deleted ? value.data === null : value.kind === "studyPrograms" ? validStudyProgram(value.data) : value.kind === "projects" ? validProject(value.data) : value.kind === "tasks" ? validTask(value.data) : value.kind === "subscriptions" ? validSubscription(value.data) : validNote(value.data));
}
export function validCloudRecord(value:unknown):value is CloudRecord {return object(value)&&exact(value,["kind","id","version","data","deleted","updatedAt"])&&["tasks","notes","subscriptions","projects","studyPrograms"].includes(String(value.kind))&&id(value.id)&&timestamp(value.version)&&value.version>0&&timestamp(value.updatedAt)&&typeof value.deleted==="boolean"&&(value.deleted?value.data===null:value.kind==="studyPrograms"?validStudyProgram(value.data):value.kind==="projects"?validProject(value.data):value.kind==="tasks"?validTask(value.data):value.kind==="subscriptions"?validSubscription(value.data):validNote(value.data));}
export function validUrl(value: unknown): value is string { if (!text(value, 4096, true)) return false; try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }
export const attachmentMimes = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav", "text/plain"]);
export function safeAttachment(name: string, mime: string, bytes: Uint8Array): boolean {
  if (!text(name, 180, true) || /[\\/\x00]/.test(name) || /\.(exe|com|bat|cmd|ps1|msi|scr|js|html?|svg|vbs|lnk|appx|dll)$/i.test(name) || !attachmentMimes.has(mime) || bytes.length > MAX_ATTACHMENT || bytes.length === 0) return false;
  const extensions:Record<string,string[]>={"image/png":["png"],"image/jpeg":["jpg","jpeg"],"image/webp":["webp"],"image/heic":["heic"],"application/pdf":["pdf"],"audio/mp4":["mp4","m4a"],"audio/mpeg":["mp3"],"audio/ogg":["ogg"],"audio/webm":["webm"],"audio/wav":["wav"],"text/plain":["txt"]};
  if(/[<>:"|?*\x00-\x1f]/.test(name)||!extensions[mime]?.includes(name.split(".").pop()?.toLowerCase()??""))return false;
  const prefix = new TextDecoder().decode(bytes.slice(0, 16));
  if (prefix.startsWith("MZ") || prefix.startsWith("#!")) return false;
  if (mime === "application/pdf") return prefix.startsWith("%PDF-");
  if (mime === "image/png") return bytes[0] === 137 && prefix.slice(1, 4) === "PNG";
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") return prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP";
  if (["image/heic", "audio/mp4"].includes(mime)) return prefix.slice(4, 8) === "ftyp";
  if (mime === "audio/ogg") return prefix.startsWith("OggS");
  if (mime === "audio/webm") return bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
  if (mime === "audio/wav") return prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WAVE";
  if (mime === "audio/mpeg") return prefix.startsWith("ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  return !bytes.includes(0) && !/<(?:script|html|svg)|powershell|^@echo\s+off/i.test(new TextDecoder().decode(bytes));
}
