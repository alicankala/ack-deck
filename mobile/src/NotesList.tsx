import { useState } from "react";
import type { CloudRecord, PhoneNote } from "../../shared/phone";
import { Icon } from "./Icon";

export function NotesList({ records, onOpen, onNew, syncLabel, noteOrder, onReorder }: {
  records: CloudRecord[];
  onOpen: (row: CloudRecord) => void;
  onNew: () => void;
  syncLabel: string;
  noteOrder?: string[];
  onReorder?: (id: string, direction: number) => void;
}) {
  const [query, setQuery] = useState("");
  const rawNotes = records.filter(row => row.kind === "notes" && !row.deleted && row.data);
  const notes = noteOrder ? [...rawNotes].sort((a, b) => {
    const ai = noteOrder.indexOf(a.id), bi = noteOrder.indexOf(b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return 0;
  }) : rawNotes;
  const visible = notes.filter(row => { const note = row.data as PhoneNote; return (note.title + " " + note.content).toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR")); });
  return <section className="phone-notebook" aria-label="Not defteri">
    <div className="notebook-brand"><span className="notebook-brand-icon"><Icon name="note" size={17} /></span><span>ACKDECK</span></div>
    <header className="notebook-heading"><div><h1>Notlar</h1><p>{notes.length} not <span aria-hidden="true">·</span> {syncLabel}</p></div><button type="button" className="new-note-button" onClick={onNew}><Icon name="compose" size={19} /><span>Yeni not</span></button></header>
    <div className="notebook-search"><Icon name="search" size={19} /><label className="sr-only" htmlFor="notes-search">Notlarda ara</label><input id="notes-search" type="search" placeholder="Notlarında ara…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Aramayı temizle" onClick={() => setQuery("")}>×</button>}</div>
    {!!visible.length && <div className="notebook-section-heading"><h2>{query.trim() ? "Arama sonuçları" : "Notlar"}</h2><span>{visible.length}</span></div>}
    <div className="notebook-list">{visible.map((row, index) => {
      const note = row.data as PhoneNote;
      const date = new Date(note.updatedAt);
      return <button type="button" className="notebook-row" key={row.id} onClick={() => onOpen(row)}>
        <span className="notebook-card-top">
          <span className="notebook-page-icon"><Icon name="note" size={18} /></span>
          <span className="notebook-card-top-right">
            {onReorder && (
              <span className="notebook-reorder-group" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  className="notebook-reorder-btn"
                  title="Öne taşı"
                  aria-label={`${note.title || "Notu"} öne taşı`}
                  disabled={index === 0}
                  onClick={(e) => { e.stopPropagation(); onReorder(row.id, -1); }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="notebook-reorder-btn"
                  title="Arkaya taşı"
                  aria-label={`${note.title || "Notu"} arkaya taşı`}
                  disabled={index >= visible.length - 1}
                  onClick={(e) => { e.stopPropagation(); onReorder(row.id, 1); }}
                >
                  ↓
                </button>
              </span>
            )}
            <span aria-hidden="true" className="notebook-open-arrow">↗</span>
          </span>
        </span>
        <strong>{note.title || "Başlıksız not"}</strong>
        <span className="notebook-preview">{note.content.replace(/\s+/g, " ").trim() || "Bu sayfa yazmanı bekliyor."}</span>
        <span className="notebook-card-bottom"><time dateTime={date.toISOString()}>{date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</time><span>{note.content.trim() ? note.content.trim().split(/\s+/).length : 0} kelime</span></span>
      </button>;
    })}</div>
    {!visible.length && <div className="notebook-empty"><span className="notebook-empty-icon"><Icon name={query ? "search" : "compose"} size={34} /></span><h2>{query ? "Aradığın not burada yok" : "İlk sayfanı aç"}</h2><p>{query ? "Başlık veya içerikte başka bir kelime ara." : "Bir fikir, bir hatırlatma, birkaç satır. Hepsine burada yer var."}</p>{!query && <button type="button" onClick={onNew}>İlk notunu yaz <span aria-hidden="true">↗</span></button>}</div>}
  </section>;
}
