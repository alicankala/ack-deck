import { useState, type FormEvent } from "react";

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
  const [examType, setExamType] = useState<"Vize" | "Final" | "Büt" | "Quiz" | "Sınav">("Vize");
  const [course, setCourse] = useState("");
  const [date, setDate] = useState(() => initialDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [leadMinutes, setLeadMinutes] = useState(1440); // 1 day before
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    <div className="mobile-modal-overlay exam-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sınav Tarihi Ekle">
      <div className="surface exam-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="exam-modal-header">
          <div className="exam-modal-title">
            <span className="exam-title-icon" aria-hidden="true">🎓</span>
            <div>
              <h3>Sınav Tarihi Ekle</h3>
              <small>Takvime ve bildirimlere eklenir</small>
            </div>
          </div>
          <button type="button" className="mobile-modal-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {error && <p className="tool-feedback error" style={{ margin: "0.5rem 0" }}>{error}</p>}

        <form onSubmit={handleSubmit} className="exam-form">
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

          <label className="exam-field">
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

          <div className="exam-form-row">
            <label className="exam-field">
              <span>Sınav Tarihi *</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="exam-field">
              <span>Saat *</span>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>

          <div className="exam-form-row">
            <label className="exam-field">
              <span>Sınav Yeri / Derslik</span>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="örn. D204, Amfi 1"
                maxLength={60}
              />
            </label>
            <label className="exam-field">
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

          <label className="exam-field">
            <span>Notlar / Gereksinimler</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="örn. Formül kağıdı serbest, hesap makinesi..."
              maxLength={200}
            />
          </label>

          <div className="exam-form-actions">
            <button type="submit" disabled={busy} className="button button-primary">
              {busy ? "Kaydediliyor…" : `🎓 ${examType} Ekle`}
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="button button-secondary">
              Vazgeç
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
