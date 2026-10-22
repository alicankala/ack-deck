import { inboxToTask, inboxToNote } from "../inboxProcessing";
import { saveInboxIndex } from "../productIntelligence";
import { recordActivity } from "../activityStore";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cachePhoneFile, downloadPhoneFile, phoneRequest, phoneAiAttachment } from "../phoneClient";
import type { AiAttachment } from "../aiAttachments";
import type { NoteAttachment } from "../notesStore";
import { validUrl } from "../../shared/phone";
import { PhoneMedia } from "./PhoneMedia";

type Inbox = {
  id: string;
  kind: string;
  title: string;
  content: string;
  mime: string | null;
  size: number | null;
  expiresAt: number | null;
  handled: number;
  createdAt: number;
};

const isAudio = (item: Inbox) => item.mime?.startsWith("audio/");
const fileInfo = (item: Inbox): NoteAttachment => ({ id: item.id, name: item.title, mime: item.mime ?? "", size: item.size ?? 0 });

export function PhoneInbox({
  onAiDraft,
  initialId,
}: {
  onAiDraft: (text: string, attachment?: AiAttachment) => void;
  initialId?: string;
}) {
  const [items, setItems] = useState<Inbox[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"pending" | "handled" | "all">("pending");
  const [preview, setPreview] = useState<Inbox | null>(null);
  const operation = useRef(false);

  async function refresh() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const rows = (await phoneRequest<{ items: Inbox[] }>("inbox")).items;
      setItems(rows);
      saveInboxIndex(rows);
      setError("");
    } catch {
      setError("Telefon gelenleri alınamadı. Entegrasyonu ve internet bağlantısını kontrol edin.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (initialId) {
      document.getElementById("inbox-" + initialId)?.scrollIntoView({ block: "center" });
    }
  }, [initialId, items]);

  async function action(fn: () => Promise<unknown>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (reason) {
      setError(typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "İşlem tamamlanamadı.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function toggleHandled(item: Inbox) {
    const nextHandled = item.handled ? 0 : 1;
    await action(async () => {
      await phoneRequest("handled", { id: item.id });
      setItems(rows => {
        const next = rows.map(r => (r.id === item.id ? { ...r, handled: nextHandled } : r));
        saveInboxIndex(next);
        return next;
      });
      recordActivity({
        source: "inbox",
        recordId: item.id,
        label: item.title,
        kind: nextHandled ? "processed" : "updated",
      });
      setNotice(nextHandled ? "İşlendi olarak işaretlendi." : "Bekliyor durumuna alındı.");
    });
  }

  async function markAllHandled() {
    const unhandled = items.filter(i => !i.handled);
    if (!unhandled.length) return;
    await action(async () => {
      for (const item of unhandled) {
        await phoneRequest("handled", { id: item.id }).catch(() => {});
      }
      setItems(rows => {
        const next = rows.map(r => ({ ...r, handled: 1 }));
        saveInboxIndex(next);
        return next;
      });
      setNotice(`${unhandled.length} öğe işlendi olarak işaretlendi.`);
    });
  }

  async function handleQuickToTask(item: Inbox) {
    await action(async () => {
      inboxToTask({ sourceId: item.id, title: item.title, content: item.content });
      if (!item.handled) {
        await phoneRequest("handled", { id: item.id }).catch(() => {});
        setItems(rows => {
          const next = rows.map(r => (r.id === item.id ? { ...r, handled: 1 } : r));
          saveInboxIndex(next);
          return next;
        });
      }
      setNotice("Görevlere eklendi ve işlendi olarak işaretlendi.");
    });
  }

  async function handleQuickToNote(item: Inbox) {
    await action(async () => {
      const attachments = item.kind === "file" ? [await cachePhoneFile(item.id, item.title)] : undefined;
      inboxToNote({ sourceId: item.id, title: item.title, content: item.kind === "file" ? "" : item.content, attachment: attachments?.[0] });
      if (!item.handled) {
        await phoneRequest("handled", { id: item.id }).catch(() => {});
        setItems(rows => {
          const next = rows.map(r => (r.id === item.id ? { ...r, handled: 1 } : r));
          saveInboxIndex(next);
          return next;
        });
      }
      setNotice("Notlara kaydedildi ve işlendi olarak işaretlendi.");
    });
  }

  async function handleSendToAi(item: Inbox) {
    await action(async () => {
      let attachment: AiAttachment | undefined;
      if (item.kind === "file" && ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"].includes(item.mime ?? "")) {
        await cachePhoneFile(item.id, item.title);
        attachment = await phoneAiAttachment(item.id);
      } else if (isAudio(item)) {
        await cachePhoneFile(item.id, item.title);
        attachment = await phoneAiAttachment(item.id);
      }

      const promptText = `Bana mobilden şöyle bir not/istek bırakmıştın:
> "${item.content || item.title}"

Bu notu değerlendir. Eğer analiz edebileceğin, özet çıkarabileceğin, araştırabileceğin veya görevlere dönüştürebileceğin bir konuysa doğrudan işle ve sonucunu üret. Eğer doğrudan aksiyon alınamayacak kişisel bir hatırlatma veya bilgi notuysa samimi bir dille "Hacı sen buraya atmıştın, haberin olsun, unutma!" diyerek içeriği bana hatırlat.`;

      if (!item.handled) {
        await phoneRequest("handled", { id: item.id }).catch(() => {});
        setItems(rows => {
          const next = rows.map(r => (r.id === item.id ? { ...r, handled: 1 } : r));
          saveInboxIndex(next);
          return next;
        });
      }

      onAiDraft(promptText, attachment);
    });
  }

  async function deleteInboxItem(item: Inbox) {
    if (!window.confirm("Bu gelen buluttan silinsin mi? Notlara veya görevlere eklenmiş kayıtlar silinmez.")) return;
    await action(async () => {
      await phoneRequest("delete_inbox", { id: item.id });
      setItems(rows => {
        const next = rows.filter(r => r.id !== item.id);
        saveInboxIndex(next);
        return next;
      });
      if (preview?.id === item.id) setPreview(null);
      setNotice("Kayıt silindi.");
    });
  }

  const pendingItems = items.filter(i => !i.handled);
  const handledItems = items.filter(i => !!i.handled);
  const displayedItems = filter === "pending" ? pendingItems : filter === "handled" ? handledItems : items;

  return (
    <section className="hub-page inbox-page" data-navigation-dirty={busy ? "true" : undefined}>
      <header className="feature-heading page-header">
        <div>
          <h1>Gelenler</h1>
          <p>Telefondan gönderdiğin sesli notlar, mesajlar ve dosyaları görüntüle ve yönet.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {pendingItems.length > 0 && (
            <button className="button button-secondary" disabled={busy} onClick={() => void markAllHandled()}>
              Tümünü İşlendi Yap
            </button>
          )}
          <button className="button button-secondary" disabled={busy} onClick={() => void refresh()}>
            Yenile
          </button>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="inbox-filter-bar" style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <button
          type="button"
          className={`button ${filter === "pending" ? "button-primary" : "button-secondary"}`}
          onClick={() => setFilter("pending")}
        >
          Bekleyenler ({pendingItems.length})
        </button>
        <button
          type="button"
          className={`button ${filter === "handled" ? "button-primary" : "button-secondary"}`}
          onClick={() => setFilter("handled")}
        >
          İşlenenler ({handledItems.length})
        </button>
        <button
          type="button"
          className={`button ${filter === "all" ? "button-primary" : "button-secondary"}`}
          onClick={() => setFilter("all")}
        >
          Tümü ({items.length})
        </button>
      </div>

      {error && <p className="feedback error" role="alert">{error}</p>}
      {notice && <p className="feedback" role="status">{notice}</p>}

      {!displayedItems.length && !error && (
        <div className="surface" style={{ padding: "2.5rem", textAlign: "center", borderRadius: "1rem", color: "var(--app-muted)" }}>
          <p>{filter === "pending" ? "Bekleyen yeni gelen içerik yok." : filter === "handled" ? "İşlenmiş içerik bulunmuyor." : "Gelen kutusu boş."}</p>
        </div>
      )}

      <div className="inbox-grid">
        {displayedItems.map(item => {
          const expired = !!item.expiresAt && item.expiresAt < Date.now();
          return (
            <article
              id={"inbox-" + item.id}
              className={`surface hub-card inbox-card ${initialId === item.id ? "record-highlight" : ""} ${item.handled ? "is-handled" : ""}`}
              key={item.id}
              style={{ opacity: item.handled ? 0.75 : 1 }}
            >
              <div className="inbox-card-heading">
                <span className="inbox-kind">
                  {item.kind === "file"
                    ? isAudio(item)
                      ? "Sesli not"
                      : item.mime === "application/pdf"
                      ? "PDF"
                      : item.mime?.startsWith("image/")
                      ? "Fotoğraf"
                      : "Dosya"
                    : item.kind === "link"
                    ? "Bağlantı"
                    : item.kind === "ai_prompt"
                    ? "ACK AI Mesajı"
                    : "Metin"}
                </span>
                <span
                  className="inbox-status-pill"
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.5rem",
                    borderRadius: "0.4rem",
                    background: item.handled ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                    color: item.handled ? "#10b981" : "#f59e0b",
                  }}
                >
                  {item.handled ? "✓ İşlendi" : "Bekliyor"}
                </span>
              </div>

              <h2 style={{ fontSize: "1.1rem", margin: "0.25rem 0" }}>{item.title}</h2>
              <time style={{ fontSize: "0.78rem", color: "var(--app-muted)" }}>
                {new Date(item.createdAt).toLocaleString("tr-TR")}
              </time>

              {item.kind === "file" ? (
                <p>
                  {item.size ? `${Math.ceil(item.size / 1024)} KB · ` : ""}
                  {expired ? "Buluttaki saklama süresi dolmuş." : "Bulutta 30 gün saklanır."}
                </p>
              ) : (
                <p className="phone-inbox-content" style={{ margin: "0.5rem 0", fontSize: "0.92rem", lineHeight: 1.5 }}>
                  {item.content}
                </p>
              )}

              {preview?.id === item.id && <PhoneMedia file={fileInfo(item)} />}

              <div className="hub-actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "auto", paddingTop: "0.75rem", borderTop: "1px solid var(--app-border)" }}>
                {/* 1. Handled Toggle Button */}
                <button
                  type="button"
                  className={`button ${item.handled ? "button-secondary" : "button-primary"}`}
                  disabled={busy}
                  onClick={() => void toggleHandled(item)}
                  title={item.handled ? "Bekliyor durumuna geri al" : "İşlendi olarak işaretle"}
                >
                  {item.handled ? "Geri Al" : "✓ İşlendi"}
                </button>

                {/* 2. ACK AI Action */}
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void handleSendToAi(item)}
                  title="ACK AI'da aç ve işle"
                  style={{ borderColor: "var(--app-accent)", color: "var(--app-accent)" }}
                >
                  🤖 ACK AI ile İşle
                </button>

                {/* 3. Quick Note Action */}
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void handleQuickToNote(item)}
                  title="Not olarak kaydet ve işlendi yap"
                >
                  📝 Not Yap
                </button>

                {/* 4. Quick Task Action */}
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void handleQuickToTask(item)}
                  title="Görev olarak kaydet ve işlendi yap"
                >
                  ✓ Görev Yap
                </button>

                {/* 5. Special File / Link Controls */}
                {item.kind === "file" && (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setPreview(preview?.id === item.id ? null : item)}
                  >
                    {preview?.id === item.id ? "Kapat" : isAudio(item) ? "Dinle" : "Önizle"}
                  </button>
                )}
                {item.kind === "file" && !expired && (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => void action(async () => {
                      if (await downloadPhoneFile(item.id, item.title)) setNotice("Dosya bilgisayara indirildi.");
                    })}
                  >
                    İndir
                  </button>
                )}
                {item.kind === "link" && (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy || !validUrl(item.content)}
                    onClick={() => void action(() => openUrl(item.content))}
                  >
                    Bağlantıyı Aç
                  </button>
                )}
                {item.kind !== "file" && item.kind !== "link" && (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => void action(async () => {
                      await navigator.clipboard.writeText(item.content);
                      setNotice("Metin kopyalandı.");
                    })}
                  >
                    Kopyala
                  </button>
                )}

                {/* 6. Delete Action */}
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void deleteInboxItem(item)}
                  title="Bulut kaydını sil"
                  style={{ marginLeft: "auto", color: "#f87171" }}
                >
                  Sil
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
