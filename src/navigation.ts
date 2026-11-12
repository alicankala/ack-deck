import type { Page } from "./components/Sidebar";

export type ProjectTool = "converter" | "speed" | "ip" | "qr";
export type LegacyRoutePage = "workspaces" | "tools" | "qr" | "ip" | "files" | "speed" | "pc" | "archive";
export type RoutePage = Page | LegacyRoutePage;

export type NavigationTarget = {
  page: RoutePage;
  tool?: ProjectTool;
  id?: string;
  date?: string;
  intent?: "new-task" | "new-note" | "new-archive" | "start-speed";
};

export type NormalizedNavigationTarget = {
  page: Page;
  tool?: ProjectTool;
  id?: string;
  date?: string;
  intent?: NavigationTarget["intent"];
};

const VALID_PAGES = new Set<Page>([
  "home",
  "tasks",
  "calendar",
  "notes",
  "media",
  "projects",
  "ai",
  "subscriptions",
  "inbox",
  "settings",
]);

const PROJECT_TOOL_ROUTE_MAP: Partial<Record<RoutePage, ProjectTool>> = {
  projects: "speed",
  workspaces: "speed",
  tools: "speed",
  speed: "speed",
  qr: "qr",
  ip: "ip",
  files: "converter",
};

export function normalizeRoute(target: NavigationTarget): NormalizedNavigationTarget {
  const { page, tool, ...rest } = target;
  if (page === "pc" || page === "archive") {
    return { ...rest, page: "home" };
  }
  const mappedTool = Object.prototype.hasOwnProperty.call(PROJECT_TOOL_ROUTE_MAP, page)
    ? PROJECT_TOOL_ROUTE_MAP[page]
    : undefined;
  if (mappedTool) {
    return { ...rest, page: "projects", tool: tool ?? mappedTool };
  }
  if (VALID_PAGES.has(page as Page)) {
    return tool ? { ...rest, page: page as Page, tool } : { ...rest, page: page as Page };
  }
  return { ...rest, page: "home" };
}
