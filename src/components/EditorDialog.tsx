import { useEffect, useId, useRef, type ReactNode } from "react";

export function EditorDialog({ title, description, children, onClose, busy = false, error }: { title: string; description?: string; children: ReactNode; onClose: () => void; busy?: boolean; error?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className="editor-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="editor-dialog-heading"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="editor-close" aria-label="Düzenleyiciyi kapat" disabled={busy} onClick={onClose}>×</button></header>
    <div className="editor-dialog-body">{error && <p className="tool-feedback error" role="alert">{error}</p>}{children}</div>
  </dialog>;
}
