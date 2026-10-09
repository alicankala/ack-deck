import { captureDeleted } from "./trashStore";
import { recordChanges } from "./activityStore";
import { validLinks, type RecordLinks } from "../shared/productivity";
import { attachmentMimes, MAX_ATTACHMENT } from "../shared/phone";
export type NoteAttachment = { id: string; name: string; mime: string; size: number };
export type Note = RecordLinks & { id: string; title: string; content: string; updatedAt: number; attachments?: NoteAttachment[] };
export function validNoteAttachments(value: unknown): value is NoteAttachment[] {
  return Array.isArray(value) && value.length <= 20 && value.every(file => file &&
    Object.keys(file).every(key => ["id", "name", "mime", "size"].includes(key)) &&
    typeof file.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(file.id) &&
    typeof file.name === "string" && file.name.length > 0 && file.name.length <= 180 && !/[\\/<>:"|?*\x00-\x1f]/.test(file.name) &&
    attachmentMimes.has(file.mime) && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= MAX_ATTACHMENT) &&
    new Set(value.map(file => file.id)).size === value.length;
}

const STORAGE_KEY = "ack-deck.notes.v1";

export function loadNotes(): { notes: Note[]; error: string | null } {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { notes: [], error: null };
    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every((note) => note && validLinks(note) &&
      typeof note.id === "string" && typeof note.title === "string" &&
      typeof note.content === "string" && typeof note.updatedAt === "number" &&
      Number.isFinite(note.updatedAt) && Math.abs(note.updatedAt) <= 8.64e15 &&
      (note.attachments === undefined || validNoteAttachments(note.attachments))) &&
      new Set(parsed.map((note) => note.id)).size === parsed.length) {
      return { notes: parsed, error: null };
    }
    return { notes: [], error: "Kayıtlı notlar okunamadı. Veriler korunuyor; yeni kayıt yapılmadı." };
  } catch {
    return { notes: [], error: "Yerel notlara erişilemedi. Veriler korunuyor; yeni kayıt yapılmadı." };
  }
}

export function saveNotes(notes: Note[]): boolean {
  try {
    const before = loadNotes(); if (before.error || !notes.every(n => n && validLinks(n) && typeof n.id === "string" && typeof n.title === "string" && typeof n.content === "string" && Number.isFinite(n.updatedAt) && Math.abs(n.updatedAt) <= 8.64e15 && (n.attachments === undefined || validNoteAttachments(n.attachments))) || new Set(notes.map(n => n.id)).size !== notes.length) return false;
    if (!captureDeleted("notes", before.notes, notes)) return false;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    recordChanges("notes", before.notes, notes);
    if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-data-changed"));
    return true;
  } catch {
    return false;
  }
}
