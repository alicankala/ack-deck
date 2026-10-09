import { validStudyProgram, type StudyProgram } from "../shared/studyPrograms";
export const STUDY_PROGRAM_KEY = "ack-deck.study-programs.v1";
export function loadStudyPrograms(): { entries: StudyProgram[]; preserved: unknown[]; locked: boolean; warning: string | null } {
  try {
    const raw = window.localStorage.getItem(STUDY_PROGRAM_KEY);
    if (raw === null) return { entries: [], preserved: [], locked: false, warning: null };
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw Error();
    const entries: StudyProgram[] = [], preserved: unknown[] = [], ids = new Set<string>();
    for (const row of value) if (validStudyProgram(row) && !ids.has(row.id)) { entries.push(row); ids.add(row.id); } else preserved.push(row);
    return { entries, preserved, locked: false, warning: preserved.length ? "Bazı ders programları okunamadı; kayıtlar korunuyor." : null };
  } catch { return { entries: [], preserved: [], locked: true, warning: "Ders programları okunamadı; mevcut kayıtlar korunuyor." }; }
}
export function saveStudyPrograms(entries: StudyProgram[], loaded = loadStudyPrograms()): boolean {
  if (loaded.locked || entries.length > 100 || !entries.every(validStudyProgram) || new Set(entries.map(p => p.id)).size !== entries.length) return false;
  try { window.localStorage.setItem(STUDY_PROGRAM_KEY, JSON.stringify([...entries, ...loaded.preserved])); window.dispatchEvent(new Event("ack-data-changed")); return true; } catch { return false; }
}
