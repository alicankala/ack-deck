import { useEffect, useRef, useState } from "react";
import { cachePhoneFile, readPhoneFile } from "../phoneClient";
import type { NoteAttachment } from "../notesStore";
import { prepareAudioDuration, restoreAudioStart } from "../../shared/audio";

export function PhoneMedia({ file, cached = false }: { file: NoteAttachment; cached?: boolean }) {
  const [url, setUrl] = useState(""), [text, setText] = useState(""), [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let active = true, objectUrl = "";
    setUrl(""); setText(""); setError("");
    void (async () => {
      if (!cached) await cachePhoneFile(file.id, file.name);
      const saved = await readPhoneFile(file.id).catch(async()=>{ await cachePhoneFile(file.id,file.name); return readPhoneFile(file.id); });
      const bytes = Uint8Array.from(atob(saved.base64), char => char.charCodeAt(0));
      if (!active) return;
      if (saved.mime === "text/plain") setText(new TextDecoder().decode(bytes));
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: saved.mime }));
      setUrl(objectUrl);
    })().catch(reason => { if (active) setError(typeof reason === "string" ? reason : "Dosya açılamadı. Tekrar deneyebilirsiniz."); });
    return () => { active = false; audio.current?.pause(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, file.name, cached]);
  return <div className="phone-media">{error ? <p role="alert" className="feedback error">{error}</p> : !url ? <p role="status">Dosya hazırlanıyor…</p> : file.mime.startsWith("audio/") ? <>
    <audio ref={audio} controls preload="metadata" src={url} aria-label={file.name} onLoadedMetadata={event=>prepareAudioDuration(event.currentTarget)} onDurationChange={event=>restoreAudioStart(event.currentTarget)} onSeeked={event=>restoreAudioStart(event.currentTarget)} onError={()=>setError("Bu ses biçimi bu cihazda oynatılamadı. Dosyayı bilgisayara kaydedip açabilirsiniz.")} />
    <button className="button button-secondary" type="button" onClick={() => { if (audio.current) { audio.current.currentTime = 0; void audio.current.play().catch(() => setError("Bu ses biçimi oynatılamadı. Dosyayı kaydedip dinleyebilirsiniz.")); } }}>Baştan dinle</button>
  </> : file.mime === "image/heic" ? <p>HEIC önizlemesi bu cihazda desteklenmeyebilir. Dosyayı kaydedip açabilirsiniz.</p> : file.mime.startsWith("image/") ? <img src={url} alt={file.name} /> : file.mime === "application/pdf" ? <iframe src={url} title={file.name} /> : <pre>{text}</pre>}</div>;
}
