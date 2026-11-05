import { useState, useEffect } from "react";
import {
  type MediaItem,
  type MediaType,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPE_ICONS,
  newMediaItem,
} from "../../shared/media";
import { proxyPosterUrl, searchMediaCatalog, fetchMediaRating } from "../../shared/mediaSearch";
import { sendGeminiMessage, getGeminiKeyStatus } from "../geminiClient";
import { redactSecrets } from "../privacy";

type Props = {
  items: MediaItem[];
  onAddItem: (item: MediaItem) => void;
  onUpdateItem: (item: MediaItem) => void;
  onClose: () => void;
};

type RecItem = {
  title: string;
  type: MediaType;
  year?: string;
  creator?: string;
  reason: string;
  added?: boolean;
  posterUrl?: string;
};

export function MediaAiAssistant({ items, onAddItem, onUpdateItem, onClose }: Props) {
  const [activeMode, setActiveMode] = useState<"pick" | "recommend" | "custom">("pick");
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [pickedItem, setPickedItem] = useState<MediaItem | null>(null);
  const [pickedFeedback, setPickedFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<RecItem[]>([]);
  const [customQuery, setCustomQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);

  useEffect(() => {
    void getGeminiKeyStatus()
      .then(setHasGeminiKey)
      .catch(() => setHasGeminiKey(false));
  }, []);

  // Filter planned items (backlog)
  const plannedItems = items.filter(
    (i) => i.status === "planned" && (typeFilter === "all" || i.type === typeFilter)
  );

  // Automatically pick an item if none is picked yet in "pick" mode
  useEffect(() => {
    if (activeMode === "pick" && !pickedItem && plannedItems.length > 0) {
      handlePickNext();
    }
  }, [activeMode, typeFilter, plannedItems.length]);

  function handlePickNext() {
    if (plannedItems.length === 0) {
      setPickedItem(null);
      return;
    }
    const pool = plannedItems.length > 1 && pickedItem
      ? plannedItems.filter((i) => i.id !== pickedItem.id)
      : plannedItems;
    const randomChoice = pool[Math.floor(Math.random() * pool.length)];
    setPickedItem(randomChoice);
    setPickedFeedback(null);
  }

  function handleStartItem(item: MediaItem) {
    onUpdateItem({
      ...item,
      status: "in_progress",
      progress: item.progress || "Başlandı",
      updatedAt: Date.now(),
    });
    setPickedFeedback("🎉 'Devam Ediyor' durumuna alındı! İyi seyirler/okumalar/oyunlar!");
  }

  async function handleGetRecommendations(customPrompt?: string) {
    setLoading(true);
    setErrorMessage(null);
    setRecs([]);

    // 0. Koleksiyon okunamadıysa veya hiç kayıt yoksa
    if (!items || items.length === 0) {
      setLoading(false);
      setErrorMessage("Koleksiyon verisi okunamadı veya henüz hiç kayıt eklenmedi. Zevkini analiz edebilmem için önce koleksiyonuna eserler eklemelisin.");
      return;
    }

    // 1. Diverse, recency-weighted sampling of top favorites (max 10 items)
    const completedHighRated = items
      .filter((i) => i.status === "completed" && (i.rating ?? 0) >= 7)
      .sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || "") || (b.updatedAt || 0) - (a.updatedAt || 0));

    const sampledFavorites: MediaItem[] = [];
    if (typeFilter !== "all") {
      sampledFavorites.push(...completedHighRated.filter((i) => i.type === typeFilter).slice(0, 8));
    } else {
      const types: MediaType[] = ["movie", "series", "book", "game"];
      for (const t of types) {
        sampledFavorites.push(...completedHighRated.filter((i) => i.type === t).slice(0, 3));
      }
    }

    // Yeterli veri yoksa kesinlikle cevap verme
    if (!customPrompt && sampledFavorites.length === 0) {
      setLoading(false);
      setErrorMessage(
        typeFilter === "all"
          ? "Zevkine göre öneri yapabilmek için koleksiyonunda henüz yeterli veri bulunamadı. Zevkini analiz edebilmem için tamamladığın ve beğendiğin (7+ puan verdiğin) en az bir eser eklemelisin."
          : `Zevkine göre öneri yapabilmek için koleksiyonunda ${MEDIA_TYPE_LABELS[typeFilter]} türünde henüz yeterli veri bulunamadı. Zevkini analiz edebilmem için tamamladığın ve beğendiğin (7+ puan verdiğin) en az bir ${MEDIA_TYPE_LABELS[typeFilter].toLowerCase()} eklemelisin.`
      );
      return;
    }

    const favoritesSummary = sampledFavorites
      .map(
        (i) =>
          `${MEDIA_TYPE_LABELS[i.type]}: "${i.title}" (Puan: ${i.rating}/10${i.creator ? `, Sanatçı: ${i.creator}` : ""}${i.review ? `, Not: ${i.review.slice(0, 50)}` : ""})`
      )
      .join("; ");

    // 2. Prevent prompt bloating: only send the most recent 80 titles in prompt
    const recentOrRelevantTitles = (
      typeFilter === "all"
        ? items.slice(0, 80)
        : items.filter((i) => i.type === typeFilter).slice(0, 80)
    )
      .map((i) => i.title.toLowerCase().trim())
      .filter(Boolean)
      .join(", ");

    const existingTitleSet = new Set(items.map((i) => i.title.toLowerCase().trim()));

    const requestedTypeLabel =
      typeFilter === "all"
        ? "film, dizi, kitap veya oyun arasından dengeli"
        : `${MEDIA_TYPE_LABELS[typeFilter]} türünde`;

    const userInstructions = customPrompt
      ? `Kullanıcının özel isteği şudur: "${redactSecrets(customPrompt)}".`
      : `Kullanıcının geçmişte yüksek puan verdiği bazı eserler şunlardır: ${favoritesSummary || "Henüz yüksek puanlı eser girilmemiş, genel olarak başyapıt niteliğinde sevilen eserlerden seç."}`;

    const promptText = `${userInstructions}

Kullanıcının zaten bildiği ve listesinde olan şu eserleri KESİNLİKLE önerme:
${recentOrRelevantTitles || "Yok"}

Kullanıcıya ${requestedTypeLabel} tam 2 veya 3 adet nokta atışı, kaliteli yeni eser öner.
Yanıtını YALNIZCA geçerli bir JSON dizisi formatında ver (markdown veya kod bloğu olmadan saf JSON dizisi):
[
  {
    "title": "Eser Adı",
    "type": "${typeFilter === "all" ? "movie" : typeFilter}",
    "year": "2020",
    "creator": "Yönetmen / Yazar / Stüdyo",
    "reason": "Kullanıcının geçmiş zevkleriyle bağ kurarak neden seveceğini anlatan 1-2 cümlelik samimi açıklama."
  }
]`;

    try {
      const reply = await sendGeminiMessage(
        [{ role: "user", text: promptText }],
        "fast",
        [],
        false,
        []
      );

      const raw = reply.text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as RecItem[];
        const nonDuplicates = parsed.filter(
          (r) => !existingTitleSet.has(r.title.toLowerCase().trim())
        );
        if (nonDuplicates.length > 0) {
          setRecs(nonDuplicates);
        } else {
          const fallbacks = getCuratedFallbacks(typeFilter).filter(
            (r) => !existingTitleSet.has(r.title.toLowerCase().trim())
          );
          setRecs(fallbacks.slice(0, 3));
        }
      } else {
        throw new Error("JSON dizisi çözümlenemedi.");
      }
    } catch {
      // Fallback curated recommendations if AI is offline or without key
      setErrorMessage(
        hasGeminiKey === false
          ? "Gemini anahtarı tanımlanmadığı için genel popüler öneriler listelendi. Kişiselleştirilmiş öneriler için Ayarlar > Gemini sayfasından anahtar ekleyebilirsin."
          : "Yapay zeka yanıt veremedi; örnek kaliteli öneriler hazırlandı."
      );
      const fallbacks = getCuratedFallbacks(typeFilter).filter(
        (r) => !existingTitleSet.has(r.title.toLowerCase().trim())
      );
      setRecs(fallbacks.slice(0, 3));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRecToBacklog(rec: RecItem, index: number) {
    const newItem: MediaItem = {
      ...newMediaItem(rec.type),
      title: rec.title,
      status: "planned",
      year: rec.year,
      creator: rec.creator,
      review: rec.reason,
    };

    // Auto-fetch poster in background
    try {
      const candidates = await searchMediaCatalog(rec.type, rec.title);
      if (candidates.length > 0) {
        if (candidates[0].posterUrl) newItem.posterUrl = candidates[0].posterUrl;
        if (!newItem.year && candidates[0].year) newItem.year = candidates[0].year;
        if (!newItem.creator && candidates[0].creator) newItem.creator = candidates[0].creator;
        if (candidates[0].imdbId) {
          newItem.imdbId = candidates[0].imdbId;
          const r = await fetchMediaRating(candidates[0].imdbId);
          if (typeof r === "number" && r > 0) {
            newItem.imdbRating = r;
            newItem.imdbUpdatedAt = Date.now();
          }
        }
      }
    } catch {}

    onAddItem(newItem);

    // Mark as added in UI
    setRecs((prev) =>
      prev.map((r, i) => (i === index ? { ...r, added: true } : r))
    );
  }

  return (
    <div className="media-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="surface media-ai-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="media-ai-header">
          <div className="media-ai-header-title">
            <span style={{ fontSize: "1.6rem" }}>✨</span>
            <div>
              <h3>ACK AI Koleksiyon Asistanı</h3>
              <small>Listenden akıllıca seç veya zevkine uygun yeni yapıtlar keşfet</small>
            </div>
          </div>
          <button type="button" className="mobile-modal-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="media-ai-modes">
          <button
            type="button"
            className={`media-ai-mode-btn ${activeMode === "pick" ? "is-active" : ""}`}
            onClick={() => {
              setActiveMode("pick");
              setErrorMessage(null);
            }}
          >
            <span>🎲 Listemden Seç</span>
          </button>
          <button
            type="button"
            className={`media-ai-mode-btn ${activeMode === "recommend" ? "is-active" : ""}`}
            onClick={() => {
              setActiveMode("recommend");
              setErrorMessage(null);
              // Explicit user action needed
            }}
          >
            <span>✨ Zevkime Göre Öner</span>
          </button>
          <button
            type="button"
            className={`media-ai-mode-btn ${activeMode === "custom" ? "is-active" : ""}`}
            onClick={() => {
              setActiveMode("custom");
              setErrorMessage(null);
            }}
          >
            <span>💬 Özel İstek</span>
          </button>
        </div>

        {/* Category Pill Filters */}
        <div className="ai-type-select-row">
          <span style={{ fontSize: "0.78rem", color: "var(--app-muted)", fontWeight: 600 }}>Tür:</span>
          {(["all", "movie", "series", "book", "game"] as const).map((t) => (
            <button
              type="button"
              key={t}
              className={`ai-type-pill ${typeFilter === t ? "is-active" : ""}`}
              onClick={() => {
                setTypeFilter(t);
                setPickedItem(null);
                setPickedFeedback(null);
                if (activeMode === "recommend") { setRecs([]); setErrorMessage(null); }
              }}
            >
              {t === "all" ? "Tümü" : `${MEDIA_TYPE_ICONS[t]} ${MEDIA_TYPE_LABELS[t]}`}
            </button>
          ))}
        </div>

        <div className="media-ai-content" style={{ marginTop: "1rem" }}>
          {/* MODE 1: PICK FROM BACKLOG */}
          {activeMode === "pick" && (
            <>
              {plannedItems.length === 0 ? (
                <div className="ai-empty-notice">
                  <span style={{ fontSize: "2rem" }}>📭</span>
                  <p>
                    {typeFilter === "all"
                      ? "Listenizde henüz bekleyen (izlenecek, okunacak, oynanacak) hiçbir kayıt yok."
                      : `Listenizde bekleyen ${MEDIA_TYPE_LABELS[typeFilter]} kaydı bulunamadı.`}
                  </p>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => {
                      setActiveMode("recommend");
                    }}
                  >
                    ✨ Geçmiş Zevklerime Göre Yeni Eser Öner
                  </button>
                </div>
              ) : pickedItem ? (
                <div className="ai-picked-card">
                  {pickedItem.posterUrl ? (
                    <img
                      src={proxyPosterUrl(pickedItem.posterUrl)}
                      alt={pickedItem.title}
                      className="ai-picked-poster"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="ai-picked-placeholder">
                      {MEDIA_TYPE_ICONS[pickedItem.type]}
                    </div>
                  )}

                  <div className="ai-picked-details">
                    <div className="ai-picked-meta">
                      <span>{MEDIA_TYPE_ICONS[pickedItem.type]} {MEDIA_TYPE_LABELS[pickedItem.type]}</span>
                      {pickedItem.year && <span>• {pickedItem.year}</span>}
                      {pickedItem.creator && <span>• {pickedItem.creator}</span>}
                    </div>
                    <h4>{pickedItem.title}</h4>
                    {pickedItem.review && (
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--app-muted)", fontStyle: "italic" }}>
                        "{pickedItem.review}"
                      </p>
                    )}

                    <div className="ai-picked-pitch">
                      💡 <strong>ACK AI Önerisi:</strong> Listende bekleyen bu yapıtı bugün tüketmek için harika bir zaman.
                    </div>

                    {pickedFeedback && (
                      <div style={{ color: "#4ade80", fontSize: "0.82rem", fontWeight: 600, marginTop: "4px" }}>
                        {pickedFeedback}
                      </div>
                    )}

                    <div className="ai-card-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => handleStartItem(pickedItem)}
                        disabled={pickedItem.status === "in_progress"}
                      >
                        ▶ Hemen Başla (Devam Ediyor Yap)
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={handlePickNext}
                      >
                        🎲 Başka Bir Tane Seç
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* MODE 2: RECOMMEND NEW BASED ON TASTE */}
          {activeMode === "recommend" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.84rem", color: "var(--app-secondary)" }}>
                  {typeFilter === "all"
                    ? "Tüm türlerdeki zevklerin analiz edilir:"
                    : `${MEDIA_TYPE_LABELS[typeFilter]} türündeki zevklerin analiz edilir:`}
                </span>
                <button
                  type="button"
                  className="button button-primary"
                  style={{ padding: "0.35rem 0.95rem", fontSize: "0.82rem", fontWeight: 650 }}
                  onClick={() => void handleGetRecommendations()}
                  disabled={loading}
                >
                  {loading
                    ? "Analiz Ediliyor..."
                    : recs.length > 0
                    ? `🔄 Yeniden ${typeFilter === "all" ? "Öner" : `${MEDIA_TYPE_LABELS[typeFilter]} Öner`}`
                    : `✨ ${typeFilter === "all" ? "Zevkime Göre Öner" : `${MEDIA_TYPE_LABELS[typeFilter]} Öner`}`}
                </button>
              </div>

              {loading ? (
                <div style={{ padding: "2.5rem", textAlign: "center", color: "#38bdf8" }}>
                  <div className="media-mini-spinner" style={{ width: 24, height: 24, margin: "0 auto 0.75rem" }} />
                  <p style={{ margin: 0, fontSize: "0.9rem" }}>
                    {typeFilter === "all"
                      ? "Koleksiyonun ve zevklerin analiz ediliyor, öneriler hazırlanıyor…"
                      : `${MEDIA_TYPE_LABELS[typeFilter]} zevklerin analiz ediliyor, öneriler hazırlanıyor…`}
                  </p>
                </div>
              ) : recs.length > 0 ? (
                <div className="ai-recs-grid">
                  {recs.map((rec, index) => (
                    <div key={`${rec.title}-${index}`} className="ai-rec-card">
                      <div className="ai-rec-thumb" style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {rec.posterUrl ? (
                          <img
                            src={proxyPosterUrl(rec.posterUrl)}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "6px" }}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          MEDIA_TYPE_ICONS[rec.type] || "🎬"
                        )}
                      </div>
                      <div className="ai-rec-info">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "0.75rem", color: "#c084fc", fontWeight: 700 }}>
                            {MEDIA_TYPE_LABELS[rec.type]}
                          </span>
                          {rec.year && <span style={{ fontSize: "0.75rem", color: "var(--app-muted)" }}>• {rec.year}</span>}
                          {rec.creator && <span style={{ fontSize: "0.75rem", color: "var(--app-muted)" }}>• {rec.creator}</span>}
                        </div>
                        <h5>{rec.title}</h5>
                        <p>{rec.reason}</p>

                        <button
                          type="button"
                          className={`button ${rec.added ? "button-secondary" : "button-primary"}`}
                          style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                          disabled={rec.added}
                          onClick={() => void handleAddRecToBacklog(rec, index)}
                        >
                          {rec.added ? "✓ Listeme Eklendi" : "+ Listeme Ekle"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ai-empty-notice" style={{ padding: "2rem 1rem", textAlign: "center", background: "rgba(255, 255, 255, 0.02)", borderRadius: "12px", border: "1px dashed var(--app-border, rgba(255,255,255,0.08))" }}>
                  <span style={{ fontSize: "2.2rem" }}>🎯</span>
                  <h4 style={{ margin: "0.6rem 0 0.3rem", fontSize: "1.05rem", color: "var(--app-text, #fff)" }}>
                    {typeFilter === "all"
                      ? "Zevkine Göre Yeni Eserler Keşfet"
                      : `Zevkine Göre Yeni ${MEDIA_TYPE_LABELS[typeFilter]} Keşfet`}
                  </h4>
                  <p style={{ margin: "0 0 1.1rem", fontSize: "0.85rem", color: "var(--app-text-muted, #94a3b8)", maxWidth: "420px", marginLeft: "auto", marginRight: "auto", lineHeight: "1.5" }}>
                    {typeFilter === "all"
                      ? "Koleksiyonundaki yüksek puanlı tüm yapıtlar incelenerek zevkine en uygun kaliteli yeni eserler tavsiye edilir."
                      : `Koleksiyonunda yüksek puan verdiğin ${MEDIA_TYPE_LABELS[typeFilter].toLowerCase()} kayıtları incelenerek zevkine en uygun 2-3 yeni ${MEDIA_TYPE_LABELS[typeFilter].toLowerCase()} tavsiye edilir.`}
                  </p>
                  <button
                    type="button"
                    className="button button-primary"
                    style={{ padding: "0.55rem 1.4rem", fontSize: "0.9rem", fontWeight: 650 }}
                    onClick={() => void handleGetRecommendations()}
                  >
                    ✨ {typeFilter === "all" ? "Zevkime Göre Öner" : `${MEDIA_TYPE_LABELS[typeFilter]} Öner`}
                  </button>
                </div>
              )}

              {errorMessage && (
                <div style={{ marginTop: "0.75rem", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#fca5a5", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.1rem" }}>⚠️</span>
                  <div>
                    <strong>Cevap Verilemiyor:</strong> {errorMessage}
                  </div>
                </div>
              )}
            </>
          )}

          {/* MODE 3: CUSTOM PROMPT / MOOD */}
          {activeMode === "custom" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontSize: "0.84rem", color: "var(--app-secondary)", margin: 0 }}>
                Ruh haline, vaktine veya aradığın temaya göre yapay zekadan özel öneri iste:
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customQuery.trim().length >= 3) {
                    void handleGetRecommendations(customQuery.trim());
                  }
                }}
                className="ai-query-box"
              >
                <input
                  type="text"
                  className="ai-query-input"
                  placeholder="örn. Bu akşam 1 saat vaktim var, zihnimi yormayacak bir film öner..."
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={loading || customQuery.trim().length < 3}
                >
                  {loading ? "Aranıyor..." : "Sor"}
                </button>
              </form>

              {loading ? (
                <div style={{ padding: "2.5rem", textAlign: "center", color: "#38bdf8" }}>
                  <div className="media-mini-spinner" style={{ width: 24, height: 24, margin: "0 auto 0.75rem" }} />
                  <p style={{ margin: 0, fontSize: "0.9rem" }}>İsteğine ve koleksiyonuna en uygun yapıt aranıyor…</p>
                </div>
              ) : recs.length > 0 ? (
                <div className="ai-recs-grid">
                  {recs.map((rec, index) => (
                    <div key={`${rec.title}-${index}`} className="ai-rec-card">
                      <div className="ai-rec-thumb" style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {rec.posterUrl ? (
                          <img
                            src={proxyPosterUrl(rec.posterUrl)}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "6px" }}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          MEDIA_TYPE_ICONS[rec.type] || "🎬"
                        )}
                      </div>
                      <div className="ai-rec-info">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "0.75rem", color: "#c084fc", fontWeight: 700 }}>
                            {MEDIA_TYPE_LABELS[rec.type]}
                          </span>
                          {rec.year && <span style={{ fontSize: "0.75rem", color: "var(--app-muted)" }}>• {rec.year}</span>}
                        </div>
                        <h5>{rec.title}</h5>
                        <p>{rec.reason}</p>

                        <button
                          type="button"
                          className={`button ${rec.added ? "button-secondary" : "button-primary"}`}
                          style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                          disabled={rec.added}
                          onClick={() => void handleAddRecToBacklog(rec, index)}
                        >
                          {rec.added ? "✓ Listeme Eklendi" : "+ Listeme Ekle"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {errorMessage && (
                <div style={{ background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", padding: "0.6rem 0.85rem", fontSize: "0.8rem", color: "#fca5a5" }}>
                  {errorMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getCuratedFallbacks(type: MediaType | "all"): RecItem[] {
  const allCurated: RecItem[] = [
    {
      title: "Arrival",
      type: "movie",
      year: "2016",
      creator: "Denis Villeneuve",
      reason: "Zihin açıcı kurgusu, derin duygusal teması ve bilim kurgu estetiğiyle kaçırılmayacak bir yapıt.",
    },
    {
      title: "Severance",
      type: "series",
      year: "2022",
      creator: "Dan Erickson",
      reason: "İş ve özel hayat ayrımını fütüristik ve gizem dolu bir gerilimle işleyen sürükleyici bir dizi.",
    },
    {
      title: "Cesur Yeni Dünya",
      type: "book",
      year: "1932",
      creator: "Aldous Huxley",
      reason: "Toplumsal düzen, özgürlük ve insan psikolojisi üzerine kaleme alınmış başyapıt distopya.",
    },
    {
      title: "Hades",
      type: "game",
      year: "2020",
      creator: "Supergiant Games",
      reason: "Kusursuz oynanış mekanikleri, zengin mitolojik hikaye anlatımı ve görsel tarzıyla olağanüstü bir deneyim.",
    },
  ];

  if (type === "all") return allCurated.slice(0, 3);
  return allCurated.filter((i) => i.type === type).concat(allCurated.slice(0, 2)).slice(0, 2);
}
