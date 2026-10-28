import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, json, type MobileState } from "./store";

type ChatMsg = {
  role: "user" | "model";
  text: string;
};

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
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<"fast" | "powerful">("fast");
  const [sending, setSending] = useState(false);
  const [cloudKeyConfigured, setCloudKeyConfigured] = useState<boolean | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function saveCloudKey(e: FormEvent) {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed || savingKey) return;
    setSavingKey(true);
    onError("");
    try {
      await api(state, "ai/key", json({ apiKey: trimmed }));
      setKeyInput("");
      setCloudKeyConfigured(true);
      setShowKeySetup(false);
      onNotice("7/24 Bulut ACK AI etkinleştirildi.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Anahtar kaydedilemedi.");
    } finally {
      setSavingKey(false);
    }
  }

  async function removeCloudKey() {
    if (savingKey || !window.confirm("Buluttaki şifreli Gemini anahtarı kaldırılsın mı?")) return;
    setSavingKey(true);
    try {
      await api(state, "ai/key", { method: "DELETE" });
      setCloudKeyConfigured(false);
      setShowKeySetup(false);
      onNotice("Bulut AI anahtarı kaldırıldı.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Anahtar silinemedi.");
    } finally {
      setSavingKey(false);
    }
  }

  async function sendPrompt(textToSend: string) {
    const clean = textToSend.trim();
    if (!clean || sending) return;
    if (!navigator.onLine) {
      onError("ACK AI sohbeti için internet bağlantısı gerekir.");
      return;
    }
    onError("");
    const nextMessages: ChatMsg[] = [...messages, { role: "user" as const, text: clean }].slice(-20);
    setMessages(nextMessages);
    setDraft("");
    setSending(true);

    try {
      const res = await api<{ mode: "cloud" | "relay"; reply?: string; queryId?: string }>(
        state,
        "ai/chat",
        json({ messages: nextMessages, model })
      );

      if (res.mode === "cloud" && typeof res.reply === "string") {
        if (mountedRef.current) {
          setMessages((cur) => [...cur, { role: "model", text: res.reply! }]);
        }
        return;
      }

      if (res.mode === "relay" && res.queryId) {
        const deadline = Date.now() + 36000;
        while (Date.now() < deadline && mountedRef.current) {
          await new Promise((r) => setTimeout(r, 1200));
          const poll = await api<{ status: string; reply?: string | null; error?: string | null }>(
            state,
            "ai/query/" + encodeURIComponent(res.queryId)
          );
          if (poll.status === "done" && poll.reply) {
            if (mountedRef.current) {
              setMessages((cur) => [...cur, { role: "model", text: poll.reply! }]);
            }
            return;
          }
          if (poll.status === "error") {
            throw new Error(poll.error || "Masaüstü ACK AI yanıt üretemedi.");
          }
        }
        throw new Error("Masaüstü zamanında yanıt vermedi. 7/24 kullanım için Bulut AI anahtarı ekleyebilirsin.");
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
    ? "☁️ 7/24 Bulut AI Hazır"
    : online
      ? "💻 PC Üzerinden Canlı"
      : "🔑 PC Kapalı — Anahtar Gerekli";

  return (
    <section className="mobile-ai-chat-card" aria-label="Mobil ACK AI Sohbeti">
      <div className="mobile-ai-topbar">
        <div className="mobile-ai-status-row">
          <span className={`mobile-ai-mode-badge ${cloudKeyConfigured || online ? "is-ready" : "is-warn"}`}>
            {readyModeLabel}
          </span>
          <button
            type="button"
            className="mobile-ai-key-btn"
            onClick={() => setShowKeySetup((v) => !v)}
          >
            {cloudKeyConfigured ? "🔑 7/24 Ayarı" : "🔑 7/24 Aç"}
          </button>
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
          {messages.length > 0 && (
            <button
              type="button"
              className="mobile-ai-clear-btn"
              disabled={sending}
              onClick={() => setMessages([])}
            >
              Yeni
            </button>
          )}
        </div>
      </div>

      {showKeySetup && (
        <div className="mobile-ai-key-drawer">
          <p className="mobile-work-hint" style={{ margin: "0 0 8px" }}>
            PC kapalıyken de 7/24 doğrudan yanıt almak için Gemini API anahtarını AES-GCM şifreli bulut kasasına kaydedebilir veya masaüstünde <strong>Ayarlar → Telefon → Mobil ACK AI (7/24) Etkinleştir</strong> düğmesine basabilirsin. Anahtar telefonda saklanmaz.
          </p>
          <form onSubmit={(e) => void saveCloudKey(e)} className="mobile-ai-key-form">
            <input
              type="password"
              autoComplete="off"
              placeholder="Gemini API anahtarı..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button type="submit" disabled={savingKey || !keyInput.trim()}>
              {savingKey ? "…" : "Kaydet"}
            </button>
          </form>
          {cloudKeyConfigured && (
            <button
              type="button"
              className="danger-action"
              style={{ marginTop: "6px", fontSize: "12px", minHeight: "34px" }}
              disabled={savingKey}
              onClick={() => void removeCloudKey()}
            >
              Buluttaki Anahtarı Kaldır
            </button>
          )}
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
