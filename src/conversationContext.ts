import type { AiMessage } from "./geminiClient";
// UTF-8 budgets also respect the native request validator; local history is never truncated.
export function boundedConversation(messages: AiMessage[], budget = 18000): { role: "user" | "model"; text: string }[] {
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || bytes(last.text) > 8000) throw new Error("Mesaj çok uzun. Daha kısa bir mesaj yazın.");
  const result: { role: "user" | "model"; text: string }[] = [{ role: last.role, text: last.text }]; let size = bytes(last.text);
  for (let index = messages.length - 2; index >= 0 && result.length < 20; index--) {
    const message = messages[index]; let text = message.text;
    while (bytes(text) > 4000) text = text.slice(0, Math.floor(text.length * .8));
    if (size + bytes(text) > budget) break;
    result.unshift({ role: message.role, text }); size += bytes(text);
  }
  while (result.length > 1 && result[0].role !== "user") result.shift();
  return result;
}
