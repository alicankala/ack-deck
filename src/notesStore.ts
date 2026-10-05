export type Note = { id: string; title: string; content: string; updatedAt: number };

const STORAGE_KEY = "ack-deck.notes.v1";

export function loadNotes(): { notes: Note[]; error: string | null } {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { notes: [], error: null };
    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every((note) => note &&
      typeof note.id === "string" && typeof note.title === "string" &&
      typeof note.content === "string" && typeof note.updatedAt === "number" &&
      Number.isFinite(note.updatedAt) && Math.abs(note.updatedAt) <= 8.64e15) &&
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-data-changed"));
    return true;
  } catch {
    return false;
  }
}
