export type Project = { id: string; name: string; description: string; folderPath: string };

const STORAGE_KEY = "ack-deck.projects.v1";
export type ProjectLoad = { entries: Project[]; preserved: unknown[]; locked: boolean; warning: string | null };

export function loadProjectSnapshot(): ProjectLoad {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { entries: [], preserved: [], locked: false, warning: null };
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("invalid projects");
    const entries: Project[] = []; const preserved: unknown[] = []; const ids = new Set<string>();
    for (const item of parsed) {
      if (item && typeof item.id === "string" && item.id && !ids.has(item.id) && typeof item.name === "string" && typeof item.description === "string" && typeof item.folderPath === "string") { entries.push(item); ids.add(item.id); }
      else preserved.push(item);
    }
    return { entries, preserved, locked: false, warning: preserved.length ? "Bazı projeler okunamadı. Diğer kayıtlar korunuyor." : null };
  } catch { /* Bozuk veya erişilemeyen depolama uygulamayı durdurmaz. */ }
  return { entries: [], preserved: [], locked: true, warning: "Projeler okunamadı. Mevcut kayıtlar korunuyor." };
}
export function loadProjects(): Project[] { return loadProjectSnapshot().entries; }

export function saveProjects(projects: Project[], loaded: ProjectLoad = loadProjectSnapshot()): boolean {
  if (loaded.locked) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...projects, ...loaded.preserved]));
    return true;
  } catch {
    return false;
  }
}
