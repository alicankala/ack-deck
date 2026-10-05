import { offerUndo } from "../recordUndo";
import { useEffect, useRef, useState } from "react";
import { ARCHIVE_CATEGORIES, archiveDateLabel, filterArchive, loadArchive, makeArchiveEntry, saveArchive, type ArchiveCategory, type ArchiveDraft, type ArchiveEntry } from "../archiveStore";
import { ArchiveEditor } from "./ArchiveEditor";
import { ArchiveFileLink } from "./ArchiveFileLink";
import { Icon } from "./Icon";
import { recordRecent } from "../recentStore";

const timeFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Archive({ initialId, createNew = false }: { initialId?: string; createNew?: boolean }) {
  const [initial] = useState(loadArchive);
  const [entries, setEntries] = useState(initial.entries);
  const entriesRef = useRef(entries);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ArchiveCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [editor, setEditor] = useState<{ entry: ArchiveEntry | null } | null>(createNew ? { entry: null } : null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { const refresh = () => { const loaded = loadArchive(); if (!loaded.locked) { entriesRef.current = loaded.entries; setEntries(loaded.entries); } }; window.addEventListener("ack-data-changed", refresh); return () => window.removeEventListener("ack-data-changed", refresh); }, []);
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const visible = filterArchive(entries, query, category);
  useEffect(() => { if (selected) recordRecent("archive", selected.id); }, [selectedId]);

  useEffect(() => {
    if (editor || selectedId) panel.current?.scrollIntoView({ block: "nearest" });
  }, [editor, selectedId, deleteId]);

  function commit(next: ArchiveEntry[]) {
    if (!saveArchive(next, initial)) {
      setFeedback({ text: "Arşiv kaydedilemedi. Mevcut kayıtlar korunuyor; depolama alanını kontrol edin.", error: true });
      return false;
    }
    entriesRef.current = next;
    setEntries(next);
    return true;
  }

  function save(draft: ArchiveDraft) {
    const previous = editor?.entry ? entriesRef.current.find((entry) => entry.id === editor.entry?.id) : undefined;
    const entry = makeArchiveEntry(draft, previous);
    const next = previous ? entriesRef.current.map((item) => item.id === entry.id ? entry : item) : [...entriesRef.current, entry];
    if (commit(next)) {
      setEditor(null);
      setSelectedId(entry.id);
      setDeleteId(null);
      setFeedback({ text: previous ? "Arşiv kaydı güncellendi." : "Arşiv kaydı eklendi.", error: false });
    }
  }

  function remove(id: string) {
    const removed = entriesRef.current.find(entry => entry.id === id);
    if (commit(entriesRef.current.filter((entry) => entry.id !== id))) {
      if (removed) offerUndo({ source: "archive", record: removed });
      setDeleteId(null);
      setSelectedId(null);
      setFeedback({ text: "Arşiv kaydı silindi. İlişkili dosya bilgisayarında korunuyor.", error: false });
    }
  }

  function view(entry: ArchiveEntry, confirmDelete = false) {
    setSelectedId(entry.id);
    setDeleteId(confirmDelete ? entry.id : null);
    setFeedback(null);
  }

  return <div className="archive-page">
    <header className="feature-heading archive-heading"><div><h1>Arşiv</h1><p>Önemli kayıtlarını açıklama, kategori ve tarihle düzenle.</p></div><button className="button button-primary" type="button" onClick={() => { setEditor({ entry: null }); setDeleteId(null); setFeedback(null); }} disabled={initial.locked || !!editor}><Icon name="plus" size={17} />Yeni Kayıt</button></header>
    {initial.warning && <div className="tool-feedback error" role="alert">{initial.warning}</div>}
    {feedback && <div className={"tool-feedback " + (feedback.error ? "error" : "success")} role={feedback.error ? "alert" : "status"}>{feedback.text}</div>}
    <div className="archive-filters"><label className="sr-only" htmlFor="archive-search">Arşivde ara</label><input id="archive-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Başlık, açıklama, etiket veya kategori ara..." /><label className="sr-only" htmlFor="archive-category-filter">Kategori filtresi</label><select id="archive-category-filter" value={category} onChange={(event) => setCategory(event.target.value as ArchiveCategory | "all")}><option value="all">Tüm kategoriler</option>{ARCHIVE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select><span>{visible.length} / {entries.length} kayıt</span></div>
    <div ref={panel} className="archive-panel">
      {editor ? <ArchiveEditor key={editor.entry?.id ?? "new"} entry={editor.entry} onSave={save} onCancel={() => setEditor(null)} /> : selected && <section className="archive-detail surface" aria-label="Arşiv kaydı ayrıntıları">
        <div className="archive-detail-heading"><div><span className="archive-category">{selected.category}</span><h2>{selected.title}</h2></div><button className="button button-secondary" type="button" onClick={() => { setSelectedId(null); setDeleteId(null); }}>Kapat</button></div>
        <p className="archive-detail-date">{archiveDateLabel(selected.date)}</p>
        <div className="archive-tags">{selected.tags.map((tag, index) => <span key={index}>{tag}</span>)}</div>
        <p className="archive-description">{selected.description || "Açıklama eklenmedi."}</p>
        {selected.file ? <ArchiveFileLink key={selected.file.path} file={selected.file} /> : <p className="archive-no-file">İlişkili dosya eklenmedi.</p>}
        <div className="archive-timestamps"><span>Oluşturulma: <time dateTime={new Date(selected.createdAt).toISOString()}>{timeFormatter.format(selected.createdAt)}</time></span><span>Son güncelleme: <time dateTime={new Date(selected.updatedAt).toISOString()}>{timeFormatter.format(selected.updatedAt)}</time></span></div>
        <div className="archive-detail-actions"><button className="button button-secondary" type="button" onClick={() => { setEditor({ entry: selected }); setDeleteId(null); }} disabled={initial.locked}>Düzenle</button><button className="button button-secondary archive-delete" type="button" onClick={() => setDeleteId(selected.id)} disabled={initial.locked}>Kaydı Sil</button></div>
        {deleteId === selected.id && <div className="file-remove-confirm" role="group" aria-label="Arşiv kaydını silme onayı"><span>Bu arşiv kaydı silinsin mi? İlişkili dosya silinmez.</span><button type="button" onClick={() => remove(selected.id)}>Evet, sil</button><button type="button" onClick={() => setDeleteId(null)}>Vazgeç</button></div>}
      </section>}
    </div>
    <div className="archive-grid">{visible.map((entry) => <article className="archive-card surface" key={entry.id}>
      <div className="archive-card-heading"><span className="archive-category">{entry.category}</span>{entry.file && <span className="archive-file-indicator" title={entry.file.fileName}><Icon name="files" size={14} />Dosya bağlı</span>}</div>
      <h2 title={entry.title}>{entry.title}</h2><p className="archive-card-description">{entry.description || "Açıklama eklenmedi."}</p><p className="archive-card-date">{archiveDateLabel(entry.date)}</p>
      <div className="archive-tags">{entry.tags.map((tag, index) => <span key={index}>{tag}</span>)}</div>
      <div className="archive-card-actions"><button type="button" onClick={() => view(entry)} disabled={!!editor}>Ayrıntılar</button><details className="overflow-menu"><summary aria-label={entry.title+" işlemleri"}>⋯</summary><div><button type="button" onClick={() => { setSelectedId(entry.id); setEditor({ entry }); setDeleteId(null); setFeedback(null); }} disabled={initial.locked || !!editor}>Düzenle</button><button className="archive-delete" type="button" onClick={() => view(entry, true)} disabled={initial.locked || !!editor}>Sil</button></div></details></div>
    </article>)}</div>
    {!visible.length && <div className="files-empty surface"><Icon name="archive" size={30} /><h2>{entries.length ? "Eşleşen arşiv kaydı bulunamadı." : initial.locked ? "Arşiv kayıtları okunamadı." : "Arşiviniz henüz boş."}</h2><p>{entries.length ? "Aramayı veya kategori filtresini değiştirin." : initial.locked ? "Mevcut veriler korunuyor." : "Yeni Kayıt ile ilk önemli kaydınızı ekleyin."}</p></div>}
  </div>;
}
