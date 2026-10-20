import { useRef, useState } from "react";
import { loadNotes, saveNotes } from "../notesStore";
import { loadTasks, saveTasks } from "../taskStore";
import { loadStudyPrograms, saveStudyPrograms } from "../studyProgramStore";
import { extractStudyProgramDraft, newStudySession, validStudyProgram, WEEKDAY_SHORT, type StudyProgram, type StudySession } from "../../shared/studyPrograms";
import type { NavigationTarget } from "../navigation";
export function AiResponseActions({ text, disabled, onNavigate }: { text: string; disabled: boolean; onNavigate: (target: NavigationTarget) => void }) {
  const [feedback, setFeedback] = useState("");
  const saved = useRef<string | null>(null), savedProgram = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<{ text: string; selected: boolean }[] | null>(null);
  const [programDraft, setProgramDraft] = useState<StudyProgram | null>(null);
  function extract() {
    setProgramDraft(null);
    const lines = text.split(/\r?\n/).filter(s => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(s));
    setDrafts((lines.length ? lines : [text]).slice(0, 30).map(s => ({ text: s.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(?:\[[ xX]\]\s*)?/, "").replace(/[*_`]/g, "").trim().slice(0, 160), selected: true })));
  }
  function extractProgram() {
    if (savedProgram.current) { onNavigate({ page: "calendar", id: savedProgram.current }); return; }
    setDrafts(null);
    setProgramDraft(extractStudyProgramDraft(text));
  }
  function patchSession(id: string, changes: Partial<StudySession>) {
    setProgramDraft(current => current ? { ...current, sessions: current.sessions.map(s => s.id === id ? { ...s, ...changes } : s) } : null);
  }
  return <div className="ai-response-actions"><button className="button button-secondary" type="button" disabled={disabled} onClick={() => {
    if (saved.current) { onNavigate({ page: "notes", id: saved.current }); return; }
    if (text.length > 30000) { setFeedback("Yanıt 30.000 karakterden uzun; daha kısa bir bölüm kaydet."); return; }
    const loaded = loadNotes(), id = crypto.randomUUID();
    const title = text.split(/\r?\n/).find(s => s.trim())?.replace(/^#+\s*/, "").slice(0, 160) || "ACK AI notu";
    if (loaded.error || !saveNotes([{ id, title, content: text, updatedAt: Date.now() }, ...loaded.notes])) { setFeedback("Not kaydedilemedi. Yanıt korunuyor."); return; }
    saved.current = id; setFeedback("Not kaydedildi.");
  }}>{saved.current ? "Notu aç" : "Not olarak kaydet"}</button><button className="button button-secondary" type="button" disabled={disabled} onClick={extract}>Görev çıkar</button><button className="button button-secondary" type="button" disabled={disabled} onClick={extractProgram}>{savedProgram.current ? "Haftalık planı aç" : "Haftalık plana ekle"}</button>
  {drafts && <div className="ai-task-drafts" role="group" aria-label="Yanıttan görev taslakları"><p>Kaydetmek istediğin görevleri seç ve düzenle.</p>{drafts.map((d, i) => <label key={i}><input type="checkbox" checked={d.selected} onChange={e => setDrafts(drafts.map((v, j) => j === i ? { ...v, selected: e.target.checked } : v))}/><input aria-label={"Görev " + (i + 1)} maxLength={160} value={d.text} onChange={e => setDrafts(drafts.map((v, j) => j === i ? { ...v, text: e.target.value } : v))}/></label>)}<button type="button" className="button button-primary" disabled={disabled || !drafts.some(d => d.selected && d.text.trim())} onClick={() => {
    const loaded = loadTasks(); const tasks = drafts.filter(d => d.selected && d.text.trim()).map(d => ({ id: crypto.randomUUID(), text: d.text.trim(), completed: false, reminder: false }));
    if (saveTasks([...tasks, ...loaded.entries], loaded)) { setDrafts(null); setFeedback(tasks.length + " görev kaydedildi."); } else setFeedback("Görevler kaydedilemedi. Taslaklar korunuyor.");
  }}>Seçilenleri kaydet</button><button type="button" className="button button-secondary" onClick={() => setDrafts(null)}>Vazgeç</button></div>}
  {programDraft && <div className="ai-program-draft" role="group" aria-label="Yanıttan ders programı taslağı">
    <p>Ders programı çizelgesini kontrol et ve Haftalık Plan'a ekle.</p>
    <div className="ai-program-meta">
      <label>Program adı<input maxLength={160} value={programDraft.name} onChange={e => setProgramDraft({ ...programDraft, name: e.target.value })} /></label>
      <label>Başlangıç<input type="date" value={programDraft.startDate} onChange={e => setProgramDraft({ ...programDraft, startDate: e.target.value })} /></label>
      <label>Bitiş (opsiyonel)<input type="date" min={programDraft.startDate} value={programDraft.endDate ?? ""} onChange={e => setProgramDraft({ ...programDraft, endDate: e.target.value || null })} /></label>
    </div>
    <div className="ai-program-sessions">{programDraft.sessions.map((s, idx) => <div className="ai-program-session-row" key={s.id}>
      <div className="ai-program-session-top">
        <input aria-label={`Ders ${idx + 1} adı`} placeholder="Ders adı" maxLength={160} value={s.subject} onChange={e => patchSession(s.id, { subject: e.target.value })} />
        <input aria-label={`Ders ${idx + 1} saati`} type="time" value={s.time} onChange={e => patchSession(s.id, { time: e.target.value })} />
        <input aria-label={`Ders ${idx + 1} süresi`} type="number" min={10} max={240} step={5} value={s.minutes} onChange={e => patchSession(s.id, { minutes: Number(e.target.value) })} />
        <input aria-label={`Ders ${idx + 1} konusu`} placeholder="Konu / hedef" maxLength={500} value={s.topic} onChange={e => patchSession(s.id, { topic: e.target.value })} />
        {programDraft.sessions.length > 1 && <button type="button" className="button button-secondary" onClick={() => setProgramDraft({ ...programDraft, sessions: programDraft.sessions.filter(r => r.id !== s.id) })}>Sil</button>}
      </div>
      <div className="study-weekdays" role="group" aria-label={`Ders ${idx + 1} günleri`}>{WEEKDAY_SHORT.map((day, dIdx) => <button type="button" key={day} aria-pressed={s.weekdays.includes(dIdx + 1)} onClick={() => patchSession(s.id, { weekdays: s.weekdays.includes(dIdx + 1) ? s.weekdays.filter(d => d !== dIdx + 1) : [...s.weekdays, dIdx + 1].sort() })}>{day}</button>)}</div>
    </div>)}</div>
    <div className="ai-program-actions">
      <button type="button" className="button button-secondary" disabled={programDraft.sessions.length >= 60} onClick={() => setProgramDraft({ ...programDraft, sessions: [...programDraft.sessions, newStudySession()] })}>+ Ders bloğu ekle</button>
      <button type="button" className="button button-primary" disabled={disabled} onClick={() => {
        const candidate: StudyProgram = { ...programDraft, name: programDraft.name.trim(), sessions: programDraft.sessions.map(s => ({ ...s, subject: s.subject.trim(), topic: s.topic.trim() })), updatedAt: Date.now() };
        if (!validStudyProgram(candidate)) { setFeedback("Program adını, ders adlarını ve en az bir günü doldurun (süre 10–240 dk)."); return; }
        const loaded = loadStudyPrograms();
        if (!saveStudyPrograms([candidate, ...loaded.entries], loaded)) { setFeedback("Ders programı kaydedilemedi. Taslak korunuyor."); return; }
        savedProgram.current = candidate.id; setProgramDraft(null); setFeedback("Ders programı Haftalık Plan'a eklendi.");
      }}>Haftalık plana kaydet</button>
      <button type="button" className="button button-secondary" onClick={() => setProgramDraft(null)}>Vazgeç</button>
    </div>
  </div>}{feedback && <p role="status">{feedback}</p>}</div>;
}
