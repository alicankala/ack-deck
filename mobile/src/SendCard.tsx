import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { prepareAudioDuration, restoreAudioStart } from "../../shared/audio";

type SendKind = "text" | "link" | "ai_prompt";
type Choice = SendKind | "file" | "audio";

export function SendCard({
  busy,
  recording,
  audio,
  file,
  feedback,
  onOpen,
  onSelectFile,
  onFile,
  onRecord,
  onAudioSend,
  onAudioCancel,
}: {
  busy: boolean;
  recording: boolean;
  audio: Blob | null;
  file: File | null;
  feedback: string;
  onOpen: (kind: SendKind) => void;
  onSelectFile: (file: File | null) => void;
  onFile: (file: File) => Promise<boolean>;
  onRecord: () => void;
  onAudioSend: () => void;
  onAudioCancel: () => void;
}) {
  const [kind, setKind] = useState<Choice | null>(() => (audio ? "audio" : file ? "file" : null));
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!audio) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  const options: [Choice, string, string, "note" | "link" | "files" | "mic" | "spark", string][] = [
    ["text", "Metin Notu", "Kısa veya uzun not bırak", "note", "send-opt-text"],
    ["link", "Web Bağlantısı", "Link veya makale kaydet", "link", "send-opt-link"],
    ["file", "Fotoğraf / Dosya", "Galeriden veya cihazdan seç", "files", "send-opt-file"],
    ["audio", "Sesli Not", "Kaydet, dinle ve ilet", "mic", "send-opt-audio"],
    ["ai_prompt", "ACK AI ile Otomatik İşle", "PC açıldığında arka planda otomatik analiz edip yanıtlasın", "spark", "send-opt-ai"],
  ];

  return (
    <section className="send-card" aria-labelledby="send-card-title">
      <div className="send-card-heading">
        <h2 id="send-card-title">Bilgisayarına Gönder</h2>
        <p>İçerik türünü seç; metin, link, ses veya dosyanı bilgisayarına anında ilet.</p>
      </div>

      {feedback && (
        <p className="send-success" role="status">
          ✓ {feedback}
        </p>
      )}

      <div className="send-grid">
        {options.map(([value, label, hint, icon, extraClass]) => (
          <button
            key={value}
            className={`send-tile-btn ${extraClass} ${kind === value ? "selected" : ""}`}
            type="button"
            aria-pressed={kind === value}
            disabled={busy || recording}
            onClick={() => {
              setKind(value);
              if (value !== "file" && value !== "audio") onOpen(value as SendKind);
            }}
          >
            <div className="send-icon-wrap">
              <span className="send-icon">
                <Icon name={icon} size={22} />
              </span>
            </div>
            <div className="send-tile-info">
              <strong>{label}</strong>
              <small>{hint}</small>
            </div>
            {value === "ai_prompt" && <span className="send-ai-badge">🤖 Otomatik</span>}
          </button>
        ))}
      </div>

      {kind === "file" && (
        <div className="send-file-panel">
          <label className="send-file-dropzone">
            <Icon name="files" size={28} />
            <span>Fotoğraf veya Dosya Seç</span>
            <small>PNG, JPG, PDF, TXT vb. (maks. 10 MB)</small>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,application/pdf,audio/mp4,audio/mpeg,audio/ogg,audio/webm,audio/wav,text/plain"
              disabled={busy}
              onChange={event => {
                onSelectFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          {file && (
            <div className="send-file-selected-box">
              <p className="send-file-name">
                <Icon name="files" size={18} />
                <strong>{file.name}</strong>
                <span>{Math.ceil(file.size / 1024)} KB</span>
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="primary-action"
                  disabled={busy}
                  onClick={() =>
                    void onFile(file).then(ok => {
                      if (ok) onSelectFile(null);
                    })
                  }
                >
                  {busy ? "Gönderiliyor…" : "Dosyayı gönder"}
                </button>
                <button type="button" disabled={busy} onClick={() => onSelectFile(null)}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {kind === "audio" && (
        <div className="send-audio-panel">
          {!audio && (
            <button
              type="button"
              className={"send-record-button " + (recording ? "recording" : "")}
              disabled={busy}
              onClick={onRecord}
            >
              <span className="record-mic-badge">
                <Icon name="mic" size={22} />
              </span>
              <span className="record-text-block">
                <strong>{recording ? "Kaydı durdur" : "Kaydı başlat"}</strong>
                <small>{recording ? "Kayıt sürüyor · En fazla 2 dakika" : "Göndermeden önce dinleyebilirsin"}</small>
              </span>
              <span className="record-indicator" aria-hidden="true">
                {recording ? "■" : "●"}
              </span>
            </button>
          )}
          {audio && (
            <div className="send-audio-preview">
              <div className="audio-preview-head">
                <strong>Sesli not hazır</strong>
                <span>{Math.ceil(audio.size / 1024)} KB</span>
              </div>
              {preview && (
                <audio
                  controls
                  preload="metadata"
                  src={preview}
                  onLoadedMetadata={event => prepareAudioDuration(event.currentTarget)}
                  onDurationChange={event => restoreAudioStart(event.currentTarget)}
                  onSeeked={event => restoreAudioStart(event.currentTarget)}
                />
              )}
              <div className="actions">
                <button type="button" className="primary-action" disabled={busy} onClick={onAudioSend}>
                  {busy ? "Gönderiliyor…" : "Sesli notu gönder"}
                </button>
                <button type="button" disabled={busy} onClick={onAudioCancel}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="send-card-hint">
        En fazla 10 MB · Bulutta 30 gün güvenle saklanır. Bilgisayarını açtığında doğrudan karşına gelir.
      </p>
    </section>
  );
}
