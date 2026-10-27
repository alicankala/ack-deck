import { useState, useRef, useEffect, type FormEvent } from "react";

export function ExamDialog({
  open,
  initialDate,
  onClose,
  onSave,
}: {
  open: boolean;
  initialDate?: string;
  onClose: () => void;
  onSave: (exam: {
    type: string;
    course: string;
    date: string;
    time: string;
    room: string;
    notes: string;
    leadMinutes: number;
  }) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [examType, setExamType] = useState<"Vize" | "Final" | "Büt" | "Quiz" | "Sınav">("Vize");
  const [course, setCourse] = useState("");
  const [date, setDate] = useState(() => initialDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [leadMinutes, setLeadMinutes] = useState(1440); // 1 day before
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      const el = dialog.current;
      el?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!course.trim()) {
      setError("Lütfen ders adını girin.");
      return;
    }
    if (!date) {
      setError("Lütfen sınav tarihini seçin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        type: examType,
        course: course.trim(),
        date,
        time,
        room: room.trim(),
        notes: notes.trim(),
        leadMinutes,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sınav kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="study-dialog exam-dialog-modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="study-dialog-heading">
        <div>
          <h2>🎓 Sınav Tarihi Ekle</h2>
          <p>Takvime ve bildirimlere eklenir; sınav günlerinde mor rozetle öne çıkar.</p>
        </div>
        <button type="button" aria-label="Kapat" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="study-modal-body">
        {error && <p className="planner-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="exam-type-selector">
            {(["Vize", "Final", "Büt", "Quiz", "Sınav"] as const).map((t) => (
              <button
                type="button"
                key={t}
                className={`exam-type-pill ${examType === t ? "is-active" : ""}`}
                onClick={() => setExamType(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <fieldset className="study-fields">
            <label>
              <span>Ders Adı *</span>
              <input
                type="text"
                required
                autoFocus
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="örn. Matematik 1, Algoritmalar, Fizik..."
                maxLength={120}
              />
            </label>

            <div className="study-date-fields">
              <label>
                <span>Sınav Tarihi *</span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                <span>Saat *</span>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>

            <div className="study-time-fields">
              <label>
                <span>Sınav Salonu / Konum</span>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="örn. D204, Amfi 1"
                  maxLength={60}
                />
              </label>
              <label>
                <span>Hatırlatma</span>
                <select
                  value={leadMinutes}
                  onChange={(e) => setLeadMinutes(Number(e.target.value))}
                >
                  <option value={1440}>1 gün önce</option>
                  <option value={120}>2 saat önce</option>
                  <option value={60}>1 saat önce</option>
                  <option value={15}>15 dakika önce</option>
                  <option value={0}>Sınav anında</option>
                </select>
              </label>
            </div>

            <label>
              <span>Notlar / Gereksinimler</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="örn. Formül kağıdı serbest, hesap makinesi..."
                maxLength={200}
              />
            </label>
          </fieldset>

          <footer className="study-dialog-actions">
            <button type="button" disabled={busy} onClick={onClose} className="planner-secondary">
              Vazgeç
            </button>
            <button type="submit" disabled={busy} className="planner-primary">
              {busy ? "Kaydediliyor…" : `🎓 ${examType} Ekle`}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
