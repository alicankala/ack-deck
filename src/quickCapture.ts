import { loadTasks, saveTasks } from "./taskStore";
import { loadNotes, saveNotes } from "./notesStore";
import { recordRecent } from "./recentStore";
export function quickCapture(kind: "task" | "note", text: string, id: string = crypto.randomUUID()): string {
  const value = text.trim(); if (!value || value.length > (kind === "task" ? 160 : 30000)) throw new Error("Metin boş veya çok uzun.");
  if (window.localStorage.getItem("ack-deck.restore-journal.v1") !== null) throw new Error("Geri yükleme tamamlanana kadar kayıt yapılamaz.");
  if (kind === "task") {
    const loaded = loadTasks(); if (loaded.locked) throw new Error("Görev kayıtları okunamadı. Girilen metin korunuyor.");
    const existing = loaded.entries.find(v => v.id === id); if (existing && existing.text !== value) throw new Error("Kayıt kimliği zaten kullanılıyor.");
    if (!existing && !saveTasks([...loaded.entries, { id, text: value, completed: false, priority: "normal", dueDate: null, dueTime: null, reminder: false }], loaded)) throw new Error("Görev kaydedilemedi. Girilen metin korunuyor.");
  } else {
    const loaded = loadNotes(); if (loaded.error) throw new Error("Not kayıtları okunamadı. Girilen metin korunuyor.");
    const existing = loaded.notes.find(v => v.id === id); if (existing && existing.content !== value) throw new Error("Kayıt kimliği zaten kullanılıyor.");
    if (!existing && !saveNotes([{ id, title: value.split(/\r?\n/)[0].slice(0, 80), content: value, updatedAt: Date.now() }, ...loaded.notes])) throw new Error("Not kaydedilemedi. Girilen metin korunuyor.");
    if (!existing) recordRecent("notes", id);
  }
  return "Kaydedildi";
}
