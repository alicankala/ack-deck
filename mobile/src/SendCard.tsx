import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type SendKind = "text" | "link" | "ai_prompt";
export function SendCard({ busy, recording, audio, onOpen, onFile, onRecord, onAudioSend, onAudioCancel }: { busy: boolean; recording: boolean; audio: Blob | null; onOpen: (kind: SendKind) => void; onFile: (file: File) => void; onRecord: () => void; onAudioSend: () => void; onAudioCancel: () => void }) {
  const [preview, setPreview] = useState("");
  useEffect(() => { if (!audio) { setPreview(""); return; } const url = URL.createObjectURL(audio); setPreview(url); return () => URL.revokeObjectURL(url); }, [audio]);
  return <section className="send-card" aria-labelledby="send-card-title"><div className="send-card-heading"><h2 id="send-card-title">Bilgisayarına gönder</h2><p>Ne göndermek istiyorsun?</p></div><div className="send-grid">
    <button type="button" disabled={busy} onClick={() => onOpen("text")}><span className="send-icon"><Icon name="note" /></span><strong>Metin</strong><small>Kısa bir mesaj</small></button>
    <button type="button" disabled={busy} onClick={() => onOpen("link")}><span className="send-icon"><Icon name="link" /></span><strong>Bağlantı</strong><small>Bir web adresi</small></button>
    <button type="button" disabled={busy} onClick={() => onOpen("ai_prompt")}><span className="send-icon"><Icon name="spark" /></span><strong>ACK AI</strong><small>Mesaj bırak</small></button>
    <label className={"send-file-tile " + (busy ? "disabled" : "")}><span className="send-icon"><Icon name="files" /></span><strong>Fotoğraf / Dosya</strong><small>Telefondan seç</small><input className="send-file-input" type="file" aria-label="Fotoğraf veya dosya gönder" accept="image/png,image/jpeg,image/webp,image/heic,application/pdf,audio/*,text/plain" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} /></label>
  </div><button type="button" className={"send-record-button " + (recording ? "recording" : "")} disabled={busy} onClick={onRecord}><Icon name="mic" /><span><strong>{recording ? "Kaydı durdur" : "Sesli not"}</strong><small>{recording ? "Kayıt sürüyor · En fazla 2 dakika" : "Kaydet, dinle ve gönder"}</small></span><span aria-hidden="true">{recording ? "■" : "›"}</span></button>
    {audio && <div className="send-audio-preview"><p>Sesli not hazır · {Math.ceil(audio.size / 1024)} KB</p>{preview && <audio controls src={preview} />}<div className="actions"><button type="button" className="primary-action" disabled={busy} onClick={onAudioSend}>Gönder</button><button type="button" disabled={busy} onClick={onAudioCancel}>Vazgeç</button></div></div>}
    <p className="send-card-hint">Dosyalar en fazla 10 MB olabilir ve 30 gün saklanır. Gönderilerin bilgisayarda kendiliğinden açılmaz.</p>
  </section>;
}
