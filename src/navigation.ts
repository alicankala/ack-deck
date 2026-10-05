import type { Page } from "./components/Sidebar";
export type NavigationTarget = { page: Page; id?: string; intent?: "new-task" | "new-note" | "new-archive" | "start-speed" };
