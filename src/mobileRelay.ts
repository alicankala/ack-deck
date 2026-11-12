import type { AckContext } from "./ackIntegration";
import type { AiMessage, AiModel, AiReply } from "./geminiClient";
import { redactSecrets } from "./privacy";

export type RelayPendingQuery = {
  id: string;
  prompt: string;
  history?: string;
  messages?: AiMessage[];
  model?: string;
};

export type RelayReplyPayload = {
  id: string;
  reply: string;
  failed?: true;
};

export type RelayQueryDeps = {
  hasKey: boolean;
  collectContext: (query: string) => Promise<{ context: AckContext[] }>;
  sendMessage: (
    messages: AiMessage[],
    model: AiModel,
    context: AckContext[],
    allowActions: boolean,
    attachmentIds: string[],
  ) => Promise<AiReply>;
  sendReply: (payload: RelayReplyPayload) => Promise<unknown>;
};

function isValidRelayMessage(item: unknown): item is AiMessage {
  if (!item || typeof item !== "object") return false;
  const candidate = item as { role?: unknown; text?: unknown };
  return (
    (candidate.role === "user" || candidate.role === "model") &&
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0
  );
}

/**
 * Normalizes a pending mobile AI relay query into a validated conversation list.
 */
export function parseRelayMessages(
  q: Pick<RelayPendingQuery, "prompt" | "history" | "messages">,
): AiMessage[] {
  const promptText = typeof q.prompt === "string" ? q.prompt.trim() : "";

  if (Array.isArray(q.messages) && q.messages.length > 0) {
    const valid = q.messages
      .filter(isValidRelayMessage)
      .map((m) => ({ role: m.role, text: m.text.trim() }));
    if (valid.length > 0) return valid;
    return promptText ? [{ role: "user", text: promptText }] : [];
  }

  const messages: AiMessage[] = [];
  if (typeof q.history === "string" && q.history.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(q.history);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isValidRelayMessage(item)) {
            messages.push({ role: item.role, text: item.text.trim() });
          }
        }
      }
    } catch {
      // Malformed history JSON degrades safely to prompt-only context.
    }
  }

  if (promptText) {
    messages.push({ role: "user", text: promptText });
  }
  return messages;
}

export function resolveRelayModel(model?: string): AiModel {
  return model === "powerful" ? "powerful" : "fast";
}

/**
 * Executes a single pending mobile relay query on desktop and reports either
 * the redacted reply or an explicit Turkish failure payload.
 */
export async function executeRelayQuery(
  q: RelayPendingQuery,
  deps: RelayQueryDeps,
): Promise<void> {
  const sendFailure = async (rawMsg: string) => {
    const safe = redactSecrets(rawMsg).trim() || "ACK AI yanıt üretemedi.";
    await deps
      .sendReply({ id: q.id, reply: safe.slice(0, 1000), failed: true })
      .catch(() => {});
  };

  if (!deps.hasKey) {
    await sendFailure("Masaüstünde Gemini API anahtarı ekli değil.");
    return;
  }

  const messages = parseRelayMessages(q);
  if (messages.length === 0) {
    await sendFailure("Sorgu metni boş.");
    return;
  }

  const modelChoice = resolveRelayModel(q.model);

  try {
    const lastText = messages[messages.length - 1]?.text ?? "";
    const { context } = await deps.collectContext(lastText);
    const reply = await deps.sendMessage(messages, modelChoice, context, false, []);
    const cleanReply = redactSecrets((reply?.text ?? "").trim());
    if (!cleanReply) {
      await sendFailure("ACK AI yanıt üretemedi.");
      return;
    }
    await deps.sendReply({ id: q.id, reply: cleanReply.slice(0, 20000) });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "ACK AI yanıt üretemedi.";
    await sendFailure(msg);
  }
}
