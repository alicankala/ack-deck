export type GeminiModels = { fast: string; powerful: string };
export function validGeminiModels(value: unknown): value is GeminiModels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 2 && [v.fast, v.powerful].every(name => typeof name === "string" && name.length <= 100 && /^gemini-[a-zA-Z0-9._-]+$/.test(name));
}
