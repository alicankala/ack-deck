import { invoke } from "@tauri-apps/api/core";
import { LauncherPalette } from "./LauncherPalette";
import "../App.css";
export function PaletteWindow() { return <LauncherPalette standalone onNavigate={() => {}} onClose={() => { void invoke("hide_palette"); }} />; }
