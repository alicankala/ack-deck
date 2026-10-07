import { useEffect, useRef, useState } from "react";
import { validAttachments, type AttachmentReference } from "../../shared/productivity";
import type { MobileState } from "./store";
export function NoteAttachments({ files, state }: {
    files: AttachmentReference[];
    state: MobileState;
}) {
    const [preview, setPreview] = useState<{
        file: AttachmentReference;
        url: string;
    } | null>(null);
    const [error, setError] = useState(""), [busy, setBusy] = useState(false);
    const generation = useRef(0), controller = useRef<AbortController | null>(null);
    useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
    useEffect(() => () => { if (preview)
        URL.revokeObjectURL(preview.url); }, [preview]);
    async function open(file: AttachmentReference) {
        if (busy || !validAttachments([file]) || !state.token)
            return;
        setBusy(true);
        setError("");
        const requestId = ++generation.current;
        controller.current = new AbortController();
        const timeout = window.setTimeout(() => controller.current?.abort(), 20000);
        try {
            const response = await fetch(`/api/attachments/${encodeURIComponent(file.id)}`, { headers: { Authorization: `Bearer ${state.token}` }, cache: "no-store", signal: controller.current.signal });
            if (!response.ok)
                throw new Error(response.status === 410 ? "Dosyanın bulut saklama süresi dolmuş. Masaüstündeki kalıcı kopya korunur." : "Dosya açılamadı. Yeniden deneyebilirsin.");
            if (response.headers.get("content-type")?.split(";")[0] !== file.mime)
                throw new Error("Dosya türü doğrulanamadı.");
            const blob = await response.blob();
            if (blob.size !== file.size)
                throw new Error("Dosya boyutu doğrulanamadı.");
            if (generation.current === requestId)
                setPreview({ file, url: URL.createObjectURL(blob) });
        }
        catch (reason) {
            if (generation.current === requestId)
                setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Dosyaya ulaşılamadı. İnternet bağlantısını kontrol et.");
        }
        finally {
            clearTimeout(timeout);
            if (generation.current === requestId)
                setBusy(false);
        }
    }
    if (!files.length)
        return null;
    return <section className="mobile-note-attachments" aria-label="Notun ekleri"><strong>Ekler</strong>{files.map(file => <button key={file.id} type="button" disabled={busy} onClick={() => void open(file)}>{file.name} · {Math.ceil(file.size / 1024)} KB</button>)}{error && <p className="error" role="alert">{error}</p>}{preview && <div>{preview.file.mime.startsWith("audio/") ? <audio controls preload="metadata" src={preview.url}/> : preview.file.mime.startsWith("image/") ? <img src={preview.url} alt={preview.file.name}/> : <a href={preview.url} target="_blank" rel="noopener noreferrer">Dosyayı aç</a>}<button type="button" onClick={() => setPreview(null)}>Önizlemeyi kapat</button></div>}</section>;
}
