import { useEffect, useRef, useState } from "react";
import { api, json, type MobileState } from "./store";

type ChatMsg = {
  role: "user" | "model";
  text: string;
};

export type MobileAiThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[];
  model?: "fast" | "powerful";
};

const THREADS_STORAGE_KEY = "ack-deck.mobile-ai-threads.v1";

function loadMobileThreads(): MobileAiThread[] {
  try {
    const raw = localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list.filter((t): t is MobileAiThread => !!t && typeof t.id === "string" && Array.isArray(t.messages));
    }
    return [];
  } catch {
    return [];
  }
}

function saveMobileThreads(threads: MobileAiThread[]) {
  try {
    localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads.slice(0, 50)));
  } catch {}
}

type Props = {
  state: MobileState;
  online: boolean;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
};

const QUICK_STARTERS = [
  "Bugün ne yapmam gerekiyor?",
  "Bu hafta hangi derslere çalışmadım?",
  "Koleksiyonuma göre öneri yap",
  "Yaklaşan abonelik ödemelerim neler?",
];

export function MobileAiChat({ state, online, onNotice, onError }: Props) {
  const [threads, setThreads] = useState<MobileAiThread[]>(() => loadMobileThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<"fast" | "powerful">("fast");
  const [sending, setSending] = useState(false);
  const [cloudKeyConfigured, setCloudKeyConfigured] = useState<boolean | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void api<{ configured: boolean }>(state, "ai/status")
      .then((res) => {
        if (mountedRef.current) setCloudKeyConfigured(Boolean(res.configured));
      })
      .catch(() => {
        if (mountedRef.current) setCloudKeyConfigured(false);
      });
    return () => {
      mountedRef.current = false;
    };
  }, [state.token]);

  useEffect(() => {
    if (messages.length > 0 || sending) {
      if (bottomRef.current?.parentElement) {
        bottomRef.current.parentElement.scrollTop = bottomRef.current.parentElement.scrollHeight;
      }
    }
  }, [messages, sending]);

  function startNewChat() {
    setActiveThreadId(null);
    setMessages([]);
    setDraft("");
    setShowHistory(false);
  }

  function selectThread(id: string) {
    const thread = threads.find((t) => t.id === id);
    if (thread) {
      setActiveThreadId(thread.id);
      setMessages(thread.messages);
      if (thread.model) setModel(thread.model);
      setShowHistory(false);
    }
  }

  function deleteThread(id: string) {
    if (!window.confirm("Bu sohbet silinsin mi?")) return;
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveMobileThreads(next);
      return next;
    });
    if (activeThreadId === id) {
      setActiveThreadId(null);
      setMessages([]);
    }
    onNotice("Sohbet silindi.");
  }

  async function sendPrompt(textToSend: string) {
    const clean = textToSend.trim();
    if (!clean || sending) return;
    if (!navigator.onLine) {
      onError("ACK AI sohbeti için internet bağlantısı gerekir.");
      return;
    }
    onError("");
    const userMsg: ChatMsg = { role: "user" as const, text: clean };
    const nextMessages: ChatMsg[] = [...messages, userMsg].slice(-20);
    setMessages(nextMessages);
    setDraft("");
    setSending(true);

    let curThreadId = activeThreadId;
    if (!curThreadId) {
      curThreadId = crypto.randomUUID();
      setActiveThreadId(curThreadId);
      const newThread: MobileAiThread = {
        id: curThreadId,
        title: clean.slice(0, 45).replace(/\s+/g, " "),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: nextMessages,
        model,
      };
      setThreads((prev) => {
        const next = [newThread, ...prev.filter((t) => t.id !== curThreadId)];
        saveMobileThreads(next);
        return next;
      });
    } else {
      setThreads((prev) => {
        const existing = prev.find((t) => t.id === curThreadId);
        const updated: MobileAiThread = existing
          ? { ...existing, updatedAt: Date.now(), messages: nextMessages, model }
          : { id: curThreadId!, title: clean.slice(0, 45), createdAt: Date.now(), updatedAt: Date.now(), messages: nextMessages, model };
        const next = [updated, ...prev.filter((t) => t.id !== curThreadId)];
        saveMobileThreads(next);
        return next;
      });
    }

    const persistReply = (replyText: string) => {
      const finalMessages: ChatMsg[] = [...nextMessages, { role: "model" as const, text: replyText }];
      if (mountedRef.current) {
        setMessages(finalMessages);
      }
      setThreads((prev) => {
        const existing = prev.find((t) => t.id === curThreadId);
        if (existing) {
          const updated: MobileAiThread = { ...existing, updatedAt: Date.now(), messages: finalMessages };
          const next = [updated, ...prev.filter((t) => t.id !== curThreadId)];
          saveMobileThreads(next);
          return next;
        }
        return prev;
      });
    };

    try {
      const res = await api<{ ok?: boolean; mode: "cloud" | "relay"; reply?: string; queryId?: string }>(
        state,
        "ai/chat",
        json({ prompt: clean, history: messages.slice(-10), messages: nextMessages, model })
      );

      if (res.mode === "cloud" && typeof res.reply === "string") {
        persistReply(res.reply);
        return;
      }

      if (res.mode === "relay" && res.queryId) {
        const deadline = Date.now() + (model === "powerful" ? 140000 : 55000);
        while (Date.now() < deadline && mountedRef.current) {
          await new Promise((r) => setTimeout(r, 1200));
          if (!mountedRef.current) return;
          const poll = await api<{ state: "pending" | "done" | "failed"; reply?: string | null }>(
            state,
            "ai/query/" + encodeURIComponent(res.queryId)
          );
          if (poll.state === "done") {
            if (typeof poll.reply === "string" && poll.reply.trim().length > 0) {
              persistReply(poll.reply);
              return;
            }
            throw new Error("Masaüstü ACK AI yanıt üretemedi.");
          }
          if (poll.state === "failed") {
            throw new Error(poll.reply?.trim() || "Masaüstü ACK AI yanıt üretemedi.");
          }
        }
        if (!mountedRef.current) return;
        throw new Error(
          "Masaüstü zamanında yanıt vermedi. 7/24 kullanım için bilgisayarında ACKDeck Masaüstü › Ayarlar › Telefon › Mobil ACK AI (7/24) Etkinleştir adımını kullanabilirsin.",
        );
      }
    } catch (err) {
      if (mountedRef.current) {
        onError(err instanceof Error ? err.message : "ACK AI yanıt veremedi.");
      }
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }

  const readyModeLabel = cloudKeyConfigured
    ? "☁️ 7/24 Bulut"
    : online
      ? "💻 PC Canlı"
      : "🔑 7/24 Durum";

  return (
    <section className="mobile-ai-chat-card" aria-label="Mobil ACK AI Sohbeti">
      <div className="mobile-ai-topbar">
        <div className="mobile-ai-status-row">
          <button
            type="button"
            className={`mobile-ai-mode-badge ${cloudKeyConfigured || online ? "is-ready" : "is-warn"}`}
            onClick={() => {
              setShowKeySetup((v) => !v);
              setShowHistory(false);
            }}
            title="7/24 Bulut ACK AI durumunu görüntüle"
          >
            {readyModeLabel}
          </button>
          {!cloudKeyConfigured && !online && (
            <button
              type="button"
              className="mobile-ai-key-btn"
              onClick={() => {
                setShowKeySetup((v) => !v);
                setShowHistory(false);
              }}
            >
              ℹ️ 7/24 Bilgi
            </button>
          )}
        </div>
        <div className="mobile-ai-controls">
          <select
            aria-label="ACK AI Modeli"
            value={model}
            disabled={sending}
            onChange={(e) => setModel(e.target.value as "fast" | "powerful")}
            className="mobile-ai-model-select"
          >
            <option value="fast">⚡ Hızlı</option>
            <option value="powerful">🧠 Güçlü</option>
          </select>
          <button
            type="button"
            className={`mobile-ai-history-btn ${showHistory ? "is-active" : ""}`}
            onClick={() => {
              setShowHistory((v) => !v);
              setShowKeySetup(false);
            }}
            title={`Geçmiş Sohbetler (${threads.length})`}
          >
            📜 Geçmiş
          </button>
          {(messages.length > 0 || activeThreadId) && (
            <button
              type="button"
              className="mobile-ai-clear-btn"
              disabled={sending}
              onClick={startNewChat}
              title="Yeni sohbet başlat"
            >
              + Yeni
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="mobile-ai-history-drawer">
          <div className="mobile-ai-history-header">
            <strong>Geçmiş Sohbetler ({threads.length})</strong>
            <button
              type="button"
              className="mobile-ai-new-thread-btn"
              onClick={startNewChat}
            >
              + Yeni Sohbet
            </button>
          </div>
          {threads.length === 0 ? (
            <p className="mobile-ai-history-empty">Henüz kaydedilmiş sohbet yok.</p>
          ) : (
            <div className="mobile-ai-history-list">
              {threads.map((t) => (
                <div
                  key={t.id}
                  className={`mobile-ai-history-item ${t.id === activeThreadId ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="mobile-ai-history-item-main"
                    onClick={() => selectThread(t.id)}
                  >
                    <span className="mobile-ai-history-item-title">{t.title || "İsimsiz Sohbet"}</span>
                    <span className="mobile-ai-history-item-meta">
                      {new Date(t.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {t.messages.length} mesaj
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mobile-ai-history-item-del"
                    aria-label="Sohbeti sil"
                    onClick={() => deleteThread(t.id)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showKeySetup && (
        <div className="mobile-ai-key-drawer" role="status">
          <p className="mobile-ai-status-line">
            {cloudKeyConfigured === true
              ? "Durum: ☁️ 7/24 Bulut AI etkin. Bilgisayarın kapalıyken bile telefondan doğrudan yanıt alabilirsin."
              : cloudKeyConfigured === false
                ? "Durum: 💻 Yalnızca PC canlı bağlantısı etkin (7/24 Bulut AI kapalı)."
                : "Durum kontrol ediliyor…"}
          </p>
          <p className="mobile-work-hint" style={{ margin: 0 }}>
            Güvenlik nedeniyle 7/24 Bulut AI anahtarı yalnızca sahip masaüstünden yönetilir. Etkinleştirmek veya kaldırmak için bilgisayarında{" "}
            <strong>ACKDeck Masaüstü › Ayarlar › Telefon › Mobil ACK AI (7/24) Etkinleştir</strong> bölümünü kullan. Gemini API anahtarı telefonda saklanmaz.
          </p>
        </div>
      )}

      <div className="mobile-ai-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mobile-ai-empty">
            <strong>Merhaba Alican, ne sormak istersin?</strong>
            <p>Görevlerin, ders çalışma durumların, notların, aboneliklerin ve Koleksiyon kayıtların bağlama dahildir.</p>
            <div className="mobile-ai-starters">
              {QUICK_STARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  className="mobile-ai-starter-chip"
                  onClick={() => void sendPrompt(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div key={idx} className={`mobile-ai-bubble-row is-${m.role}`}>
              <div className={`mobile-ai-bubble is-${m.role}`}>
                {m.text.split("\n").map((line, i) => (
                  <p key={i}>{line || "\u00A0"}</p>
                ))}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="mobile-ai-bubble-row is-model">
            <div className="mobile-ai-bubble is-model is-loading">ACK AI düşünüyor…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mobile-ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void sendPrompt(draft);
        }}
      >
        <input
          type="text"
          value={draft}
          disabled={sending}
          maxLength={4000}
          placeholder="ACK AI'a sor..."
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          Gönder
        </button>
      </form>
    </section>
  );
}
