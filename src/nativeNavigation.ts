import type { NavigationTarget } from "./navigation";
export function nativeNavigation(target: string): NavigationTarget | null {
  if (target === "new-task") return { page: "tasks", intent: "new-task" };
  if (target === "new-note") return { page: "notes", intent: "new-note" };
  if (target === "study") return { page: "calendar" };
  if (target === "ai") return { page: "ai" };
  for (const [prefix, page] of [["task:", "tasks"], ["subscription:", "subscriptions"]] as const) {
    if (target.startsWith(prefix)) { const id = target.slice(prefix.length); return id.length > 0 && id.length <= 512 && !/[\x00-\x1f]/.test(id) ? { page, id } : null; }
  }
  return null;
}
