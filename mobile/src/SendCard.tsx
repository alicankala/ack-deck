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
  onSendText,
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
  onOpen?: (kind: SendKind) => void;
  onSendText?: (kind: SendKind, text: string) => Promise<boolean>;
  onSelectFile: (file: File | null) => void;
  onFile: (file: File) => Promise<boolean>;
  onRecord: () => void;
  onAudioSend: () => void;
  onAudioCancel: () => void;
}) {
  const [kind, setKind] = useState<Choice | null>(() => (audio ? "audio" : file ? "file" : null));
  const [preview, setPreview] = useState("");
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    if (!audio) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  const options: [Choice, string, "note" | "link" | "files" | "mic" | "spark", string][] = [
    ["text", "Metin Notu", "note", "send-opt-text"],
    ["link", "Web Bağlantısı", "link", "send-opt-link"],
    ["file", "Fotoğraf / Dosya", "files", "send-opt-file"],
    ["audio", "Sesli Not", "mic", "send-opt-audio"],
    ["ai_prompt", "ACK AI ile Otomatik İşle", "spark", "send-opt-ai"],
  ];

  const inlineKind: SendKind | null =
    kind === "text" || kind === "link" || kind === "ai_prompt" ? kind : null;

  return (
    <section className="send-card" aria-label="PC'ye Gönder">
      {feedback && (
        <p className="send-success" role="status">
          ✓ {feedback}
        </p>
      )}

      <div className="send-grid">
        {options.map(([value, label, icon, extraClass]) => {
          const isSelected = kind === value;
          return (
            <button
              key={value}
              className={`send-tile-btn ${extraClass} ${isSelected ? "selected" : ""}`}
              type="button"
              aria-pressed={isSelected}
              disabled={busy || recording}
              onClick={() => {
                if (isSelected) {
                  setKind(null);
                  setDraftText("");
                } else {
                  setKind(value);
                }
              }}
            >
              <div className="send-icon-wrap">
                <span className="send-icon">
                  <Icon name={icon} size={20} />
                </span>
              </div>
              <div className="send-tile-info">
                <strong>{label}</strong>
              </div>
              {value === "ai_prompt" && <span className="send-ai-badge">🤖 Otomatik</span>}
            </button>
          );
        })}
      </div>

      {inlineKind && (
        <div
          className="send-inline-panel"
          style={{
            marginTop: "0.75rem",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--app-border, rgba(255, 255, 255, 0.08))",
            borderRadius: "10px",
            padding: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--app-text, #fff)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Icon
                name={inlineKind === "text" ? "note" : inlineKind === "link" ? "link" : "spark"}
                size={16}
              />
              {inlineKind === "text"
                ? "Metin Notu İlet"
                : inlineKind === "link"
                ? "Web Bağlantısı İlet"
                : "ACK AI ile Otomatik İşlem"}
            </span>
            {inlineKind === "ai_prompt" && (
              <span className="send-ai-badge" style={{ margin: 0 }}>
                🤖 Otomatik
              </span>
            )}
          </div>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className="mobile-textarea"
            rows={inlineKind === "link" ? 2 : 3}
            placeholder={
              inlineKind === "link"
                ? "https://... web bağlantısını yapıştır veya yaz"
                : inlineKind === "ai_prompt"
                ? "ACK AI'ın bilgisayarında yanıtlamasını veya işlemesini istediğin görevi yaz…"
                : "Bilgisayarına iletmek istediğin notu veya metni yaz…"
            }
            style={{
              width: "100%",
              borderRadius: "8px",
              padding: "8px 10px",
              fontSize: "16px",
              boxSizing: "border-box",
              background: "rgba(0, 0, 0, 0.25)",
              color: "#fff",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: "1.4",
            }}
            autoComplete="off"
          />
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
            <button
              type="button"
              className="mobile-button-secondary"
              style={{ padding: "0.38rem 0.85rem", fontSize: "0.82rem" }}
              disabled={busy}
              onClick={() => {
                setKind(null);
                setDraftText("");
              }}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className="mobile-button-primary"
              style={{ padding: "0.38rem 1rem", fontSize: "0.82rem" }}
              disabled={busy || !draftText.trim()}
              onClick={async () => {
                const text = draftText.trim();
                if (!text) return;
                if (onSendText) {
                  const ok = await onSendText(inlineKind, text);
                  if (ok) {
                    setDraftText("");
                    setKind(null);
                  }
                } else if (onOpen) {
                  onOpen(inlineKind);
                }
              }}
            >
              {busy ? "Gönderiliyor…" : "Bilgisayara Gönder"}
            </button>
          </div>
        </div>
      )}

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
              onChange={(event) => {
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
                    void onFile(file).then((ok) => {
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
                  onLoadedMetadata={(event) => prepareAudioDuration(event.currentTarget)}
                  onDurationChange={(event) => restoreAudioStart(event.currentTarget)}
                  onSeeked={(event) => restoreAudioStart(event.currentTarget)}
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
        Maks. 10 MB dosya boyutu · 30 gün saklama süresi
      </p>
    </section>
  );
}
