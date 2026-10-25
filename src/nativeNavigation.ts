import type { NavigationTarget } from "./navigation";

export function nativeNavigation(target: string): NavigationTarget | null {
  if (target === "home") return { page: "home" };
  if (target === "prayer") return { page: "home", id: "prayer" };
  if (target === "new-task") return { page: "tasks", intent: "new-task" };
  if (target === "new-note") return { page: "notes", intent: "new-note" };
  if (target === "study") return { page: "calendar" };
  if (target === "ai") return { page: "ai" };
  if (target.startsWith("ai:")) {
    const id = target.slice(3);
    return id.length > 0 && id.length <= 512 && !/[\x00-\x1f]/.test(id) ? { page: "ai", id } : { page: "ai" };
  }
  if (target === "inbox") return { page: "inbox" };
  if (target.startsWith("inbox:")) {
    const id = target.slice(6);
    return id.length > 0 && id.length <= 512 && !/[\x00-\x1f]/.test(id) ? { page: "inbox", id } : { page: "inbox" };
  }
  for (const [prefix, page] of [["task:", "tasks"], ["subscription:", "subscriptions"], ["note:", "notes"]] as const) {
    if (target.startsWith(prefix)) {
      const id = target.slice(prefix.length);
      return id.length > 0 && id.length <= 512 && !/[\x00-\x1f]/.test(id) ? { page, id } : null;
    }
  }
  return null;
}
