import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { loadFiles, saveFiles, type FileEntry, type FileKind, type FileMetadata, type FileStatus } from "../fileStore";
import { Icon } from "./Icon";
import { recordRecent } from "../recentStore";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const safeErrors = new Set([
  "Dosya artık bu konumda bulunamıyor.", "Klasör bulunamadı.", "Klasör açılamadı.",
  "Bu konuma erişilemiyor veya öğenin türü değişmiş.", "Dosya bilgileri alınamadı.",
  "Dosya açılamadı. Varsayılan uygulamayı kontrol edin.", "Dosya Explorer'da gösterilemedi.", "Dosya işlemi tamamlanamadı.",
]);
const pathKey = (path: string) => path.replace(/[\\/]+$/, "").toLocaleLowerCase("en-US");

function sizeLabel(size: number) {
  if (size < 1024) return size + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " " + units[index];
}

export function Files({ initialId }: { initialId?: string }) {
  const [initial] = useState(loadFiles);
  const [entries, setEntries] = useState(initial.entries);
  useEffect(() => { if (initialId) document.getElementById("file-" + initialId)?.scrollIntoView({ block: "center" }); }, [initialId]);
  const entriesRef = useRef(entries);
  const [statuses, setStatuses] = useState<Record<string, FileStatus["state"]>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(initial.error ? { text: initial.error, error: true } : null);
  const [editor, setEditor] = useState<{ id: string; name: string } | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const locked = !!initial.error;
  const search = query.trim().toLocaleLowerCase("tr-TR");
  const visible = entries.filter((entry) => (entry.name + " " + entry.fileName + " " + entry.path).toLocaleLowerCase("tr-TR").includes(search));

  function commit(next: FileEntry[]) {
    if (locked) return false;
    if (!saveFiles(next)) {
      setFeedback({ text: "Dosya listesi kaydedilemedi. Depolama alanını kontrol edin.", error: true });
      return false;
    }
    entriesRef.current = next;
    setEntries(next);
    return true;
  }

  async function refresh() {
    const currentRequest = ++request.current;
    const items = entriesRef.current.map(({ path, kind }) => ({ path, kind }));
    if (!items.length || locked) return;
    setChecking(true);
    try {
      const result = await invoke<FileStatus[]>("check_file_entries", { items });
      if (!mounted.current || request.current !== currentRequest) return;
      setStatuses(Object.fromEntries(result.map((item) => [item.path, item.state])));
      const byPath = new Map(result.map((item) => [item.path, item.metadata]));
      const next = entriesRef.current.map((entry) => {
        const metadata = byPath.get(entry.path);
        return metadata && metadata.kind === entry.kind ? { ...entry, ...metadata } : entry;
      });
      if (JSON.stringify(next) !== JSON.stringify(entriesRef.current)) commit(next);
    } catch {
      if (mounted.current && request.current === currentRequest) {
        setStatuses({});
        setFeedback({ text: "Dosya durumları kontrol edilemedi. Yenile ile tekrar deneyin.", error: true });
      }
    } finally {
      if (mounted.current && request.current === currentRequest) setChecking(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; request.current++; };
  }, []);

  async function add(kind: FileKind) {
    if (busy || locked) return;
    setBusy(true);
    setFeedback(null);
    try {
      const path = await open({ directory: kind === "folder", multiple: false, title: kind === "folder" ? "Kısayol eklenecek klasörü seç" : "Kısayol eklenecek dosyayı seç" });
      if (typeof path !== "string" || !mounted.current) return;
      if (entriesRef.current.some((entry) => pathKey(entry.path) === pathKey(path))) {
        setFeedback({ text: "Bu konum zaten listede.", error: false });
        return;
      }
      const metadata = await invoke<FileMetadata>("read_file_entry", { path, kind });
      if (!mounted.current) return;
      if (commit([...entriesRef.current, { ...metadata, id: crypto.randomUUID(), name: metadata.fileName }])) {
        setStatuses((current) => ({ ...current, [path]: "available" }));
        setFeedback({ text: kind === "folder" ? "Klasör listeye eklendi." : "Dosya listeye eklendi.", error: false });
      }
    } catch (error) {
      if (mounted.current) setFeedback({ text: typeof error === "string" && safeErrors.has(error) ? error : "Öğe eklenemedi. Seçme penceresini ve konumu kontrol edin.", error: true });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function access(entry: FileEntry, action: "open" | "reveal") {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await invoke("access_file_entry", { path: entry.path, kind: entry.kind, action });
      if (action === "open") recordRecent("files", entry.id);
      if (mounted.current) setStatuses((current) => ({ ...current, [entry.path]: "available" }));
    } catch (error) {
      if (!mounted.current) return;
      const text = typeof error === "string" && safeErrors.has(error) ? error : "Öğe açılamadı. Konumu ve varsayılan uygulamayı kontrol edin.";
      setFeedback({ text, error: true });
      if (text === "Dosya artık bu konumda bulunamıyor." || text === "Klasör bulunamadı.") {
        setStatuses((current) => ({ ...current, [entry.path]: "missing" }));
      } else if (text === "Bu konuma erişilemiyor veya öğenin türü değişmiş.") {
        setStatuses((current) => ({ ...current, [entry.path]: "unavailable" }));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function copyPath(entry: FileEntry) {
    try {
      await navigator.clipboard.writeText(entry.path);
      if (mounted.current) setFeedback({ text: "Yol panoya kopyalandı.", error: false });
    } catch {
      if (mounted.current) setFeedback({ text: "Yol kopyalanamadı. Yukarıdaki yolu elle kopyalayabilirsiniz.", error: true });
    }
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor?.name.trim()) return;
    if (commit(entriesRef.current.map((entry) => entry.id === editor.id ? { ...entry, name: editor.name.trim() } : entry))) {
      setEditor(null);
      setFeedback({ text: "ACKDeck içindeki görünen ad güncellendi.", error: false });
    }
  }

  function remove(id: string) {
    if (commit(entriesRef.current.filter((entry) => entry.id !== id))) {
      setRemoveId(null);
      if (editor?.id === id) setEditor(null);
      setFeedback({ text: "Öğe ACKDeck listesinden kaldırıldı. Bilgisayarındaki dosya veya klasör korunuyor.", error: false });
    }
  }

  return <div className="files-page">
    <header className="feature-heading"><span className="eyebrow">HIZLI ARAÇLAR</span><h1>Dosyalar</h1><p>Sık kullandığın dosya ve klasörlere buradan hızlıca eriş.</p></header>
    <div className="files-toolbar">
      <div className="files-add-actions"><button className="button button-primary" type="button" onClick={() => add("file")} disabled={busy || checking || locked}><Icon name="plus" size={16} />Dosya Ekle</button><button className="button button-secondary" type="button" onClick={() => add("folder")} disabled={busy || checking || locked}><Icon name="folder" size={16} />Klasör Ekle</button></div>
      <button className="button button-secondary" type="button" onClick={() => { setFeedback(null); void refresh(); }} disabled={busy || checking || locked || !entries.length}>{checking ? "Kontrol ediliyor..." : "Yenile"}</button>
    </div>
    <p className="files-local-note">Burada yalnızca kısayollar saklanır. Listeden kaldırmak gerçek dosya veya klasörü silmez.</p>
    {feedback && <div className={"tool-feedback " + (feedback.error ? "error" : "success")} role={feedback.error ? "alert" : "status"}>{feedback.text}</div>}
    <div className="files-search-row"><label className="sr-only" htmlFor="files-search">Ad veya yola göre ara</label><input id="files-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, dosya adı veya yola göre ara..." /><span>{visible.length} / {entries.length} öğe</span></div>
    <div className="files-list" aria-busy={checking}>
      {visible.map((entry) => {
        const state = statuses[entry.path];
        return <article id={"file-" + entry.id} className={"file-card surface " + (initialId === entry.id ? "record-highlight" : "")} key={entry.id}>
          <div className="file-card-top"><span className="feature-icon"><Icon name={entry.kind === "folder" ? "folder" : "files"} size={22} /></span><div className="file-info"><h2 title={entry.name}>{entry.name}</h2><span className="file-path" title={entry.path}>{entry.path}</span></div><span className={"file-status " + (state || "unknown")}>{checking ? "Kontrol ediliyor" : state === "missing" ? "Bulunamadı" : state === "unavailable" ? "Erişilemiyor" : state === "available" ? "Hazır" : "Kontrol edilemedi"}</span></div>
          <div className="file-metadata"><span>{entry.kind === "folder" ? "Klasör" : entry.extension ? entry.extension.toLocaleUpperCase("tr-TR") + " dosyası" : "Dosya"}</span>{entry.sizeBytes !== null && <span>{sizeLabel(entry.sizeBytes)}</span>}<span>Son değiştirme: {entry.modifiedAt !== null ? dateFormatter.format(entry.modifiedAt) : "Alınamadı"}</span></div>
          <div className="file-actions"><button type="button" onClick={() => access(entry, "open")} disabled={busy}>Aç</button><button type="button" onClick={() => access(entry, "reveal")} disabled={busy}>Explorer'da Göster</button><button type="button" onClick={() => copyPath(entry)}>Yolu Kopyala</button><button type="button" onClick={() => { setEditor({ id: entry.id, name: entry.name }); setRemoveId(null); }} disabled={locked || busy}>Adı Düzenle</button><button className="file-remove" type="button" onClick={() => { setRemoveId(entry.id); setEditor(null); }} disabled={locked || busy}>Listeden Kaldır</button></div>
          {editor?.id === entry.id && <form className="file-name-editor" onSubmit={rename}><label htmlFor={"file-name-" + entry.id}>ACKDeck'te görünen ad</label><input id={"file-name-" + entry.id} autoFocus value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} maxLength={160} required /><div><button className="button button-primary" type="submit" disabled={!editor.name.trim()}>Kaydet</button><button className="button button-secondary" type="button" onClick={() => setEditor(null)}>Vazgeç</button></div></form>}
          {removeId === entry.id && <div className="file-remove-confirm" role="group" aria-label="Listeden kaldırma onayı"><span>Yalnızca ACKDeck kısayolu kaldırılsın mı?</span><button type="button" onClick={() => remove(entry.id)}>Evet, kaldır</button><button type="button" onClick={() => setRemoveId(null)}>Vazgeç</button></div>}
        </article>;
      })}
      {!visible.length && <div className="files-empty surface"><Icon name="files" size={30} /><h2>{search ? "Eşleşen öğe bulunamadı" : "Henüz dosya veya klasör eklenmedi"}</h2><p>{search ? "Farklı bir ad veya yol deneyin." : "Dosya Ekle veya Klasör Ekle ile ilk kısayolunu oluştur."}</p></div>}
    </div>
  </div>;
}
