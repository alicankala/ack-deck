import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { saveInboxIndex } from "../productIntelligence";
import { recordActivity } from "../activityStore";
import { downloadPhoneFile, phoneRequest } from "../phoneClient";
import type { NoteAttachment } from "../notesStore";
import { validUrl } from "../../shared/phone";
import {
  filterInboxItems,
  formatInboxFileSize,
  formatInboxSnippet,
  getInboxTypeCategory,
  getInboxTypeLabel,
  isAudioInboxItem,
  resolveInitialInboxTab,
  summarizeInboxItems,
  type InboxItem,
  type InboxStatusTab,
  type InboxTypeFilter,
} from "../inboxHelpers";
import { PhoneMedia } from "./PhoneMedia";
import "./phoneInbox.css";

const TYPE_CHIP_OPTIONS: { id: InboxTypeFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "text", label: "Metin" },
  { id: "link", label: "Bağlantı" },
  { id: "audio", label: "Ses" },
  { id: "image", label: "Görsel" },
  { id: "file", label: "Dosya" },
];

const KIND_ICONS: Record<Exclude<InboxTypeFilter, "all">, string> = {
  text: "💬",
  link: "🔗",
  audio: "🎙️",
  image: "🖼️",
  file: "📎",
};

const fileInfo = (item: InboxItem): NoteAttachment => ({
  id: item.id,
  name: item.title,
  mime: item.mime ?? "",
  size: item.size ?? 0,
});

function ExpandableInboxText({
  text,
  expanded,
  onToggle,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => {
      setOverflowing(el.scrollHeight > el.clientHeight + 2);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="inbox-card-body">
      <p
        ref={textRef}
        className={`phone-inbox-content ${expanded ? "is-expanded" : "is-clamped"}`}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          className="inbox-expand-btn"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? "Daralt ▴" : "Devamını gör ▾"}
        </button>
      )}
    </div>
  );
}

export function PhoneInbox({
  onAiDraft: _onAiDraft,
  initialId,
}: {
  onAiDraft?: (text: string, attachment?: import("../aiAttachments").AiAttachment) => void;
  initialId?: string;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<InboxStatusTab>("pending");
  const [typeFilter, setTypeFilter] = useState<InboxTypeFilter>("all");
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<InboxItem | null>(null);

  const operation = useRef(false);
  const hasUserSelectedTab = useRef(false);
  const hasAppliedInitialTab = useRef(false);
  const handledInitialIdRef = useRef<string | undefined>(undefined);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function refresh() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const rows = (await phoneRequest<{ items: InboxItem[] }>("inbox")).items;
      setItems(rows);
      saveInboxIndex(rows);
      if (!hasAppliedInitialTab.current && !hasUserSelectedTab.current) {
        hasAppliedInitialTab.current = true;
        setFilter(resolveInitialInboxTab(rows, initialId));
      }
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
    if (!initialId || !items.length || handledInitialIdRef.current === initialId) return;
    handledInitialIdRef.current = initialId;
    const target = items.find(i => i.id === initialId);
    if (target) {
      setFilter(target.handled ? "all" : "pending");
      setTypeFilter("all");
      setQuery("");
    }
    requestAnimationFrame(() => {
      document.getElementById("inbox-" + initialId)?.scrollIntoView({ block: "center" });
    });
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

  function selectStatusTab(nextTab: InboxStatusTab) {
    hasUserSelectedTab.current = true;
    setFilter(nextTab);
  }

  async function toggleHandled(item: InboxItem) {
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
      const markedIds = new Set<string>();
      for (const item of unhandled) {
        try {
          await phoneRequest("handled", { id: item.id });
          markedIds.add(item.id);
        } catch {
          // Kısmi başarısızlıklarda kalanlar korunur
        }
      }
      if (!markedIds.size) {
        throw new Error("Öğeler işlendi olarak işaretlenemedi. Bağlantıyı kontrol edin.");
      }
      setItems(rows => {
        const next = rows.map(r => (markedIds.has(r.id) ? { ...r, handled: 1 } : r));
        saveInboxIndex(next);
        return next;
      });
      setNotice(
        markedIds.size === unhandled.length
          ? `${markedIds.size} öğe işlendi olarak işaretlendi.`
          : `${markedIds.size}/${unhandled.length} öğe işlendi; kalanlar için tekrar deneyin.`,
      );
    });
  }

  async function clearHandledItems() {
    const handledList = items.filter(i => !!i.handled);
    if (!handledList.length) return;
    if (
      !window.confirm(
        `${handledList.length} işlenmiş kayıt buluttan kalıcı olarak silinsin mi? Notlara veya görevlere eklenmiş veriler silinmez.`,
      )
    ) {
      return;
    }
    await action(async () => {
      const deletedIds = new Set<string>();
      for (const item of handledList) {
        try {
          await phoneRequest("delete_inbox", { id: item.id });
          deletedIds.add(item.id);
        } catch {
          // Kısmi başarısızlıklarda kalanlar korunur
        }
      }
      if (!deletedIds.size) {
        throw new Error("İşlenmiş kayıtlar silinemedi. Bağlantıyı kontrol edin.");
      }
      setItems(rows => {
        const next = rows.filter(r => !deletedIds.has(r.id));
        saveInboxIndex(next);
        return next;
      });
      if (preview && deletedIds.has(preview.id)) setPreview(null);
      setNotice(
        deletedIds.size === handledList.length
          ? `${deletedIds.size} işlenmiş kayıt temizlendi.`
          : `${deletedIds.size}/${handledList.length} kayıt temizlendi; kalanlar için tekrar deneyin.`,
      );
    });
  }

  async function deleteInboxItem(item: InboxItem) {
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

  async function copyItemText(item: InboxItem) {
    const payload = (item.content || item.title || "").trim();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setError("");
      setCopiedId(item.id);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedId(current => (current === item.id ? null : current));
        copyTimerRef.current = null;
      }, 1500);
    } catch {
      setError("Panoya kopyalama başarısız oldu.");
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const summary = useMemo(() => summarizeInboxItems(items), [items]);
  const { typeCounts, filteredItems } = useMemo(
    () => filterInboxItems(items, filter, typeFilter, query),
    [items, filter, typeFilter, query],
  );

  const hasActiveFilters = typeFilter !== "all" || query.trim().length > 0;
  const textAndLinkTotal = summary.counts.text + summary.counts.link;
  const mediaAndFileTotal = summary.counts.image + summary.counts.file;

  return (
    <section className="hub-page inbox-page" data-navigation-dirty={busy ? "true" : undefined}>
      <header className="feature-heading page-header inbox-page-header">
        <div>
          <h1>Gelenler</h1>
          <p>Telefondan gönderdiğin sesli notlar, mesajlar ve dosyaları görüntüle ve yönet.</p>
        </div>
        <div className="inbox-header-actions">
          {summary.pending > 0 && (
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => void markAllHandled()}>
              Tümünü İşlendi Yap
            </button>
          )}
          {summary.handled > 0 && (
            <button
              type="button"
              className="button button-secondary inbox-clear-handled-btn"
              disabled={busy}
              onClick={() => void clearHandledItems()}
            >
              İşlenenleri Temizle ({summary.handled})
            </button>
          )}
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => void refresh()}>
            Yenile
          </button>
        </div>
      </header>

      {/* Üstte 3'lü Kompakt Durum Şeridi */}
      <div className="inbox-kpi-grid" aria-label="Gelen kutusu özeti">
        <div className="inbox-kpi-card">
          <div className="inbox-kpi-header">
            <span className="inbox-kpi-label">Durum</span>
            <span className={`inbox-kpi-badge ${summary.pending > 0 ? "is-pending" : "is-clean"}`}>
              {summary.pending > 0 ? `${summary.pending} Bekliyor` : "Her şey işlendi ✓"}
            </span>
          </div>
          <div className="inbox-kpi-value">
            <span className="inbox-kpi-number">
              {summary.pending}
              <small>bekleyen</small>
            </span>
          </div>
          <p className="inbox-kpi-hint">
            {summary.pending > 0
              ? `Toplam ${summary.handled} tamamlanmış kayıt bulunuyor.`
              : `Toplam ${summary.handled} işlenmiş kayıt arşivde hazır.`}
          </p>
        </div>

        <div className="inbox-kpi-card">
          <div className="inbox-kpi-header">
            <span className="inbox-kpi-label">Dağılım</span>
            <span className={`inbox-kpi-badge ${summary.expiringSoon > 0 ? "is-warn" : "is-info"}`}>
              {summary.expiringSoon > 0
                ? `${summary.expiringSoon} yakında doluyor`
                : `${summary.total} Toplam`}
            </span>
          </div>
          <div className="inbox-kpi-value">
            <span className="inbox-kpi-number">
              {summary.total}
              <small>kayıt</small>
            </span>
          </div>
          <p className="inbox-kpi-hint">
            {`${textAndLinkTotal} Metin/Link · ${summary.counts.audio} Ses · ${mediaAndFileTotal} Görsel & Dosya`}
          </p>
        </div>

        <div className="inbox-kpi-card">
          <div className="inbox-kpi-header">
            <span className="inbox-kpi-label">Son Aktarım</span>
            <span className="inbox-kpi-badge is-info">
              {summary.latestItem ? getInboxTypeLabel(summary.latestItem) : "Bekleniyor"}
            </span>
          </div>
          <div className="inbox-kpi-value">
            {summary.latestItem ? (
              <span className="inbox-kpi-date-val">
                {new Date(summary.latestItem.createdAt).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <span className="inbox-kpi-empty-val">Henüz aktarım yok</span>
            )}
          </div>
          <p className="inbox-kpi-hint" title={summary.latestItem ? summary.latestItem.content || summary.latestItem.title : undefined}>
            {summary.latestItem
              ? formatInboxSnippet(summary.latestItem)
              : "Mobilden paylaştığın not, ses ve dosyalar burada görünür."}
          </p>
        </div>
      </div>

      {/* Tek Satırlık Kontrol Barı */}
      <div className="inbox-toolbar">
        <div className="inbox-tab-group" role="tablist" aria-label="Durum filtreleri">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "pending"}
            className={`button inbox-tab-btn ${filter === "pending" ? "button-primary" : "button-secondary"}`}
            onClick={() => selectStatusTab("pending")}
          >
            Bekleyenler ({summary.pending})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "handled"}
            className={`button inbox-tab-btn ${filter === "handled" ? "button-primary" : "button-secondary"}`}
            onClick={() => selectStatusTab("handled")}
          >
            İşlenenler ({summary.handled})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`button inbox-tab-btn ${filter === "all" ? "button-primary" : "button-secondary"}`}
            onClick={() => selectStatusTab("all")}
          >
            Tümü ({summary.total})
          </button>
        </div>

        <div className="inbox-controls-right">
          <div className="inbox-search-wrap">
            <span className="inbox-search-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="inbox-search-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ara..."
              aria-label="Gelenlerde ara"
            />
            {query && (
              <button
                type="button"
                className="inbox-search-clear"
                onClick={() => setQuery("")}
                aria-label="Aramayı temizle"
              >
                ×
              </button>
            )}
          </div>

          <div className="inbox-type-chips" role="group" aria-label="İçerik türü filtreleri">
            {TYPE_CHIP_OPTIONS.map(opt => {
              const count = typeCounts[opt.id];
              const isActive = typeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`inbox-type-chip ${isActive ? "is-active" : ""} ${count === 0 ? "is-empty" : ""}`}
                  onClick={() => setTypeFilter(opt.id)}
                  aria-pressed={isActive}
                >
                  <span>{opt.label}</span>
                  {opt.id !== "all" && <span className="inbox-chip-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <p className="feedback error" role="alert">{error}</p>}
      {notice && <p className="feedback" role="status">{notice}</p>}

      {!filteredItems.length && !error && (
        <div className="inbox-empty-card">
          <span className="inbox-empty-icon" aria-hidden="true">
            {hasActiveFilters ? "🔎" : filter === "pending" ? "✓" : "📥"}
          </span>
          <h2>
            {hasActiveFilters
              ? "Eşleşen kayıt bulunamadı"
              : filter === "pending"
              ? "Bekleyen yeni gelen içerik yok"
              : filter === "handled"
              ? "Henüz işlenmiş kayıt yok"
              : "Gelen kutusu şu an boş"}
          </h2>
          <p>
            {hasActiveFilters
              ? "Arama kelimesini veya seçili tür filtresini değiştirerek diğer kayıtları görüntüleyebilirsin."
              : filter === "pending" && summary.total > 0
              ? `Tüm gelen içerikler gözden geçirilmiş görünüyor. Arşivdeki ${summary.total} kayda göz atabilirsin.`
              : "Telefondaki ACKDeck mobil uygulamasından paylaştığın metin, sesli not, fotoğraf ve dosyalar burada toplanır."}
          </p>
          <div className="inbox-empty-actions">
            {hasActiveFilters && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setTypeFilter("all");
                  setQuery("");
                }}
              >
                Filtreleri Temizle
              </button>
            )}
            {filter === "pending" && summary.total > 0 && !hasActiveFilters && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => selectStatusTab("all")}
              >
                Tüm Kayıtları Göster ({summary.total})
              </button>
            )}
          </div>
        </div>
      )}

      {filteredItems.length > 0 && (
        <div className="inbox-grid">
          {filteredItems.map(item => {
            const expired = !!item.expiresAt && item.expiresAt < Date.now();
            const category = getInboxTypeCategory(item);
            const isExpanded = !!expandedIds[item.id];
            const isCopied = copiedId === item.id;
            const titleStr = (item.title || "").trim();
            const contentStr = (item.content || "").trim();
            const isSnippet =
              !titleStr ||
              !contentStr ||
              titleStr === contentStr ||
              contentStr.startsWith(titleStr.replace(/\.{2,}$/, "").trim());
            const showTitle = item.kind === "file" || item.kind === "link" || !isSnippet;
            const sizeLabel = formatInboxFileSize(item.size);

            return (
              <article
                id={"inbox-" + item.id}
                className={`surface hub-card inbox-card ${initialId === item.id ? "record-highlight" : ""} ${item.handled ? "is-handled" : "is-pending"}`}
                key={item.id}
              >
                <div className="inbox-card-heading">
                  <span className="inbox-kind-pill">
                    <span aria-hidden="true">{KIND_ICONS[category]}</span>
                    <span>{getInboxTypeLabel(item)}</span>
                  </span>
                  <span className={`inbox-status-pill ${item.handled ? "is-handled" : "is-pending"}`}>
                    {item.handled ? "✓ İşlendi" : "Bekliyor"}
                  </span>
                </div>

                {showTitle && <h2 className="inbox-card-title">{item.title}</h2>}

                <time className="inbox-card-time">
                  {new Date(item.createdAt).toLocaleString("tr-TR")}
                </time>

                {item.kind === "file" ? (
                  <p className={`inbox-file-meta ${expired ? "is-expired" : ""}`}>
                    {sizeLabel ? `${sizeLabel} · ` : ""}
                    {expired ? "Buluttaki saklama süresi dolmuş." : "Bulutta 30 gün saklanır."}
                  </p>
                ) : (
                  <ExpandableInboxText
                    text={item.content || item.title}
                    expanded={isExpanded}
                    onToggle={() => toggleExpanded(item.id)}
                  />
                )}

                {preview?.id === item.id && <PhoneMedia file={fileInfo(item)} />}

                <div className="hub-actions">
                  <button
                    type="button"
                    className={`button ${item.handled ? "button-secondary" : "button-primary"}`}
                    disabled={busy}
                    onClick={() => void toggleHandled(item)}
                    title={item.handled ? "Bekliyor durumuna geri al" : "İşlendi olarak işaretle"}
                  >
                    {item.handled ? "Geri Al" : "✓ İşlendi"}
                  </button>

                  {item.kind === "file" && (
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => setPreview(preview?.id === item.id ? null : item)}
                    >
                      {preview?.id === item.id ? "Kapat" : isAudioInboxItem(item) ? "Dinle" : "Önizle"}
                    </button>
                  )}

                  {item.kind === "file" && !expired && (
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          if (await downloadPhoneFile(item.id, item.title)) {
                            setNotice("Dosya bilgisayara indirildi.");
                          }
                        })
                      }
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

                  {item.kind !== "file" && (
                    <button
                      type="button"
                      className={`button button-secondary inbox-copy-btn ${isCopied ? "is-copied" : ""}`}
                      onClick={() => void copyItemText(item)}
                    >
                      {isCopied ? "✓ Kopyalandı" : "Kopyala"}
                    </button>
                  )}

                  <button
                    type="button"
                    className="button button-secondary inbox-delete-btn"
                    disabled={busy}
                    onClick={() => void deleteInboxItem(item)}
                    title="Bulut kaydını sil"
                  >
                    Sil
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
