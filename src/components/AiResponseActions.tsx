import { useRef, useState } from "react";
import { loadNotes, saveNotes } from "../notesStore";
import { loadTasks, saveTasks } from "../taskStore";
import type { NavigationTarget } from "../navigation";
export function AiResponseActions({ text, disabled, onNavigate }: { text: string; disabled: boolean; onNavigate: (target: NavigationTarget) => void }) {
  const [feedback, setFeedback] = useState("");
  const saved = useRef<string | null>(null), [drafts, setDrafts] = useState<{ text: string; selected: boolean }[] | null>(null);
  function extract() {
    const lines = text.split(/\r?\n/).filter(s => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(s));
    setDrafts((lines.length ? lines : [text]).slice(0, 30).map(s => ({ text: s.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(?:\[[ xX]\]\s*)?/, "").replace(/[*_`]/g, "").trim().slice(0, 160), selected: true })));
  }
  return <div className="ai-response-actions"><button className="button button-secondary" type="button" disabled={disabled} onClick={() => {
    if (saved.current) { onNavigate({ page: "notes", id: saved.current }); return; }
    if (text.length > 30000) { setFeedback("Yanıt 30.000 karakterden uzun; daha kısa bir bölüm kaydet."); return; }
    const loaded = loadNotes(), id = crypto.randomUUID();
    const title = text.split(/\r?\n/).find(s => s.trim())?.replace(/^#+\s*/, "").slice(0, 160) || "ACK AI notu";
    if (loaded.error || !saveNotes([{ id, title, content: text, updatedAt: Date.now() }, ...loaded.notes])) { setFeedback("Not kaydedilemedi. Yanıt korunuyor."); return; }
    saved.current = id; setFeedback("Not kaydedildi.");
  }}>{saved.current ? "Notu aç" : "Not olarak kaydet"}</button><button className="button button-secondary" type="button" disabled={disabled} onClick={extract}>Görev çıkar</button>
  {drafts && <div className="ai-task-drafts" role="group" aria-label="Yanıttan görev taslakları"><p>Kaydetmek istediğin görevleri seç ve düzenle.</p>{drafts.map((d, i) => <label key={i}><input type="checkbox" checked={d.selected} onChange={e => setDrafts(drafts.map((v, j) => j === i ? { ...v, selected: e.target.checked } : v))}/><input aria-label={"Görev " + (i + 1)} maxLength={160} value={d.text} onChange={e => setDrafts(drafts.map((v, j) => j === i ? { ...v, text: e.target.value } : v))}/></label>)}<button type="button" className="button button-primary" disabled={disabled || !drafts.some(d => d.selected && d.text.trim())} onClick={() => {
    const loaded = loadTasks(); const tasks = drafts.filter(d => d.selected && d.text.trim()).map(d => ({ id: crypto.randomUUID(), text: d.text.trim(), completed: false, reminder: false }));
    if (saveTasks([...tasks, ...loaded.entries], loaded)) { setDrafts(null); setFeedback(tasks.length + " görev kaydedildi."); } else setFeedback("Görevler kaydedilemedi. Taslaklar korunuyor.");
  }}>Seçilenleri kaydet</button><button type="button" className="button button-secondary" onClick={() => setDrafts(null)}>Vazgeç</button></div>}{feedback && <p role="status">{feedback}</p>}</div>;
}
