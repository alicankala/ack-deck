import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { paletteRows } from "../paletteRows";
import { executePaletteRequest, type PaletteRequest } from "../paletteActions";
import { moveSelection } from "../commandPalette";
import { usageFor } from "../usageStore";
import type { NavigationTarget } from "../navigation";
export function LauncherPalette({ onNavigate, onClose, standalone = false }: { onNavigate: (target: NavigationTarget) => void; onClose: () => void; standalone?: boolean }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(""), [capture, setCapture] = useState<"task" | "note" | null>(null), [content, setContent] = useState(""), [, refresh] = useState(0);
  const busyRef = useRef(false), dialog = useRef<HTMLDialogElement>(null), requestRef = useRef<{ text: string; kind: string; id: string } | null>(null), hideTimer = useRef<number | undefined>(undefined);
  const { rows, warnings } = paletteRows(query);
  async function execute(request: Omit<PaletteRequest, "id">, id: string = crypto.randomUUID()) { return standalone ? invoke<string>("palette_request", { request: { ...request, mode: request.mode ?? null, id } }) : executePaletteRequest({ ...request, id }, onNavigate); }
  async function run(index: number) {
    const row = rows[index]; if (!row || busyRef.current) return;
    if (row.capture) { setCapture(row.capture); setContent(""); setError(""); requestRef.current = null; return; }
    if (!row.request) return; busyRef.current = true; setBusy(true); setError("");
    try { const message = await execute(row.request); if (row.request.kind === "workspace" && /açılamadı|açılacak öğe yok/.test(message)) { setError(message); refresh(v => v + 1); } else onClose(); }
    catch { setError("İşlem tamamlanamadı. Kayıtlı öğeyi veya konumu kontrol edin."); } finally { busyRef.current = false; setBusy(false); }
  }
  async function saveCapture() {
    if (!capture || !content.trim() || busyRef.current) return; busyRef.current = true; setBusy(true); setError("");
    const value = content.trim(); if (!requestRef.current || requestRef.current.text !== value || requestRef.current.kind !== capture) requestRef.current = { text: value, kind: capture, id: crypto.randomUUID() };
    try { await execute({ kind: capture, value }, requestRef.current.id); setError("Kaydedildi"); hideTimer.current = window.setTimeout(() => { setContent(""); setCapture(null); onClose(); }, 350); }
    catch { setError("Kaydedilemedi. Girilen metin korunuyor; tekrar deneyin."); } finally { busyRef.current = false; setBusy(false); }
  }
  async function pin(index: number) { const row = rows[index]; if (!row?.source || !row.recordId || busyRef.current) return; busyRef.current = true; setBusy(true); try { await execute({ kind: "pin", value: row.recordId, mode: row.source }); refresh(v => v + 1); } catch { setError("Sabitleme kaydedilemedi."); } finally { busyRef.current = false; setBusy(false); } }
  useEffect(() => { const update = () => refresh(v => v + 1); window.addEventListener("ack-data-changed", update); window.addEventListener("storage", update); return () => { window.removeEventListener("ack-data-changed", update); window.removeEventListener("storage", update); window.clearTimeout(hideTimer.current); }; }, []);
  useEffect(() => { setSelected(0); }, [capture]);
  useEffect(() => { document.getElementById(capture ? "quick-capture-input" : "global-search-query")?.focus(); }, [capture]);
  useEffect(() => { document.getElementById("palette-row-" + selected)?.scrollIntoView({ block: "nearest" }); }, [selected]);
  useEffect(() => {
    if (!standalone) { const previous = document.activeElement; dialog.current?.showModal(); return () => { dialog.current?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }
    let active = true, unlisten: (() => void) | undefined;
    void listen("ack-palette-open", () => { if (!active) return; setQuery(""); setSelected(0); refresh(v => v + 1); if (!busyRef.current) setError(""); window.setTimeout(() => document.getElementById(capture ? "quick-capture-input" : "global-search-query")?.focus(), 0); }).then(fn => { if (active) unlisten = fn; else fn(); });
    return () => { active = false; unlisten?.(); };
  }, [standalone, capture]);
  function keyboard(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); if (!busy) onClose(); return; }
    if (busy || capture || (event.target instanceof HTMLElement && event.target.closest(".palette-pin"))) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); document.getElementById("global-search-query")?.focus(); setSelected(moveSelection(selected, event.key === "ArrowDown" ? 1 : -1, rows.length)); }
    else if (event.key === "Enter" && event.target instanceof HTMLElement && (event.target.id === "global-search-query" || event.target.closest(".command-result"))) { event.preventDefault(); void run(selected); }
  }
  const body = <><div className="command-header"><h2 id="search-title">{capture === "task" ? "Yeni Görev" : capture === "note" ? "Yeni Not" : "ACKDeck · Hızlı Erişim"}</h2><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Kapat · Esc</button></div>
    {capture ? <form className="palette-capture" onSubmit={e => { e.preventDefault(); void saveCapture(); }}><label htmlFor="quick-capture-input">{capture === "task" ? "Görev" : "Not içeriği"}</label><textarea id="quick-capture-input" autoFocus value={content} onChange={e => setContent(e.target.value)} placeholder={capture === "task" ? "Yapılacak şeyi yaz..." : "Aklındakini yaz..."} maxLength={capture === "task" ? 160 : 30000} rows={capture === "task" ? 2 : 4} disabled={busy} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void saveCapture(); } }} /><div className="hub-actions"><button className="button button-primary" disabled={busy || !content.trim()}>Kaydet</button><button type="button" disabled={busy} onClick={() => setCapture(null)}>Aramaya Dön</button><button type="button" disabled={busy} onClick={() => void execute({ kind: "navigate", value: JSON.stringify({ page: capture === "task" ? "tasks" : "notes", intent: capture === "task" ? "new-task" : "new-note" }) }).then(onClose).catch(() => setError("Sayfa açılamadı."))}>Ayrıntılı Düzenle</button></div><small>Enter ile kaydet · Shift+Enter ile yeni satır</small></form> : <><label className="sr-only" htmlFor="global-search-query">ACKDeck kayıt veya komut ara</label><input id="global-search-query" autoFocus value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setSelected(0); }} placeholder="Çalışma alanı, kayıt veya komut ara..." maxLength={200} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-activedescendant={rows[selected] ? "palette-row-" + selected : undefined} aria-controls="palette-results" /><div className="command-results" id="palette-results" role="listbox" aria-label="Arama sonuçları ve komutlar">{rows.map((row, index) => <div key={row.id}>{(!query && (index === 0 || rows[index - 1].group !== row.group)) && <h3 className="palette-group">{row.group}</h3>}<div className="palette-result-line"><button type="button" id={"palette-row-" + index} className={"command-result " + (selected === index ? "selected" : "")} role="option" aria-selected={selected === index} disabled={busy} onMouseEnter={() => setSelected(index)} onClick={() => void run(index)}><small>{row.kind}</small><strong>{row.title}</strong><span>{row.detail}</span></button>{row.source && row.recordId && <button type="button" className="palette-pin" disabled={busy} aria-label={row.title + (usageFor(row.source, row.recordId).pinned ? ": sabitlemeyi kaldır" : ": sabitle")} title={usageFor(row.source, row.recordId).pinned ? "Sabitlemeyi Kaldır" : "Sabitle"} onClick={() => void pin(index)}>{usageFor(row.source, row.recordId).pinned ? "★" : "☆"}</button>}</div></div>)}{!rows.length && <p className="command-empty">Eşleşen kayıt veya komut bulunamadı.</p>}</div></>}
    {error && <p role="status" className="palette-feedback">{error}</p>}{warnings.length > 0 && <p role="status">{warnings.join(" ")}</p>}<small className="command-footer">↑ ↓ seç · Enter aç / kaydet · Esc kapat. Yalnızca ACKDeck kayıtları aranır.</small></>;
  return standalone ? <section className="command-dialog standalone-palette" onKeyDown={keyboard} aria-labelledby="search-title">{body}</section> : <dialog ref={dialog} className="command-dialog" onKeyDown={keyboard} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="search-title">{body}</dialog>;
}
