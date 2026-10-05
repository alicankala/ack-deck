import { useEffect, useState } from "react";
import { clearUndo, undoRecord, undoTickets } from "../recordUndo";
export function UndoToast() {
  const [tickets, setTickets] = useState(undoTickets), [error, setError] = useState("");
  useEffect(() => { const refresh = () => { setTickets(undoTickets()); setError(""); }; window.addEventListener("ack-undo-changed", refresh); window.addEventListener("ack-restore-active", clearUndo); return () => { window.removeEventListener("ack-undo-changed", refresh); window.removeEventListener("ack-restore-active", clearUndo); }; }, []);
  useEffect(() => { if (!tickets.length) return; const timer = window.setTimeout(() => setTickets(undoTickets()), Math.max(0, Math.min(...tickets.map(ticket => ticket.expiresAt)) - Date.now()) + 20); return () => window.clearTimeout(timer); }, [tickets]);
  return tickets.length ? <div className="undo-toasts" role="status">{tickets.map(ticket => <div className="surface" key={ticket.id}><span>{ticket.label}</span><button className="button button-secondary" type="button" onClick={() => { if (!undoRecord(ticket.id)) setError("Geri alınamadı. Depolamayı kontrol edin veya süre dolmuş olabilir."); }}>Geri Al</button></div>)}{error && <p role="alert">{error}</p>}</div> : null;
}
