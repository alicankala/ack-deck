import { useEffect, useId, useRef, useState } from "react";
import { newStudyProgram, newStudySession, validStudyProgram, studyBlocks, studyConflicts, type StudyProgram, type StudySession } from "./studyPrograms";
import "./planner.css";
const weekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export function StudyPrograms({ programs, onSave, onDelete, disabled = false, selectedId, onSelectionHandled, getReminder, onReminderChange }: {
  programs: StudyProgram[]; onSave: (program: StudyProgram) => Promise<void>; onDelete: (id: string) => Promise<void>; disabled?: boolean; selectedId?: string | null; onSelectionHandled?: () => void;
  getReminder?: (id: string) => number | null; onReminderChange?: (id: string, lead: number | null) => void;
}) {
  const [draft, setDraft] = useState<StudyProgram | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), running = useRef(false);
  useEffect(() => { if (selectedId) { const program = programs.find(p => p.id === selectedId); if (program) { setDraft(structuredClone(program)); setError(""); } onSelectionHandled?.(); } }, [selectedId, programs, onSelectionHandled]);
  async function action(run: () => Promise<void>, close = false) {
    if (running.current) return; running.current = true; setBusy(true); setError("");
    try { await run(); if (close) setDraft(null); } catch (e) { setError(e instanceof Error ? e.message : "Program kaydedilemedi; taslağın korunuyor."); } finally { running.current = false; setBusy(false); }
  }
  const active = programs.filter(p => p.active), blocks = studyBlocks(active), minutes = blocks.reduce((n, b) => n + b.minutes, 0);
  return <section className="study-programs" aria-labelledby="study-programs-heading">
    <header className="study-section-heading">
      <div><h2 id="study-programs-heading">Ders programları ve çizelge</h2><p>Derslerini gün ve saatleriyle çizelge olarak düzenle; takvimine otomatik yerleşsin.</p></div>
      <div className="study-section-actions">
        <button type="button" className="planner-primary" disabled={disabled || busy || programs.length >= 100} onClick={() => { setError(""); setDraft(newStudyProgram()); }}>+ Program oluştur</button>
      </div>
    </header>
    {programs.length > 0 && <p className="study-summary">{active.length} aktif program · Bu hafta {blocks.length} ders bloğu ({Math.floor(minutes / 60)} sa {minutes % 60 ? `${minutes % 60} dk` : ""})</p>}
    {!programs.length && <div className="study-empty"><span aria-hidden="true">▦</span><div><strong>Çalışmanı görev listesine sıkıştırma.</strong><p>Derslerini, günlerini ve çalışma sürelerini tek çizelgede planla veya ACK AI'ya hazırlat.</p></div></div>}
    <div className="study-program-list">{programs.map(p => <article className={`study-program-card ${p.active ? "" : "paused"}`} key={p.id}>
      <div className="study-program-header">
        <button type="button" className="study-program-open" disabled={disabled || busy} onClick={() => { setDraft(structuredClone(p)); setError(""); }}>
          <div className="study-program-title-row">
            <span className="study-program-status">{p.active ? "Aktif" : "Duraklatıldı"}</span>
            <h3>{p.name}</h3>
            <small>{p.sessions.length} ders bloğu · {p.endDate ? `${new Date(p.endDate + "T12:00:00").toLocaleDateString("tr-TR")} tarihine kadar` : "Her hafta"}</small>
          </div>
          <p>{[...new Set(p.sessions.map(s => s.subject))].join(" · ")}</p>
        </button>
        <div className="study-program-card-actions">
          {onReminderChange && (
            <label className="study-inline-reminder" title="Ders hatırlatması">
              <span className="study-reminder-icon" aria-hidden="true">🔔</span>
              <select
                disabled={disabled || busy}
                value={getReminder ? (getReminder(p.id) ?? "off") : "off"}
                onChange={e => onReminderChange(p.id, e.target.value === "off" ? null : Number(e.target.value))}
                aria-label={`${p.name} ders hatırlatması`}
              >
                <option value="off">Bildirim yok</option>
                <option value="0">Ders vaktinde</option>
                <option value="15">15 dk önce</option>
                <option value="30">30 dk önce</option>
                <option value="60">1 saat önce</option>
              </select>
            </label>
          )}
          <button type="button" className="planner-secondary" disabled={disabled || busy} onClick={() => { setDraft(structuredClone(p)); setError(""); }}>Düzenle</button>
          <button type="button" className="planner-secondary study-pause" disabled={disabled || busy} onClick={() => void action(() => onSave({ ...p, active: !p.active, updatedAt: Date.now() }))}>{p.active ? "Duraklat" : "Devam et"}</button>
        </div>
      </div>
      <div className="study-timetable" aria-label={`${p.name} haftalık ders çizelgesi`}>{weekdays.map((dayName, idx) => {
        const daySessions = p.sessions.filter(s => s.weekdays.includes(idx + 1)).sort((a, b) => a.time.localeCompare(b.time));
        return <div className={`study-timetable-day ${daySessions.length ? "has-sessions" : ""}`} key={dayName}>
          <span className="study-timetable-day-label">{dayName}</span>
          {daySessions.length ? daySessions.map(s => <div className="study-timetable-slot" key={s.id}>
            <small>{s.time} · {s.minutes} dk</small>
            <strong>{s.subject}</strong>
            {s.topic && <span>{s.topic}</span>}
          </div>) : <small className="study-timetable-free">—</small>}
        </div>;
      })}</div>
    </article>)}</div>
    {error && !draft && <p role="alert" className="planner-error">{error}</p>}
    {draft && <StudyProgramDialog key={draft.id} initial={draft} programs={programs} busy={busy || disabled} error={error} initialReminder={getReminder ? getReminder(draft.id) : null} onClose={() => setDraft(null)} onSave={(p, lead) => void action(async () => { await onSave(p); onReminderChange?.(p.id, lead); }, true)} onDelete={programs.some(p => p.id === draft.id) ? () => void action(() => onDelete(draft.id), true) : undefined} />}
  </section>;
}
function StudyProgramDialog({ initial, programs, busy, error, initialReminder = null, onClose, onSave, onDelete }: { initial: StudyProgram; programs: StudyProgram[]; busy: boolean; error: string; initialReminder?: number | null; onClose: () => void; onSave: (p: StudyProgram, reminderLead: number | null) => void; onDelete?: () => void }) {
  const [value, setValue] = useState(initial), [reminderLead, setReminderLead] = useState<number | null>(initialReminder), [validation, setValidation] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), heading = useId();
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => { if (el?.open) el.close(); }; }, []);
  const patch = (id: string, changes: Partial<StudySession>) => setValue(v => ({ ...v, sessions: v.sessions.map(s => s.id === id ? { ...s, ...changes } : s) }));
  const candidate = { ...value, name: value.name.trim(), sessions: value.sessions.map(s => ({ ...s, subject: s.subject.trim(), topic: s.topic.trim() })), updatedAt: Date.now() };
  const valid = validStudyProgram(candidate), overlap = valid && studyConflicts([...programs.filter(p => p.id !== value.id), { ...candidate, active: true }], new Date(value.startDate + "T12:00:00")).length > 0;
  return <dialog ref={dialog} className="study-dialog" aria-labelledby={heading} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><header className="study-dialog-heading"><div><h2 id={heading}>{onDelete ? "Programı düzenle" : "Ders programı oluştur"}</h2><p>Dersleri ayrı görevler oluşturmadan, haftalık bloklar olarak planla.</p></div><button type="button" aria-label="Program düzenleyicisini kapat" disabled={busy} onClick={onClose}>×</button></header><form onSubmit={e => { e.preventDefault(); if (busy) return; if (!valid) { setValidation("Program adını, dersleri ve en az bir günü doldur. Süre 10–240 dakika olmalı ve blok aynı gün bitmeli."); return; } onSave(candidate, reminderLead); }}><fieldset disabled={busy} className="study-fields"><label>Program adı<input autoFocus value={value.name} required maxLength={160} placeholder="Örn. Güz dönemi çalışma planım" onChange={e => setValue({ ...value, name: e.target.value })} /></label><div className="study-date-fields"><label>Başlangıç<input type="date" required value={value.startDate} onChange={e => setValue({ ...value, startDate: e.target.value })} /></label><label><span>Bitiş <small>· İsteğe bağlı</small></span><input type="date" min={value.startDate} value={value.endDate ?? ""} onChange={e => setValue({ ...value, endDate: e.target.value || null })} /></label></div><div className="study-reminder-field" style={{ marginTop: "0.6rem" }}><label><span>🔔 Hatırlatma Bildirimi</span><select value={reminderLead ?? "off"} onChange={e => setReminderLead(e.target.value === "off" ? null : Number(e.target.value))}><option value="off">Bildirim yok</option><option value="0">Ders vaktinde</option><option value="15">15 dakika önce</option><option value="30">30 dakika önce</option><option value="60">1 saat önce</option></select></label></div><p className="study-zone">Saatler {value.timezone} saat diliminde. Bildirim tercihin program kaydedildiğinde doğrudan uygulanır.</p>
      <div className="study-editor-sessions">{value.sessions.map((s, index) => <section className="study-session" key={s.id}><header><strong>Ders {index + 1}</strong><button type="button" aria-label={`Ders ${index + 1} kaldır`} disabled={value.sessions.length === 1} onClick={() => setValue({ ...value, sessions: value.sessions.filter(row => row.id !== s.id) })}>Kaldır</button></header><label>Ders adı<input value={s.subject} required maxLength={160} placeholder="Örn. Matematik" onChange={e => patch(s.id, { subject: e.target.value })} /></label><div className="study-weekdays" role="group" aria-label={`Ders ${index + 1} günleri`}>{weekdays.map((day, i) => <button type="button" aria-pressed={s.weekdays.includes(i + 1)} key={day} onClick={() => patch(s.id, { weekdays: s.weekdays.includes(i + 1) ? s.weekdays.filter(d => d !== i + 1) : [...s.weekdays, i + 1].sort() })}>{day}</button>)}</div><div className="study-time-fields"><label>Başlangıç saati<input type="time" required value={s.time} onChange={e => patch(s.id, { time: e.target.value })} /></label><label>Süre (dakika)<input type="number" required min={10} max={240} step={5} value={s.minutes} onChange={e => patch(s.id, { minutes: Number(e.target.value) })} /></label></div><label><span>Konu / hedef <small>· İsteğe bağlı</small></span><input value={s.topic} maxLength={500} placeholder="Örn. Türev konu tekrarı ve 20 soru" onChange={e => patch(s.id, { topic: e.target.value })} /></label></section>)}</div><button type="button" className="planner-secondary" disabled={value.sessions.length >= 60} onClick={() => setValue({ ...value, sessions: [...value.sessions, newStudySession()] })}>+ Ders bloğu ekle</button>
    </fieldset>{overlap && <p className="study-warning" role="status">Bazı çalışma saatleri çakışıyor. Kaydedebilirsin; planda çakışan bloklar işaretlenir.</p>}{(error || validation) && <p role="alert" className="planner-error">{error || validation}</p>}{confirmDelete && <div className="study-delete-confirm" role="alert"><p>Bu program ve ona ait çalışma blokları silinsin mi?</p><button type="button" disabled={busy} onClick={onDelete}>Programı sil</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Vazgeç</button></div>}<footer className="study-dialog-actions">{onDelete && <button type="button" className="study-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>Programı sil</button>}<button type="button" className="planner-secondary" disabled={busy} onClick={onClose}>Vazgeç</button><button type="submit" className="planner-primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Programı kaydet"}</button></footer></form></dialog>;
}
