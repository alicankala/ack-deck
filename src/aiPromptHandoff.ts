export type AiPromptHandoff = { id: string; text: string };
// Only an explicitly submitted, unconsumed dashboard prompt can start the existing chat pipeline.
export function takeDashboardPrompt(prompt: AiPromptHandoff | undefined, hasKey: boolean | null, consumed: { current: string | null }): string | null {
  if (!prompt || hasKey !== true || consumed.current === prompt.id || !prompt.text.trim()) return null;
  consumed.current = prompt.id;
  return prompt.text.trim();
}
