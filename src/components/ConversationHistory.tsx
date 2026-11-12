import { EditorDialog } from "./EditorDialog";
import { ActionMenu } from "./ActionMenu";
import { useState } from "react";
import { searchConversations, type Conversation } from "../conversationStore";
import type { useConversations } from "../useConversations";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function conversationPreview(thread: Conversation): string {
  for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
    const text = thread.messages[i]?.text.trim();
    if (text) return text.replace(/\s+/g, " ");
  }
  return "Henüz mesaj yok — yazmaya başla";
}

export function ConversationHistory({ history, disabled }: { history: ReturnType<typeof useConversations>; disabled: boolean }) {
  disabled = disabled || history.mutating;
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState("");
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState("");
  const visible = searchConversations(history.threads, query);
  const hasSearch = query.trim().length > 0;

  return (
    <aside className="conversation-history surface" aria-label="Sohbet geçmişi">
      <div className="ai-sidebar-top">
        <div className="ai-search-wrap">
          <span className="ai-search-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <label className="sr-only" htmlFor="conversation-search">Sohbetlerde ara</label>
          <input
            id="conversation-search"
            className="ai-search-input"
            value={query}
            placeholder="Sohbetlerde ara..."
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="ai-search-clear"
              onClick={() => setQuery("")}
              aria-label="Aramayı temizle"
            >
              ×
            </button>
          )}
        </div>

        <div className="ai-sidebar-meta">
          <span>
            {hasSearch
              ? `${visible.length} / ${history.threads.length} eşleşme`
              : `${history.threads.length} kayıtlı sohbet`}
          </span>
        </div>
      </div>

      <div className="ai-conversation-list">
        {visible.length > 0 ? (
          visible.map((thread) => {
            const isActive = history.activeId === thread.id;
            const messageCount = thread.messages.length;

            return (
              <div
                className={`conversation-item ${isActive ? "is-active" : ""}`}
                key={thread.id}
              >
                <button
                  type="button"
                  disabled={disabled}
                  aria-current={isActive ? "true" : undefined}
                  className={`conversation-card ${isActive ? "selected" : ""}`}
                  onClick={() => history.select(thread.id)}
                  title={thread.title}
                >
                  <strong>{thread.title}</strong>
                  <span className="conversation-card-excerpt">{conversationPreview(thread)}</span>
                  <div className="conversation-card-meta">
                    <time dateTime={new Date(thread.updatedAt).toISOString()}>
                      {dateFormatter.format(thread.updatedAt)}
                    </time>
                    <span className={`conversation-card-count ${messageCount === 0 ? "is-empty" : ""}`}>
                      {messageCount > 0 ? `${messageCount} mesaj` : "Yeni"}
                    </span>
                  </div>
                </button>

                <div className="conversation-card-menu">
                  <ActionMenu label={thread.title + " işlemleri"}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setEditing(thread.id);
                        setTitle(thread.title);
                      }}
                    >
                      Adlandır
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setDeleting(thread.id)}
                    >
                      Sil
                    </button>
                  </ActionMenu>
                </div>

                {editing === thread.id && (
                  <EditorDialog
                    title={thread.title}
                    onClose={() => setEditing("")}
                    busy={disabled}
                    error={history.error}
                  >
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void history.rename(thread.id, title);
                        setEditing("");
                      }}
                    >
                      <label className="sr-only" htmlFor="conversation-title">Sohbet başlığı</label>
                      <input
                        id="conversation-title"
                        value={title}
                        maxLength={200}
                        onChange={(event) => setTitle(event.target.value)}
                        autoFocus
                      />
                      <div className="settings-actions">
                        <button type="submit" className="button button-primary" disabled={disabled}>Kaydet</button>
                        <button type="button" className="button button-secondary" onClick={() => setEditing("")}>İptal</button>
                      </div>
                    </form>
                  </EditorDialog>
                )}

                {deleting === thread.id && (
                  <div className="conversation-delete-confirm" role="alert">
                    <p>Yalnızca bu sohbet silinsin mi?</p>
                    <div className="conversation-delete-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={disabled}
                        onClick={() => {
                          void history.remove(thread.id);
                          setDeleting("");
                        }}
                      >
                        Sohbeti sil
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setDeleting("")}
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="ai-empty-list-box">
            <p>{hasSearch ? "Aramayla eşleşen sohbet yok." : history.ready ? "Henüz kayıtlı sohbet yok." : "Sohbetler yükleniyor..."}</p>
            {hasSearch && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setQuery("")}
              >
                Aramayı temizle
              </button>
            )}
          </div>
        )}

        {history.error && (
          <div className="ai-sidebar-error" role="alert">
            <p>{history.error}</p>
            <div className="conversation-delete-actions">
              <button type="button" className="button button-secondary" onClick={history.retry}>
                Kaydetmeyi tekrar dene
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
