import type { AckProposal } from "./ackActions";
export type PendingConfirmation = AckProposal & { actionId: string; createdAt: number; expiresAt: number };
const tickets = new Map<string, string>();
export function createConfirmation(proposal: AckProposal, now = Date.now()): PendingConfirmation {
  for (const [id, raw] of tickets) if ((JSON.parse(raw) as PendingConfirmation).expiresAt <= now) tickets.delete(id);
  const ticket: PendingConfirmation = JSON.parse(JSON.stringify({ ...proposal, actionId: crypto.randomUUID(), createdAt: now, expiresAt: now + 5 * 60_000 }));
  if (tickets.size >= 6) throw new Error("Bekleyen işlem sınırına ulaşıldı. Önce işlemleri iptal edin.");
  tickets.set(ticket.actionId, JSON.stringify(ticket)); return Object.freeze(ticket);
}
export function claimConfirmation(ticket: PendingConfirmation, now = Date.now()): AckProposal {
  const original = tickets.get(ticket.actionId); tickets.delete(ticket.actionId);
  if (!original || original !== JSON.stringify(ticket) || now >= ticket.expiresAt) throw new Error("İşlem onayı geçersiz veya süresi doldu. İsteği yeniden gönderin.");
  return JSON.parse(original) as AckProposal;
}
export function cancelConfirmation(ticket: PendingConfirmation | null): void { if (ticket) tickets.delete(ticket.actionId); }
