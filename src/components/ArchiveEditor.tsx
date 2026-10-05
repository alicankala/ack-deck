import { useEffect, useRef, useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ARCHIVE_CATEGORIES, validArchiveDate, type ArchiveCategory, type ArchiveDraft, type ArchiveEntry } from "../archiveStore";
import type { FileMetadata } from "../fileStore";
import { ArchiveFileLink } from "./ArchiveFileLink";

export function ArchiveEditor({ entry, onSave, onCancel }: { entry: ArchiveEntry | null; onSave: (draft: ArchiveDraft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<ArchiveDraft>(() => ({ title: entry?.title ?? "", category: entry?.category ?? "Diğer", description: entry?.description ?? "", date: entry?.date ?? "", tagsText: entry?.tags.join(", ") ?? "", file: entry?.file ?? null }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function chooseFile() {
    setBusy(true);
    setError("");
    try {
      const path = await open({ directory: false, multiple: false, title: "Arşiv kaydına bağlanacak dosyayı seç" });
      if (typeof path !== "string" || !mounted.current) return;
      const metadata = await invoke<FileMetadata>("read_file_entry", { path, kind: "file" });
      if (mounted.current) setDraft((value) => ({ ...value, file: { path: metadata.path, fileName: metadata.fileName } }));
    } catch (error) {
      if (mounted.current) setError(error === "Dosya artık bu konumda bulunamıyor." ? "Dosya bulunamadı." : "Dosya seçilemedi veya bilgileri alınamadı.");
    } finally { if (mounted.current) setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) { setError("Kayıt için bir başlık yazın."); return; }
    if (draft.date && !validArchiveDate(draft.date)) { setError("Geçerli bir tarih seçin."); return; }
    onSave(draft);
  }

  return <form className="archive-editor surface" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); } }} aria-label="Arşiv kaydı düzenleyici">
    <h2>{entry ? "Kaydı düzenle" : "Yeni arşiv kaydı"}</h2>
    <div className="archive-form-grid">
      <label className="archive-field archive-field-wide">Başlık<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={160} required /></label>
      <label className="archive-field">Kategori<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ArchiveCategory })}>{ARCHIVE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="archive-field">Tarih <small>İsteğe bağlı</small><input type="date" value={draft.date} max="9999-12-31" onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
      <label className="archive-field archive-field-wide">Açıklama / not<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={4} maxLength={20000} /></label>
      </div><details className="advanced-fields"><summary>Etiket ve dosya</summary><label className="archive-field archive-field-wide">Etiketler <small>Virgülle ayırabilirsiniz</small><input value={draft.tagsText} onChange={(event) => setDraft({ ...draft, tagsText: event.target.value })} placeholder="laptop, garanti, önemli" maxLength={500} /></label>
    <div className="archive-file-picker"><span>İlişkili yerel dosya <small>İsteğe bağlı, tek dosya</small></span><button className="button button-secondary" type="button" onClick={chooseFile} disabled={busy}>{draft.file ? "Dosyayı Değiştir" : "Dosya Seç"}</button>{draft.file && <button className="button button-secondary" type="button" onClick={() => setDraft({ ...draft, file: null })} disabled={busy}>Bağlantıyı Kaldır</button>}</div>
    {draft.file && <ArchiveFileLink key={draft.file.path} file={draft.file} />}
    </details>{error && <div className="tool-feedback error" role="alert">{error}</div>}
    <div className="archive-editor-actions"><button className="button button-primary" type="submit" disabled={busy || !draft.title.trim()}>Kaydet</button><button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Vazgeç</button></div>
  </form>;
}
