import { useEffect, useRef, useState, type FormEvent } from "react";
import { EditorDialog } from "./EditorDialog";
import { RecurrenceFields } from "../../shared/RecurrenceFields";
import { saveTaskDraft } from "../taskActions";
import { loadTasks, type Task } from "../taskStore";

type TaskEditorDialogProps = {
  task: Task;
  isExisting: boolean;
  locked?: boolean;
  onClose: () => void;
  onSaved: (nextTasks: Task[]) => void;
};

/** Shared modal editor for creating or editing a desktop task record. */
export function TaskEditorDialog({
  task,
  isExisting,
  locked = false,
  onClose,
  onSaved,
}: TaskEditorDialogProps) {
  const [draft, setDraft] = useState<Task>(() => ({ ...task }));
  const [error, setError] = useState("");
  const editorOriginal = useRef<Task | null>(null);

  useEffect(() => {
    setDraft({ ...task });
    setError("");
    editorOriginal.current = loadTasks().entries.find(t => t.id === task.id) ?? null;
  }, [task.id]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const result = saveTaskDraft(draft, editorOriginal.current);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.next);
    onClose();
  }

  return (
    <EditorDialog
      title={isExisting ? "Görevi düzenle" : "Yeni görev"}
      description="Görev bilgilerini ve hatırlatmayı buradan düzenle."
      onClose={onClose}
      error={error}
    >
      <form
        className="task-editor"
        onSubmit={handleSubmit}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        aria-label="Görev düzenleyici"
      >
        <label className="archive-field">
          Görev
          <input
            autoFocus
            value={draft.text}
            onChange={event => setDraft({ ...draft, text: event.target.value })}
            maxLength={160}
            required
          />
        </label>
        <div className="archive-form-grid">
          <label className="archive-field">
            {draft.recurrence ? "Başlangıç günü" : "Tarih"}
            <input
              type="date"
              value={draft.dueDate ?? ""}
              onChange={event =>
                setDraft({
                  ...draft,
                  dueDate: event.target.value || null,
                  reminder: event.target.value ? draft.reminder : false,
                })
              }
            />
          </label>
          <label className="archive-field">
            Saat
            <input
              type="time"
              value={draft.dueTime ?? ""}
              onChange={event =>
                setDraft({
                  ...draft,
                  dueTime: event.target.value || null,
                  reminder: event.target.value ? draft.reminder : false,
                })
              }
            />
          </label>
        </div>
        <RecurrenceFields
          key={draft.id}
          value={draft.recurrence ?? null}
          date={draft.dueDate ?? ""}
          time={draft.dueTime ?? ""}
          onChange={recurrence =>
            setDraft({
              ...draft,
              recurrence,
              ...(recurrence
                ? {
                    dueDate: draft.dueDate || recurrence.start,
                    dueTime: draft.dueTime || recurrence.time,
                  }
                : {}),
            })
          }
        />
        <label className="reminder-toggle">
          <input
            type="checkbox"
            checked={draft.reminder ?? false}
            disabled={!draft.dueDate || !draft.dueTime}
            onChange={event => setDraft({ ...draft, reminder: event.target.checked })}
          />
          Hatırlatma
        </label>
        {draft.reminder && (
          <label className="archive-field">
            Ne zaman hatırlat?
            <select
              value={draft.reminderLeadMinutes ?? 0}
              onChange={e => setDraft({ ...draft, reminderLeadMinutes: Number(e.target.value) })}
            >
              <option value="0">Görev saatinde</option>
              <option value="15">15 dakika önce</option>
              <option value="60">1 saat önce</option>
              <option value="1440">1 gün önce</option>
              {draft.reminderLeadMinutes &&
                ![0, 15, 60, 1440].includes(draft.reminderLeadMinutes) && (
                  <option value={draft.reminderLeadMinutes}>
                    {draft.reminderLeadMinutes} dakika önce
                  </option>
                )}
            </select>
          </label>
        )}
        <p className="task-hint">
          Windows bildirimleri ACKDeck çalışırken gönderilir. Telefon eşitlemesi ve bildirimler açıksa, bulut hatırlatmaları bilgisayar kapalıyken de sürer.
        </p>
        <div className="settings-actions">
          <button className="button button-primary" type="submit" disabled={locked}>
            Kaydet
          </button>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Vazgeç
          </button>
        </div>
      </form>
    </EditorDialog>
  );
}
