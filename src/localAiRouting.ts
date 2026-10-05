import type { NavigationTarget } from "./navigation";
import { normalizeHub } from "./usageStore";
export function localAiDestination(text: string): NavigationTarget | null {
  const term = normalizeHub(text.trim()).replace(/[’'.!?]/g, "").replace(/\s+/g, " ");
  if (/^yeni gorev$/.test(term)) return { page: "tasks", intent: "new-task" };
  if (/^yeni not$/.test(term)) return { page: "notes", intent: "new-note" };
  const routes: [RegExp, NavigationTarget["page"]][] = [[/^qr(?:i|yi)?(?: aracini)? (ac|git)$/, "qr"], [/^(notlari ac|notlara git)$/, "notes"], [/^(ayarlari ac|ayarlara git)$/, "settings"], [/^(arsivi ac|arsive git)$/, "archive"], [/^(gorevleri ac|gorevlere git)$/, "tasks"], [/^(projeleri ac|projelere git)$/, "projects"], [/^(calisma alanlarini ac|calisma alanlarina git)$/, "workspaces"], [/^(kisayollari ac|kisayollara git)$/, "files"]];
  const route = routes.find(([pattern]) => pattern.test(term)); return route ? { page: route[1] } : null;
}
