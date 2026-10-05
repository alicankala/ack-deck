import type { AiModel } from "./geminiClient";

const MODEL_STORAGE_KEY = "ack-deck.ai-model.v1";

export function getSavedAiModel(): AiModel {
  try {
    return window.localStorage.getItem(MODEL_STORAGE_KEY) === "powerful" ? "powerful" : "fast";
  } catch {
    return "fast";
  }
}

export function saveAiModel(model: AiModel): boolean {
  try { window.localStorage.setItem(MODEL_STORAGE_KEY, model); return true; } catch { return false; }
}
