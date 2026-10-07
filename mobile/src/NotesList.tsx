import { useState } from "react";
import type { CloudRecord, PhoneNote } from "../../shared/phone";
import { Icon } from "./Icon";

export function NotesList({ records, onOpen, onNew }: { records: CloudRecord[]; onOpen: (row: CloudRecord) => void; onNew: () => void }) {
  const [query, setQuery] = useState("");
  const notes = records.filter(row => row.kind === "notes" && !row.deleted && row.data).sort((a, b) => (b.data as PhoneNote).updatedAt - (a.data as PhoneNote).updatedAt);
  const visible = notes.filter(row => { const note = row.data as PhoneNote; return (note.title + " " + note.content).toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR")); });
  return <section className="phone-notebook" aria-label="Not defteri"><div className="notebook-tools"><label className="sr-only" htmlFor="notes-search">Notlarda ara</label><input id="notes-search" type="search" placeholder="Notlarda ara" value={query} onChange={event => setQuery(event.target.value)} /><button type="button" className="new-note-button" aria-label="Yeni not oluştur" onClick={onNew}><Icon name="compose" /></button></div>
    <div className="notebook-list">{visible.map(row => { const note = row.data as PhoneNote; return <button type="button" className="notebook-row" key={row.id} onClick={() => onOpen(row)}><strong>{note.title || "Başlıksız not"}</strong><span>{note.content.replace(/\s+/g, " ").trim() || "İçerik ekle"}</span><time dateTime={new Date(note.updatedAt).toISOString()}>{new Date(note.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</time></button>; })}</div>
    {!visible.length && <div className="notebook-empty"><Icon name="note" size={38} /><h2>{query ? "Not bulunamadı" : "Bir fikirle başla"}</h2><p>{query ? "Başka bir kelimeyle aramayı dene." : "Yeni not düğmesine dokun ve aklındakileri yaz."}</p></div>}<p className="notebook-count">{notes.length} not</p>
  </section>;
}
