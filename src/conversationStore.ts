import { validReference } from "../shared/productivity";
import type { AiMessage, AiModel } from "./geminiClient";
import { redactSecrets } from "./privacy";
export type Conversation = { id: string; title: string; createdAt: number; updatedAt: number; messages: AiMessage[]; model?: AiModel };
const DB_NAME = "ack-deck.conversations.v1";
const SOURCES = new Set(["tasks", "projects", "notes", "archive", "files", "speed", "pc", "ip", "settings", "workspaces", "shortcuts", "recent", "pinned", "inbox", "subscriptions", "activity"]);
export function visibleMessages(messages: AiMessage[]): AiMessage[] {
  return messages.map(message => ({ role: message.role, text: redactSecrets(message.text), ...(message.references ? {references:message.references.filter(ref=>validReference(ref.id)&&["tasks","projects","notes","inbox","workspaces","subscriptions","settings","archive","files"].includes(ref.source)).slice(0,20).map(ref=>({...ref,label:redactSecrets(ref.label).slice(0,200)}))} : {}), ...(message.sources ? { sources: message.sources.filter(source => SOURCES.has(source)) } : {}), ...(message.attachments ? { attachments: message.attachments.map(file => ({ name: redactSecrets(file.name), mime: file.mime, size: file.size })) } : {}) }));
}
export function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Conversation;
  return Object.keys(item).every(key => ["id", "title", "createdAt", "updatedAt", "messages", "model"].includes(key)) && typeof item.id === "string" && !!item.id && item.id.length <= 512 && typeof item.title === "string" && item.title.length <= 200 && Number.isFinite(item.createdAt) && Number.isFinite(item.updatedAt) && [undefined, "fast", "powerful"].includes(item.model) && Array.isArray(item.messages) && item.messages.every(message => message && Object.keys(message).every(key => ["role", "text", "sources", "attachments", "references"].includes(key)) && ["user", "model"].includes(message.role) && typeof message.text === "string" && !/AIza[\w-]{20,}/.test(message.text) && (message.references===undefined||Array.isArray(message.references)&&message.references.length<=20&&message.references.every(ref=>ref&&Object.keys(ref).every(k=>["source","id","label"].includes(k))&&validReference(ref.id)&&["tasks","projects","notes","inbox","workspaces","subscriptions","settings","archive","files"].includes(ref.source)&&typeof ref.label==="string"&&ref.label.length<=200&&!/AIza[\w-]{20,}/.test(ref.label))) && (message.sources === undefined || Array.isArray(message.sources) && message.sources.every(source => SOURCES.has(source))) && (message.attachments === undefined || Array.isArray(message.attachments) && message.attachments.every(file => file && Object.keys(file).every(key => ["name", "mime", "size"].includes(key)) && typeof file.name === "string" && file.name.length <= 200 && !/AIza[\w-]{20,}/.test(file.name) && ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav", "audio/mp4"].includes(file.mime) && Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= (file.mime.startsWith("audio/")?10:8) * 1024 * 1024)));
}
export function conversationTitle(messages: AiMessage[]): string { return messages.find(message => message.role === "user" && message.text.trim())?.text.trim().replace(/\s+/g, " ").slice(0, 65) || "Yeni sohbet"; }
export function searchConversations(threads: Conversation[], query: string): Conversation[] {
  const term = query.trim().toLocaleLowerCase("tr-TR");
  return threads.filter(thread => !term || [thread.title, ...thread.messages.map(message => message.text)].some(text => text.toLocaleLowerCase("tr-TR").includes(term))).sort((a, b) => b.updatedAt - a.updatedAt);
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => { request.result.createObjectStore("threads", { keyPath: "id" }); request.result.createObjectStore("recovery", { keyPath: "id" }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Sohbet depolamasına erişilemedi.")); request.onblocked = () => reject(new Error("Sohbet depolaması başka bir pencerede kullanılıyor.")); });
}
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try { return await new Promise<T>((resolve, reject) => { const transaction = db.transaction("threads", mode); const request = operation(transaction.objectStore("threads")); transaction.oncomplete = () => resolve(request.result); transaction.onabort = transaction.onerror = () => reject(new Error("Sohbet kaydedilemedi. Yerel depolamayı kontrol edin.")); }); } finally { db.close(); }
}
export async function loadConversations(): Promise<Conversation[]> { const all = await transact("readonly", store => store.getAll()); if (!all.every(isConversation)) throw new Error("Bazı sohbet kayıtları okunamadı. Kayıtlar korunuyor; depolama değiştirilmedi."); return all.sort((a, b) => b.updatedAt - a.updatedAt); }
export async function saveConversation(thread: Conversation): Promise<void> { const safe = { ...thread, title: redactSecrets(thread.title), messages: visibleMessages(thread.messages) }; if (!isConversation(safe)) throw new Error("Sohbet kaydı geçersiz. Önceki kayıt korunuyor."); await transact("readwrite", store => store.put(safe)); }
export async function deleteConversation(id: string): Promise<void> { await transact("readwrite", store => store.delete(id)); }
let writes = Promise.resolve();
const pendingWrites = new Map<string, Conversation>();
export function queueConversationSave(thread: Conversation): Promise<void> { pendingWrites.set(thread.id, thread); const result = writes.catch(() => {}).then(() => saveConversation(thread)).then(() => { if (pendingWrites.get(thread.id) === thread) pendingWrites.delete(thread.id); }); writes = result; return result; }
export function discardConversationWrite(id: string): void { pendingWrites.delete(id); }
export async function flushConversationWrites(): Promise<void> { await writes.catch(() => {}); if (pendingWrites.size) throw new Error("Kaydedilemeyen sohbetler var. Yedeklemeden önce ACK AI ekranından kaydetmeyi tekrar deneyin."); }
export async function beginConversationRestore(threads: Conversation[]): Promise<void> {
  if (!threads.every(isConversation) || new Set(threads.map(thread => thread.id)).size !== threads.length) throw new Error("Sohbet yedeği geçersiz.");
  await flushConversationWrites(); const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(["threads", "recovery"], "readwrite"), store = tx.objectStore("threads"), request = store.getAll(); request.onsuccess = () => { if (!request.result.every(isConversation)) { tx.abort(); return; } tx.objectStore("recovery").put({ id: "restore", threads: request.result }); store.clear(); threads.forEach(thread => store.put(thread)); }; tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error("Sohbet kurtarma kaydı oluşturulamadı. Mevcut sohbetler korunuyor.")); }); } finally { db.close(); }
}
export async function recoverConversationRestore(restore: boolean): Promise<void> {
  const db = await database(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(["threads", "recovery"], "readwrite"), recovery = tx.objectStore("recovery"), request = recovery.get("restore"); request.onsuccess = () => { const record = request.result; if (restore && record) { if (!Array.isArray(record.threads) || !record.threads.every(isConversation)) { tx.abort(); return; } const store = tx.objectStore("threads"); store.clear(); record.threads.forEach((thread: Conversation) => store.put(thread)); } recovery.delete("restore"); }; tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error("Sohbet kurtarma kaydı okunamadı. Kayıtlar korunuyor.")); }); } finally { db.close(); }
}
