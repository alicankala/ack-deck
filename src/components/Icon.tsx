import type { ReactNode, SVGProps } from "react";

export type IconName = "grid" | "folder" | "tool" | "archive" | "settings" | "cpu" | "memory" | "drive" | "wifi" | "arrowRight" | "plus" | "check" | "trash" | "note" | "qr" | "files" | "globe" | "speed" | "layers" | "info" | "spark";

const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  tool: <path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 13l-3-3z"/>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></>,
  settings: <><path d="M10 2h4l.7 2.2 1.5.8 2.2-.6 2 3.4-1.6 1.7v1.8l1.6 1.7-2 3.4-2.2-.6-1.5.8L14 19h-4l-.7-2.2-1.5-.8-2.2.6-2-3.4 1.6-1.7V9.7L3.6 8l2-3.4 2.2.6 1.5-.8z" transform="translate(0 1)"/><circle cx="12" cy="11.5" r="2.5"/></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 9h6v6H9zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
  memory: <><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4m4-4v4m4-4v4m4-4v4M7 18v2m10-2v2"/></>,
  drive: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 14h18M7 17h.01M11 17h.01"/></>,
  wifi: <><path d="M2 8a15 15 0 0 1 20 0M5 11a11 11 0 0 1 14 0M8 14a7 7 0 0 1 8 0"/><circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/></>,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  trash: <><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></>,
  note: <><path d="M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h6"/></>,
  qr: <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3m-3 3h4m-7 1v-2"/></>,
  files: <><path d="M7 3h9l4 4v13H7zM16 3v4h4M4 7H3v14h13v-1"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"/></>,
  speed: <><path d="M5 18a9 9 0 1 1 14 0M12 13l4-5M4 18h16"/><circle cx="12" cy="13" r="1"/></>,
  layers: <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  spark: <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 18l.6 1.4L21 20l-1.4.6L19 22l-.6-1.4L17 20l1.4-.6z"/>,
};

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };
export function Icon({ name, size = 20, ...props }: Props) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} style={{ width: `calc(var(--ui-unit, 1px) * ${size})`, height: `calc(var(--ui-unit, 1px) * ${size})`, ...props.style }}>{paths[name]}</svg>;
}
