import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { redactSecrets } from "./privacy";
import type { AiMessage } from "./geminiClient";
import { conversationTitle, deleteConversation, loadConversations, discardConversationWrite, queueConversationSave, visibleMessages, type Conversation } from "./conversationStore";
export function useConversations() {
  const [threads, setThreads] = useState<Conversation[]>([]), [activeId, setActiveId] = useState(""), [ready, setReady] = useState(false), [mutating, setMutating] = useState(false), [error, setError] = useState("");
  const queue = useRef(Promise.resolve());
  useEffect(() => { let alive = true; loadConversations().then(items => { if (alive) { const now = Date.now(); const initial = items.length ? items : [{ id: crypto.randomUUID(), title: "Yeni sohbet", createdAt: now, updatedAt: now, messages: [] }]; setThreads(initial); setActiveId(initial[0].id); setReady(true); } }).catch(reason => { if (alive) setError(reason.message); }); return () => { alive = false; }; }, []);
  const unsaved = useRef(new Map<string, Conversation>());
  function persist(thread: Conversation) { unsaved.current.set(thread.id, thread); queue.current = queueConversationSave(thread).then(() => { if (unsaved.current.get(thread.id) === thread) unsaved.current.delete(thread.id); if (!unsaved.current.size) setError(""); }).catch(() => { setError("Sohbet kaydedilemedi. Konuşma ekranda korunuyor; kaydetmeyi tekrar deneyin."); }); }
  const state = useRef({ threads, activeId }); state.current = { threads, activeId };
  useEffect(() => { const reload = () => { void loadConversations().then(items => { const initial = items.length ? items : [emptyConversation()]; setThreads(initial); setActiveId(initial[0].id); }).catch(() => setError("Sohbetler yeniden yüklenemedi.")); }; window.addEventListener("ack-data-restored", reload); return () => window.removeEventListener("ack-data-restored", reload); }, []);
  const current = threads.find(thread => thread.id === activeId);
  const messages = current?.messages ?? [];
  const setMessages: Dispatch<SetStateAction<AiMessage[]>> = update => {
    if (!ready) return;
    const current = state.current.threads.find(thread => thread.id === state.current.activeId);
    const nextMessages = visibleMessages(typeof update === "function" ? update(current?.messages ?? []) : update);
    const now = Date.now(), thread: Conversation = current ? { ...current, messages: nextMessages, updatedAt: now, title: current.title === "Yeni sohbet" ? conversationTitle(nextMessages) : current.title } : { id: crypto.randomUUID(), title: conversationTitle(nextMessages), createdAt: now, updatedAt: now, messages: nextMessages };
    state.current = { threads: [thread, ...state.current.threads.filter(item => item.id !== thread.id)], activeId: thread.id };
    setThreads(previous => [thread, ...previous.filter(item => item.id !== thread.id)]); setActiveId(thread.id); persist(thread);
  };
  function newChat() { const now = Date.now(), thread: Conversation = { id: crypto.randomUUID(), title: "Yeni sohbet", createdAt: now, updatedAt: now, messages: [] }; setThreads(previous => [thread, ...previous]); setActiveId(thread.id); persist(thread); }
  async function rename(id: string, title: string) { if (mutating) return; setMutating(true); const old = threads.find(thread => thread.id === id); if (!old || !title.trim()) { setMutating(false); return; } const next = { ...old, title: redactSecrets(title.trim()).slice(0, 200), updatedAt: Date.now() }; try { await queue.current; await queueConversationSave(next); unsaved.current.delete(id); if (!unsaved.current.size) setError(""); setThreads(previous => previous.map(thread => thread.id === id ? { ...thread, title: next.title, updatedAt: next.updatedAt } : thread)); } catch { setError("Sohbet adı kaydedilemedi."); } finally { setMutating(false); } }
  async function remove(id: string) { if (mutating) return; setMutating(true); try { await queue.current; await deleteConversation(id); discardConversationWrite(id); unsaved.current.delete(id); if (!unsaved.current.size) setError(""); setThreads(previous => previous.filter(thread => thread.id !== id)); if (activeId === id) { const remaining = threads.find(thread => thread.id !== id); if (remaining) setActiveId(remaining.id); else { const blank = emptyConversation(); setThreads([blank]); setActiveId(blank.id); } } } catch { setError("Sohbet silinemedi. Kayıt korunuyor."); } finally { setMutating(false); } }
  return { threads, activeId, current, messages, setMessages, ready, error, mutating, newChat, rename, remove, select: setActiveId, retry: () => { for (const thread of unsaved.current.values()) persist(thread); } };
}

function emptyConversation(): Conversation { const now = Date.now(); return { id: crypto.randomUUID(), title: "Yeni sohbet", createdAt: now, updatedAt: now, messages: [] }; }
