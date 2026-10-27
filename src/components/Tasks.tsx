import { parseSmartCapture } from "../../shared/smartCapture";
import { EditorDialog } from "./EditorDialog";
import { ActionMenu } from "./ActionMenu";
import { RecurrenceFields } from "../../shared/RecurrenceFields";
import { completeOccurrence, nextOccurrence, recurrenceLabel, scheduleDate, isOccurrenceCompleted, uncompleteOccurrence, completedTaskSortTime, formatCompletedTime } from "../../shared/recurrence";
import { studyBlocks } from "../../shared/studyPrograms";
import { loadStudyAttendance, setStudyBlockStatus, cycleAttendanceStatus } from "../../shared/studyAttendance";
import { loadStudyPrograms } from "../studyProgramStore";
import { offerUndo } from "../recordUndo";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { filterTasks, loadTasks, localDateKey, saveTasks, taskDueAt, type Task, type TaskFilter } from "../taskStore";
const filters: [TaskFilter, string][] = [["all", "Aktif"], ["today", "Bugün"], ["upcoming", "Yaklaşan"], ["undated", "Tarihsiz"], ["completed", "Tamamlanan"]];
export function Tasks({ fullPage = false, initialId, focusNew = false, initialDate }: { fullPage?: boolean; initialId?: boolean | string; focusNew?: boolean; initialDate?: string }) {
  const [loaded, setLoaded] = useState(loadTasks);
  const [tasks, setTasks] = useState<Task[]>(loaded.entries), [error, setError] = useState(loaded.warning ?? "");
  const [studyData, setStudyData] = useState(loadStudyPrograms);
  const [attendance, setAttendance] = useState(() => loadStudyAttendance());
  const [draft, setDraft] = useState(""), [editor, setEditor] = useState<Task | null>(null);
  const editorOriginal = useRef<Task | null>(null);
  useEffect(()=>{editorOriginal.current=editor?loadTasks().entries.find(t=>t.id===editor.id)??null:null;},[editor?.id]);
  const [filter, setFilter] = useState<TaskFilter>(() => initialId && loadTasks().entries.some(task => task.id === initialId && task.completed) ? "completed" : "all"), [deleteId, setDeleteId] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      const value = loadTasks();
      setLoaded(value);
      setTasks(value.entries);
      setStudyData(loadStudyPrograms());
      setAttendance(loadStudyAttendance());
      if (value.warning) setError(value.warning);
    };
    const refreshAtt = () => setAttendance(loadStudyAttendance());
    window.addEventListener("ack-data-changed", refresh);
    window.addEventListener("ack-study-attendance-changed", refreshAtt);
    return () => {
      window.removeEventListener("ack-data-changed", refresh);
      window.removeEventListener("ack-study-attendance-changed", refreshAtt);
    };
  }, []);
  function toggleStudyBlock(blockId: string) {
    const nextStatus = cycleAttendanceStatus(attendance[blockId]?.status);
    setAttendance(setStudyBlockStatus(blockId, nextStatus));
  }
  useEffect(() => { if (initialDate) setEditor({...newTask(""),dueDate:initialDate}); if (focusNew) document.getElementById("new-task")?.focus(); if (initialId) document.getElementById("task-" + initialId)?.scrollIntoView({ block: "center" }); }, [focusNew, initialId]);
  function commit(next: Task[]) { if (!saveTasks(next, loadTasks())) { setError("Görevler kaydedilemedi. Mevcut veriler korunuyor."); return false; } setTasks(next); setError(""); return true; }
  function snooze(task:Task,minutes:number){const until=Date.now()+minutes*60000;commit(loadTasks().entries.map(t=>t.id===task.id?{...t,reminder:true,snoozedUntil:until,occurrenceAt:t.recurrence?t.occurrenceAt??taskDueAt(t):null,remindedFor:null}:t));}
  function newTask(text: string): Task { return { id: crypto.randomUUID(), text, completed: false, dueDate: null, dueTime: null, priority: "normal", reminder: false }; }
  function addTask(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const text = draft.trim(); if (!text || loaded.locked) return; const capture=parseSmartCapture(text,[]); if(capture?.kind==="task"){const {kind:_,...fields}=capture;setEditor({...newTask(capture.text),...fields});return;} if(capture?.kind==="note"){setError("Bu bir not taslağı. ACK AI veya hızlı yakalama üzerinden not olarak oluşturabilirsiniz.");return;} if(commit([newTask(text), ...loadTasks().entries]))setDraft(""); }
  function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor || !editor.text.trim()) return;
    if (editor.reminder && taskDueAt(editor) === null) { setError("Hatırlatma için geçerli bir tarih ve saat seçin."); return; }
    const current = loadTasks().entries; let updated = { ...editor, text: editor.text.trim() };
    const previous=current.find(t=>t.id===editor.id);
    const stable=(t:Task|null|undefined)=>{if(!t)return null;const {remindedFor:_,...value}=t;return JSON.stringify(value);};
    if(editorOriginal.current&&stable(previous)!==stable(editorOriginal.current)){setError("Bu görev başka bir cihazda değişti veya silindi. Taslağın burada korunuyor; güncel görevi yeniden açmadan kaydetme.");return;}
    if(editor.recurrence && (JSON.stringify(editor.recurrence)!==JSON.stringify(previous?.recurrence)||editor.dueDate!==previous?.dueDate||editor.dueTime!==previous?.dueTime)){if(!editor.dueDate||!editor.dueTime){setError("Tekrar için tarih ve saat seçin.");return;}const rule={...editor.recurrence,start:editor.dueDate,time:editor.dueTime};const first=nextOccurrence(rule,new Date(rule.start+"T00:00:00Z").getTime()-86400000);if(!first){setError("Tekrar günlerini ve bitişini kontrol edin.");return;}updated={...updated,recurrence:rule,occurrenceAt:first.at,dueDate:first.date,dueTime:rule.time,snoozedUntil:null,remindedFor:null,completed:false};}
    if(!editor.recurrence){updated={...updated,recurrence:null,...(previous?.recurrence||editor.dueDate!==previous?.dueDate||editor.dueTime!==previous?.dueTime?{occurrenceAt:null,snoozedUntil:null,remindedFor:null}:{})};}
    if (commit(current.some((task) => task.id === editor.id) ? current.map((task) => task.id === editor.id ? updated : task) : [updated, ...current])) { setEditor(null); setDraft(""); }
  }
  const todayStr = localDateKey();
  const todayLessons = studyBlocks(studyData.entries, new Date(), [todayStr]);
  const weekLessons = studyBlocks(studyData.entries, new Date());
  const shownLessons = filter === "all" || filter === "today"
    ? todayLessons
    : filter === "upcoming"
    ? weekLessons.filter(b => b.date > todayStr)
    : filter === "completed"
    ? weekLessons.filter(b => Boolean(attendance[b.id]?.status)).sort((a, b) => (attendance[b.id]?.at ?? 0) - (attendance[a.id]?.at ?? 0))
    : [];
  const remainingTasks = tasks.filter((task) => !isOccurrenceCompleted(task)).length;
  const remainingLessons = todayLessons.filter((b) => !attendance[b.id]?.status).length;
  const remaining = remainingTasks + remainingLessons;
  let shown = filterTasks(tasks, filter);
  if (filter === "completed") {
    shown = [...shown].sort((a, b) => completedTaskSortTime(b) - completedTaskSortTime(a));
  } else {
    const taskDate = (t: Task) => (t.recurrence ? scheduleDate(t) : t.dueDate) || "9999-99-99";
    const taskTime = (t: Task) => t.dueTime || "99:99";
    shown = [...shown].sort((a, b) => {
      const dateDiff = taskDate(a).localeCompare(taskDate(b));
      if (dateDiff !== 0) return dateDiff;
      const timeDiff = taskTime(a).localeCompare(taskTime(b));
      if (timeDiff !== 0) return timeDiff;
      return a.text.localeCompare(b.text, "tr");
    });
  }
  return <section className={"section tasks-section " + (fullPage ? "tasks-page" : "")} aria-labelledby="tasks-heading">
    <div className="section-heading"><div>{!fullPage && <span className="eyebrow">GÜNÜN AKIŞI</span>}{fullPage ? <><h1 id="tasks-heading">Görevler</h1><p className="tasks-description">Yapılacaklarını ve günlük derslerini tek yerden takip et.</p></> : <h2 id="tasks-heading">Yapılacaklar</h2>}</div><span className="task-count">{remaining} KALDI</span></div>
    <div className="task-capture-row"><form className="task-form" onSubmit={addTask}><label className="sr-only" htmlFor="new-task">Hızlı görev ekle</label><Icon name="plus" size={18} /><input id="new-task" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Yapılacak bir şey yaz…" maxLength={160} disabled={loaded.locked} /><button type="submit" disabled={!draft.trim() || loaded.locked} aria-label="Görev ekle"><Icon name="arrowRight" size={17} /></button></form><button className="button button-primary task-create-button" type="button" title="Tarih ve hatırlatma ile yeni görev oluştur" onClick={() => { setEditor(newTask(draft)); setDeleteId(null); }} disabled={loaded.locked}><Icon name="plus" size={17}/>Yeni görev</button></div>
    <div className="tasks-card surface">
      <div className="task-filters" role="group" aria-label="Görev filtresi">{filters.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
      {error && <p className="tool-feedback error" role="alert">{error}</p>}
      {editor && <EditorDialog title={tasks.some(task => task.id === editor.id) ? "Görevi düzenle" : "Yeni görev"} description="Görev bilgilerini ve hatırlatmayı buradan düzenle." onClose={() => setEditor(null)} error={error}><form className="task-editor" onSubmit={saveEditor} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditor(null); } }} aria-label="Görev düzenleyici">
        <label className="archive-field">Görev<input autoFocus value={editor.text} onChange={(event) => setEditor({ ...editor, text: event.target.value })} maxLength={160} required /></label>
        <div className="archive-form-grid"><label className="archive-field">{editor.recurrence ? "Başlangıç günü" : "Tarih"}<input type="date" value={editor.dueDate ?? ""} onChange={(event) => setEditor({ ...editor, dueDate: event.target.value || null, reminder: event.target.value ? editor.reminder : false })} /></label><label className="archive-field">Saat<input type="time" value={editor.dueTime ?? ""} onChange={(event) => setEditor({ ...editor, dueTime: event.target.value || null, reminder: event.target.value ? editor.reminder : false })} /></label></div><RecurrenceFields key={editor.id} value={editor.recurrence??null} date={editor.dueDate??""} time={editor.dueTime??""} onChange={recurrence=>setEditor({...editor,recurrence,...(recurrence?{dueDate:editor.dueDate||recurrence.start,dueTime:editor.dueTime||recurrence.time}:{})})}/><label className="reminder-toggle"><input type="checkbox" checked={editor.reminder ?? false} disabled={!editor.dueDate || !editor.dueTime} onChange={(event) => setEditor({ ...editor, reminder: event.target.checked })} />Hatırlatma</label>
        {editor.reminder&&<label className="archive-field">Ne zaman hatırlat?<select value={editor.reminderLeadMinutes??0} onChange={e=>setEditor({...editor,reminderLeadMinutes:Number(e.target.value)})}><option value="0">Görev saatinde</option><option value="15">15 dakika önce</option><option value="60">1 saat önce</option><option value="1440">1 gün önce</option>{editor.reminderLeadMinutes&&! [0,15,60,1440].includes(editor.reminderLeadMinutes)&&<option value={editor.reminderLeadMinutes}>{editor.reminderLeadMinutes} dakika önce</option>}</select></label>}<p className="task-hint">Windows bildirimleri ACKDeck çalışırken gönderilir. Telefon eşitlemesi ve bildirimler açıksa, bulut hatırlatmaları bilgisayar kapalıyken de sürer.</p>
        <div className="settings-actions"><button className="button button-primary" type="submit">Kaydet</button><button className="button button-secondary" type="button" onClick={() => setEditor(null)}>Vazgeç</button></div>
      </form></EditorDialog>}
      <div className="task-list">
        {shownLessons.map((block) => {
          const att = attendance[block.id];
          const status = att?.status;
          return (
            <div
              className={`task-item study-task-row ${status === "attended" ? "completed is-study-attended" : status === "skipped" ? "is-study-skipped" : ""}`}
              key={block.id}
            >
              <button
                className={`task-toggle study-status-toggle ${status === "attended" ? "is-attended" : status === "skipped" ? "is-skipped" : ""}`}
                type="button"
                onClick={() => toggleStudyBlock(block.id)}
                title="1 tık: Çalıştım · 2 tık: Çalışmadım · 3 tık: Sıfırla"
                aria-label={`${block.label}: ${status === undefined ? "Çalıştım olarak işaretle" : status === "attended" ? "Çalışmadım olarak işaretle" : "Durumu sıfırla"}`}
              >
                {status === "attended" ? (
                  <Icon name="check" size={13} />
                ) : status === "skipped" ? (
                  <span className="study-toggle-x" aria-hidden="true">✕</span>
                ) : null}
              </button>
              <div className="task-text">
                <button className="task-open" type="button" onClick={() => toggleStudyBlock(block.id)}>
                  <span>{block.label}{block.topic ? ` · ${block.topic}` : ""}</span>
                  <small className="task-meta">
                    📚 Ders · {block.date === todayStr ? "Bugün" : block.date.split("-").reverse().join(".")} · {block.time} – {block.endTime}
                    {status === "attended" ? (
                      <span className="study-att-inline is-attended">
                        {" · ✓ Çalışıldı"}{formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                      </span>
                    ) : status === "skipped" ? (
                      <span className="study-att-inline is-skipped">
                        {" · ✗ Çalışılmadı"}{formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                      </span>
                    ) : (
                      <span className="study-att-hint"> · 1 tık ✓ · 2 tık ✕</span>
                    )}
                  </small>
                </button>
              </div>
              <span className="timeline-tag" style={{ flexShrink: 0 }}>Ders</span>
            </div>
          );
        })}
        {shown.length ? shown.map((task) => <div id={"task-" + task.id} className={`task-item ${isOccurrenceCompleted(task) ? "completed" : ""} ${!isOccurrenceCompleted(task) && !task.recurrence && task.dueDate && task.dueDate < localDateKey() ? "overdue" : ""} ${initialId === task.id ? "record-highlight" : ""}`} key={task.id}>
        <button className="task-toggle" type="button" disabled={loaded.locked} onClick={() => commit(loadTasks().entries.map((item) => item.id === task.id ? (isOccurrenceCompleted(item) ? uncompleteOccurrence(item) : completeOccurrence(item)) : item))} aria-label={`${task.text}: ${isOccurrenceCompleted(task) ? "tamamlanmadı olarak işaretle" : "tamamlandı olarak işaretle"}`} aria-pressed={isOccurrenceCompleted(task)}>{isOccurrenceCompleted(task) && <Icon name="check" size={13} />}</button>
        <div className="task-text"><button className="task-open" type="button" disabled={loaded.locked} onClick={() => { setEditor({ ...task }); setDeleteId(null); }}><span>{task.text}</span><small className="task-meta">{isOccurrenceCompleted(task) && <span style={{ color: "var(--app-accent, #38bdf8)", fontWeight: 600 }}>{formatCompletedTime(task.lastCompletedAt) ? `✓ ${formatCompletedTime(task.lastCompletedAt)} · ` : "✓ Tamamlandı · "}</span>}{task.recurrence ? recurrenceLabel(task.recurrence) : task.dueDate ? task.dueDate.split("-").reverse().join(".") : "Tarihsiz"}{task.dueTime && " · " + task.dueTime}{!isOccurrenceCompleted(task) && !task.recurrence && task.dueDate && task.dueDate < localDateKey() && " · Tarihi geçti"}{task.recurrence && " · " + (scheduleDate(task)?.split("-").reverse().join(".") ?? "")}{task.snoozedUntil && " · Ertelendi"}</small></button>{deleteId === task.id && <div className="task-delete-confirm"><span>Bu görev silinsin mi?</span><button type="button" onClick={() => { if (commit(loadTasks().entries.filter((item) => item.id !== task.id))) { offerUndo({ source: "tasks", record: task }); setDeleteId(null); } }}>Evet, sil</button><button type="button" onClick={() => setDeleteId(null)}>Vazgeç</button></div>}</div>
        <ActionMenu label={task.text+" işlemleri"}>{task.dueDate&&task.dueTime&&!task.completed&&<><button type="button" onClick={()=>snooze(task,15)}>15 dakika ertele</button><button type="button" onClick={()=>snooze(task,60)}>1 saat ertele</button><button type="button" onClick={()=>snooze(task,1440)}>Yarın hatırlat</button></>}<button className="task-details-button" type="button" disabled={loaded.locked} aria-label={task.text + " görevini düzenle"} onClick={() => { setEditor({ ...task }); setDeleteId(null); }}>Düzenle</button><button className="task-delete" type="button" disabled={loaded.locked} onClick={() => setDeleteId(task.id)} aria-label={`${task.text} görevini sil`}><Icon name="trash" size={16} /> Sil</button></ActionMenu>
      </div>) : shownLessons.length === 0 ? <div className="empty-tasks">{tasks.length ? "Bu filtrede görev yok." : loaded.locked ? "Görevler okunamadı. Mevcut veriler korunuyor." : "Henüz görev yok. Yukarıdan bir görev ekleyebilirsin."}</div> : null}</div>
      <div className="task-footer"><span className="task-footer-dot" /> {tasks.length} görevden {tasks.length - remainingTasks} tanesi tamamlandı{todayLessons.length > 0 ? ` · Bugün ${todayLessons.length - remainingLessons}/${todayLessons.length} ders işlendi` : ""}</div>
    </div></section>;
}
