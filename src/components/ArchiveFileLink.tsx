import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ArchiveFile } from "../archiveStore";
import type { FileStatus } from "../fileStore";
import { Icon } from "./Icon";

export function ArchiveFileLink({ file }: { file: ArchiveFile }) {
  const [status, setStatus] = useState<FileStatus["state"] | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const version = useRef(0);

  async function check() {
    const current = version.current;
    setBusy(true);
    try {
      const values = await invoke<FileStatus[]>("check_file_entries", { items: [{ path: file.path, kind: "file" }] });
      if (current === version.current) setStatus(values[0]?.state ?? "unknown");
    } catch { if (current === version.current) setStatus("unknown"); }
    finally { if (current === version.current) setBusy(false); }
  }

  useEffect(() => {
    version.current++;
    setStatus("unknown");
    setMessage("");
    void check();
    return () => { version.current++; };
  }, [file.path]);

  async function access(action: "open" | "reveal") {
    const current = version.current;
    setBusy(true);
    setMessage("");
    try {
      await invoke("access_file_entry", { path: file.path, kind: "file", action });
      if (current === version.current) setStatus("available");
    } catch (error) {
      if (current !== version.current) return;
      if (error === "Dosya artık bu konumda bulunamıyor.") { setStatus("missing"); setMessage("Dosya bulunamadı."); }
      else setMessage(action === "open" ? "Dosya açılamadı. Konumu ve varsayılan uygulamayı kontrol edin." : "Dosya Explorer'da gösterilemedi.");
    } finally { if (current === version.current) setBusy(false); }
  }

  async function copy() {
    const current = version.current;
    try { await navigator.clipboard.writeText(file.path); if (current === version.current) setMessage("Yol panoya kopyalandı."); }
    catch { if (current === version.current) setMessage("Yol kopyalanamadı."); }
  }

  return <section className="archive-file" aria-label="İlişkili yerel dosya">
    <div className="archive-file-heading"><Icon name="files" size={20} /><strong title={file.fileName}>{file.fileName}</strong><span className={"file-status " + status}>{busy ? "Kontrol ediliyor" : status === "missing" ? "Dosya bulunamadı" : status === "available" ? "Hazır" : status === "unavailable" ? "Erişilemiyor" : "Kontrol edilemedi"}</span></div>
    <details><summary>Tam yolu göster</summary><p className="archive-full-path">{file.path}</p></details>
    <div className="file-actions"><button type="button" onClick={() => access("open")} disabled={busy}>Aç</button><button type="button" onClick={() => access("reveal")} disabled={busy}>Explorer'da Göster</button><button type="button" onClick={copy}>Yolu Kopyala</button><button type="button" onClick={() => { setMessage(""); void check(); }} disabled={busy}>Durumu Yenile</button></div>
    {message && <p className="archive-file-message" role="status">{message}</p>}
  </section>;
}
