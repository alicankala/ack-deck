import { useState, type Dispatch, type SetStateAction } from "react";
import { MobileAiChat } from "./MobileAiChat";
import { SendCard } from "./SendCard";
import { api, type MobileState } from "./store";
import { Icon } from "./Icon";

export type MobileInboxItem = {
  id: string;
  kind: string;
  title: string;
  content: string;
  mime: string | null;
  expiresAt: number | null;
  size?: number | null;
  handled: number;
};

interface MobileSendViewProps {
  sendTab: "ai" | "send";
  setSendTab: (tab: "ai" | "send") => void;
  state: MobileState;
  online: boolean;
  busy: boolean;
  sending: boolean;
  recording: boolean;
  audio: Blob | null;
  sendFeedback: string;
  selectedFile: File | null;
  inboxLoaded: boolean;
  inbox: MobileInboxItem[];
  setInbox: Dispatch<SetStateAction<MobileInboxItem[]>>;
  onOpenSettings: () => void;
  onSelectFile: (file: File | null) => void;
  onOpenForm: (kind: "text" | "link" | "ai_prompt") => void;
  onUploadFile: (file: File | Blob, filename: string) => Promise<boolean>;
  onToggleRecord: () => void;
  onCancelAudio: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

export function MobileSendView({
  sendTab,
  setSendTab,
  state,
  online,
  busy,
  sending,
  recording,
  audio,
  sendFeedback,
  selectedFile,
  inboxLoaded,
  inbox,
  setInbox,
  onOpenSettings,
  onSelectFile,
  onOpenForm,
  onUploadFile,
  onToggleRecord,
  onCancelAudio,
  onNotice,
  onError,
}: MobileSendViewProps) {
  const [editingInboxId, setEditingInboxId] = useState<string | null>(null);
  const [editingInboxText, setEditingInboxText] = useState("");

  return (
    <div className="more-sections-container">
      <div className="send-tab-header">
        <div>
          <h2>{sendTab === "ai" ? "ACK AI Sohbeti" : "Masaüstüne Gönder"}</h2>
          <p className="mobile-work-hint">
            {sendTab === "ai"
              ? "Kayıtlarınla doğrudan telefondan konuş; PC kapalıyken de çalışır."
              : "Not, bağlantı, ses veya dosyanı bilgisayarına anında ilet."}
          </p>
        </div>
        <button
          type="button"
          className="settings-open-btn"
          onClick={onOpenSettings}
          title="Ayarlar"
        >
          <Icon name="settings" size={18} />
          <span>Ayarlar</span>
        </button>
      </div>

      <div className="mobile-segmented-bar plan-toggle-bar">
        <button
          type="button"
          className={`segment-btn ${sendTab === "ai" ? "is-active" : ""}`}
          onClick={() => setSendTab("ai")}
        >
          💬 ACK AI Sohbet
        </button>
        <button
          type="button"
          className={`segment-btn ${sendTab === "send" ? "is-active" : ""}`}
          onClick={() => setSendTab("send")}
        >
          📤 PC'ye Gönder
        </button>
      </div>

      {sendTab === "ai" ? (
        <MobileAiChat
          state={state}
          online={online}
          onNotice={onNotice}
          onError={onError}
        />
      ) : (
        <section className="more-section-card">
          <SendCard
            busy={busy || sending}
            recording={recording}
            audio={audio}
            feedback={sendFeedback}
            file={selectedFile}
            onSelectFile={onSelectFile}
            onOpen={onOpenForm}
            onFile={file => onUploadFile(file, file.name)}
            onRecord={onToggleRecord}
            onAudioSend={() => {
              if (audio) {
                void onUploadFile(
                  audio,
                  `Sesli-not.${audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm"}`
                );
              }
            }}
            onAudioCancel={onCancelAudio}
          />
          {inboxLoaded && inbox.length > 0 && (
            <details className="mobile-completed-accordion" style={{ marginTop: "0.75rem" }}>
              <summary>Gönderilenler ({inbox.length})</summary>
              <div className="sent-history-list" style={{ marginTop: "0.5rem" }}>
                {inbox.slice(0, 8).map(item => (
                  <article key={item.id} className="mobile-sent-card">
                    <div className="mobile-sent-header">
                      <h3>{item.title}</h3>
                      <span className={`sent-status-chip ${item.handled ? "is-handled" : "is-pending"}`}>
                        {item.handled ? "İşlendi" : "Bekliyor"}
                      </span>
                    </div>
                    {editingInboxId === item.id ? (
                      <div style={{ marginTop: "0.5rem" }}>
                        <textarea
                          value={editingInboxText}
                          onChange={e => setEditingInboxText(e.target.value)}
                          className="mobile-textarea"
                          rows={3}
                          style={{ width: "100%", borderRadius: "8px", padding: "8px", fontSize: "16px", boxSizing: "border-box" }}
                        />
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", marginTop: "6px" }}>
                          <button
                            type="button"
                            className="mobile-button-secondary"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
                            onClick={() => setEditingInboxId(null)}
                          >
                            Vazgeç
                          </button>
                          <button
                            type="button"
                            className="mobile-button-primary"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
                            onClick={async () => {
                              const trimmed = editingInboxText.trim();
                              if (!trimmed) {
                                onError("İçerik boş olamaz.");
                                return;
                              }
                              const nextTitle = trimmed.split("\n")[0].slice(0, 100);
                              try {
                                await api(state, "inbox/" + item.id, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ title: nextTitle, content: trimmed }),
                                });
                                setInbox(cur =>
                                  cur.map(row => (row.id === item.id ? { ...row, title: nextTitle, content: trimmed } : row))
                                );
                                setEditingInboxId(null);
                                onNotice("Gönderi güncellendi.");
                              } catch (err) {
                                onError(err instanceof Error ? err.message : "Güncellenemedi.");
                              }
                            }}
                          >
                            Kaydet
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mobile-sent-actions" style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", justifyContent: "flex-end", alignItems: "center" }}>
                        {item.content && (
                          <button
                            type="button"
                            className="mobile-button-secondary"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
                            onClick={() => {
                              void navigator.clipboard.writeText(item.content);
                              onNotice("Metin kopyalandı.");
                            }}
                          >
                            Kopyala
                          </button>
                        )}
                        <button
                          type="button"
                          className="mobile-button-secondary"
                          style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
                          onClick={() => {
                            setEditingInboxId(item.id);
                            setEditingInboxText(item.content || item.title);
                          }}
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          className="mobile-button-secondary"
                          style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem", color: "#f87171", borderColor: "rgba(248, 113, 113, 0.3)" }}
                          onClick={() => {
                            if (!window.confirm("Bu gönderi silinsin mi?")) return;
                            void api(state, "inbox/" + item.id, { method: "DELETE" })
                              .then(() => {
                                setInbox(cur => cur.filter(row => row.id !== item.id));
                                onNotice("Gönderi silindi.");
                              })
                              .catch(e => onError(e instanceof Error ? e.message : "Silinemedi."));
                          }}
                        >
                          Sil
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
