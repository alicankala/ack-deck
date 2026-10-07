import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => panel.current?.hidePopover();
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) dismiss(); };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("ack-restore-active", dismiss);
    return () => { window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", scroll, true); window.removeEventListener("ack-restore-active", dismiss); };
  }, [open]);
  function position() {
    const button = trigger.current, menu = panel.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    const gap = 8, width = Math.min(240, window.innerWidth - gap * 2);
    menu.style.width = width + "px";
    menu.style.maxHeight = Math.max(120, window.innerHeight - gap * 2) + "px";
    const height = Math.min(menu.scrollHeight, window.innerHeight - gap * 2);
    menu.style.left = Math.max(gap, Math.min(rect.right - width, window.innerWidth - width - gap)) + "px";
    menu.style.top = Math.max(gap, Math.min(rect.bottom + gap + height > window.innerHeight ? rect.top - height - gap : rect.bottom + gap, window.innerHeight - height - gap)) + "px";
  }
  return <span className="record-action-menu"><button ref={trigger} type="button" className="record-menu-trigger" aria-label={label} aria-expanded={open} popoverTarget={id} onClick={position}>⋯</button><div id={id} ref={panel} popover="auto" className="record-menu-panel" onToggle={event => { setOpen(event.newState === "open"); if (event.newState === "open") { position(); panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); } }} onClick={event => { if ((event.target as HTMLElement).closest("button")) panel.current?.hidePopover(); }}>{children}</div></span>;
}
