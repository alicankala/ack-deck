import type { FormEvent, MutableRefObject, ReactNode } from "react";
import type { CloudRecord, Mutation } from "../../shared/phone";

export type MobileFormKind = "task" | "link" | "ai_prompt" | "text";

type MobileFormModalProps = {
  editorRef: MutableRefObject<HTMLElement | null>;
  form: MobileFormKind;
  editing: CloudRecord | null;
  busy: boolean;
  sending: boolean;
  error: string;
  title: string;
  setTitle: (value: string) => void;
  content: string;
  setContent: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  time: string;
  setTime: (value: string) => void;
  reminder: boolean;
  setReminder: (value: boolean) => void;
  reminderLead: number;
  setReminderLead: (value: number) => void;
  hasRecurrence: boolean;
  recurrenceSection: ReactNode;
  onResetFormRequestId: () => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onSaveMutation: (mutation: Mutation) => Promise<void>;
  onDeleted: (row: CloudRecord) => void;
  onError: (message: string) => void;
};

/** Bottom-sheet/modal editor for tasks, links, text drops, and ACK AI quick messages. */
export function MobileFormModal({
  editorRef,
  form,
  editing,
  busy,
  sending,
  error,
  title,
  setTitle,
  content,
  setContent,
  date,
  setDate,
  time,
  setTime,
  reminder,
  setReminder,
  reminderLead,
  setReminderLead,
  hasRecurrence,
  recurrenceSection,
  onResetFormRequestId,
  onSubmit,
  onClose,
  onSaveMutation,
  onDeleted,
  onError,
}: MobileFormModalProps) {
  return (
    <section
      ref={editorRef}
      className="editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div>
        <div className="editor-heading">
          <h2 id="editor-title">
            {form === "task"
              ? "Görev"
              : form === "link"
              ? "Link Gönder"
              : form === "ai_prompt"
              ? "ACK AI'a Mesaj Bırak"
              : "Metin Gönder"}
          </h2>
          <button type="button" aria-label="Düzenleyiciyi kapat" disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={onSubmit}>
          {form === "task" && (
            <label>
              Görev metni
              <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={2000} />
            </label>
          )}
          {form !== "task" && (
            <label>
              {form === "link" ? "Web adresi" : "İçerik"}
              <textarea
                disabled={busy || sending}
                value={content}
                onChange={e => {
                  setContent(e.target.value);
                  onResetFormRequestId();
                }}
                required
                maxLength={20000}
              />
            </label>
          )}
          {form === "task" && (
            <>
              <div className="editor-row">
                <label>
                  {hasRecurrence ? "Başlangıç günü" : "Tarih"}
                  <input
                    type="date"
                    value={date}
                    onChange={e => {
                      setDate(e.target.value);
                      if (!e.target.value) setReminder(false);
                    }}
                  />
                </label>
                <label>
                  Saat
                  <input
                    type="time"
                    value={time}
                    onChange={e => {
                      setTime(e.target.value);
                      if (!e.target.value) setReminder(false);
                    }}
                  />
                </label>
              </div>
              {recurrenceSection}
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={reminder}
                  disabled={!date || !time}
                  onChange={e => setReminder(e.target.checked)}
                />
                Hatırlat
              </label>
              {reminder && (
                <label>
                  Hatırlatma
                  <select value={reminderLead} onChange={e => setReminderLead(Number(e.target.value))}>
                    <option value="0">Görev saatinde</option>
                    <option value="15">15 dakika önce</option>
                    <option value="60">1 saat önce</option>
                    <option value="1440">1 gün önce</option>
                    {reminderLead && ![0, 15, 60, 1440].includes(reminderLead) && (
                      <option value={reminderLead}>{reminderLead} dakika önce</option>
                    )}
                  </select>
                </label>
              )}
            </>
          )}
          <div className="actions">
            <button disabled={busy}>{form === "task" ? "Kaydet" : "Gönder"}</button>
            <button type="button" disabled={busy} onClick={onClose}>
              İptal
            </button>
            {editing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm("Bu kayıt silinsin mi?")) {
                    void onSaveMutation({
                      mutationId: crypto.randomUUID(),
                      kind: editing.kind,
                      id: editing.id,
                      baseVersion: editing.version,
                      data: null,
                      deleted: true,
                    })
                      .then(() => onDeleted(editing))
                      .catch(e => onError(e.message));
                  }
                }}
              >
                Kaydı Sil
              </button>
            )}
          </div>
          {error && <p role="alert" className="error">{error}</p>}
        </form>
      </div>
    </section>
  );
}
