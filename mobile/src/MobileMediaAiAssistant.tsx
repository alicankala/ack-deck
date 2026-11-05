import { useState, useEffect } from "react";
import {
  type MediaItem,
  type MediaType,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPE_ICONS,
  newMediaItem,
} from "../../shared/media";
import { proxyPosterUrl, searchMediaCatalog, fetchMediaRating } from "../../shared/mediaSearch";
import { api, json, type MobileState } from "./store";

type Props = {
  items: MediaItem[];
  state: MobileState;
  onAddItem: (item: MediaItem) => Promise<void>;
  onUpdateItem: (item: MediaItem) => Promise<void>;
  onClose: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
};

type RecItem = {
  title: string;
  type: MediaType;
  year?: string;
  creator?: string;
  reason: string;
  added?: boolean;
};

export function MobileMediaAiAssistant({
  items,
  state,
  onAddItem,
  onUpdateItem,
  onClose,
  onNotice,
  onError,
}: Props) {
  const [activeMode, setActiveMode] = useState<"pick" | "recommend" | "custom">("pick");
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [pickedItem, setPickedItem] = useState<MediaItem | null>(null);
  const [pickedFeedback, setPickedFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<RecItem[]>([]);
  const [customQuery, setCustomQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Backlog pool
  const plannedItems = items.filter(
    (i) => i.status === "planned" && (typeFilter === "all" || i.type === typeFilter)
  );

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
    const pool =
      plannedItems.length > 1 && pickedItem
        ? plannedItems.filter((i) => i.id !== pickedItem.id)
        : plannedItems;
    const randomChoice = pool[Math.floor(Math.random() * pool.length)];
    setPickedItem(randomChoice);
    setPickedFeedback(null);
  }

  async function handleStartItem(item: MediaItem) {
    try {
      await onUpdateItem({
        ...item,
        status: "in_progress",
        progress: item.progress || "Başlandı",
        updatedAt: Date.now(),
      });
      setPickedFeedback("🎉 'Devam Ediyor' durumuna alındı!");
      onNotice("Eser 'Devam Ediyor' durumuna alındı.");
    } catch {
      onError("Durum güncellenemedi.");
    }
  }

  async function handleGetRecommendations(customPrompt?: string) {
    setLoading(true);
    setErrorMessage(null);
    setRecs([]);

    // 1. Diverse, recency-weighted favorites sampling (max 8 items for lean mobile tokens)
    const completedHighRated = items
      .filter((i) => i.status === "completed" && (i.rating ?? 0) >= 7)
      .sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || "") || (b.updatedAt || 0) - (a.updatedAt || 0));

    const sampledFavorites: MediaItem[] = [];
    if (typeFilter !== "all") {
      sampledFavorites.push(...completedHighRated.filter((i) => i.type === typeFilter).slice(0, 6));
    } else {
      const types: MediaType[] = ["movie", "series", "book", "game"];
      for (const t of types) {
        sampledFavorites.push(...completedHighRated.filter((i) => i.type === t).slice(0, 2));
      }
    }

    const favoritesSummary = sampledFavorites
      .map(
        (i) =>
          `${MEDIA_TYPE_LABELS[i.type]}: "${i.title}" (${i.rating}/10${i.creator ? `, ${i.creator}` : ""})`
      )
      .join("; ");

    // 2. Prevent prompt bloating: only send the most recent 60 titles
    const recentTitles = (
      typeFilter === "all"
        ? items.slice(0, 60)
        : items.filter((i) => i.type === typeFilter).slice(0, 60)
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
      ? `Kullanıcının özel isteği: "${customPrompt.slice(0, 250)}".`
      : `Kullanıcının geçmişte sevdiği bazı eserler: ${favoritesSummary || "Henüz kayıt yok, genel başyapıtlardan seç."}`;

    const promptText = `${userInstructions}

Şu eserleri KESİNLİKLE önerme (zaten listesinde var):
${recentTitles || "Yok"}

Kullanıcıya ${requestedTypeLabel} tam 2 adet nokta atışı, kaliteli yeni eser öner.
YALNIZCA geçerli bir JSON dizisi formatında yanıt ver:
[
  {
    "title": "Eser Adı",
    "type": "${typeFilter === "all" ? "movie" : typeFilter}",
    "year": "2020",
    "creator": "Yönetmen / Yazar / Stüdyo",
    "reason": "Neden seveceğini anlatan 1-2 cümlelik samimi açıklama."
  }
]`;

    try {
      const res = await api<{ reply?: string }>(
        state,
        "ai/chat",
        json({ prompt: promptText, model: "fast" })
      );

      const raw = (res.reply ?? "").replace(/```json/gi, "").replace(/```/g, "").trim();
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as RecItem[];
        const filtered = parsed.filter(
          (r) => !existingTitleSet.has(r.title.toLowerCase().trim())
        );
        if (filtered.length > 0) {
          setRecs(filtered);
        } else {
          setRecs(getMobileCuratedFallbacks(typeFilter).filter(r => !existingTitleSet.has(r.title.toLowerCase().trim())).slice(0, 2));
        }
      } else {
        throw new Error("JSON çözümlenemedi.");
      }
    } catch {
      setErrorMessage("Çevrimdışı kaliteli örnek öneriler hazırlandı.");
      const fallbacks = getMobileCuratedFallbacks(typeFilter).filter(
        (r) => !existingTitleSet.has(r.title.toLowerCase().trim())
      );
      setRecs(fallbacks.slice(0, 2));
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

    try {
      const candidates = await searchMediaCatalog(rec.type, rec.title);
      if (candidates.length > 0 && candidates[0].posterUrl) {
        newItem.posterUrl = candidates[0].posterUrl;
        if (!newItem.year && candidates[0].year) newItem.year = candidates[0].year;
        if (!newItem.creator && candidates[0].creator) newItem.creator = candidates[0].creator;
      }
    } catch {}

    try {
      await onAddItem(newItem);
      setRecs((prev) =>
        prev.map((r, i) => (i === index ? { ...r, added: true } : r))
      );
      onNotice(`"${rec.title}" listene eklendi.`);
    } catch {
      onError("Kayıt listeye eklenemedi.");
    }
  }

  return (
    <div className="mobile-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mobile-media-editor-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "22px" }}>✨</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>ACK AI Asistanı</h3>
              <span style={{ fontSize: "11px", color: "var(--app-text-muted)" }}>Listenden seç veya yeni yapıt keşfet</span>
            </div>
          </div>
          <button type="button" className="mobile-modal-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {/* Mode Selector */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "12px" }}>
          <button
            type="button"
            className={`pill-btn ${activeMode === "pick" ? "is-selected" : ""}`}
            style={{ fontSize: "11px", padding: "6px 4px", textAlign: "center" }}
            onClick={() => {
              setActiveMode("pick");
              setErrorMessage(null);
            }}
          >
            🎲 Listemden
          </button>
          <button
            type="button"
            className={`pill-btn ${activeMode === "recommend" ? "is-selected" : ""}`}
            style={{ fontSize: "11px", padding: "6px 4px", textAlign: "center" }}
            onClick={() => {
              setActiveMode("recommend");
              setErrorMessage(null);
              if (recs.length === 0) void handleGetRecommendations();
            }}
          >
            ✨ Zevkime Göre
          </button>
          <button
            type="button"
            className={`pill-btn ${activeMode === "custom" ? "is-selected" : ""}`}
            style={{ fontSize: "11px", padding: "6px 4px", textAlign: "center" }}
            onClick={() => {
              setActiveMode("custom");
              setErrorMessage(null);
            }}
          >
            💬 Özel İstek
          </button>
        </div>

        {/* Type Filter row for modes */}
        <div style={{ display: "flex", gap: "5px", marginBottom: "12px", overflowX: "auto" }}>
          {(["all", "movie", "series", "book", "game"] as const).map((t) => (
            <button
              type="button"
              key={t}
              className={`pill-btn ${typeFilter === t ? "is-selected" : ""}`}
              style={{ fontSize: "11px", padding: "4px 8px" }}
              onClick={() => {
                setTypeFilter(t);
                if (activeMode === "recommend") {
                  setTimeout(() => void handleGetRecommendations(), 50);
                }
              }}
            >
              {t === "all" ? "Tümü" : `${MEDIA_TYPE_ICONS[t]} ${MEDIA_TYPE_LABELS[t]}`}
            </button>
          ))}
        </div>

        {/* MODE 1: Listemden Seç */}
        {activeMode === "pick" && (
          <div>
            {plannedItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px dashed var(--app-border)" }}>
                <span style={{ fontSize: "28px" }}>📭</span>
                <h4 style={{ margin: "8px 0 4px", fontSize: "14px" }}>Listende Eser Bulunmuyor</h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--app-text-muted)" }}>
                  {typeFilter === "all"
                    ? "İzleme veya okuma listene henüz planlanan eser eklemedin."
                    : `Listende ${MEDIA_TYPE_LABELS[typeFilter]} türünde bekleyen eser yok.`}
                </p>
                <button
                  type="button"
                  className="mobile-button-primary"
                  style={{ marginTop: "12px", padding: "6px 14px", fontSize: "12px" }}
                  onClick={() => {
                    setActiveMode("recommend");
                    void handleGetRecommendations();
                  }}
                >
                  ✨ Zevkine Göre Eser Keşfet
                </button>
              </div>
            ) : pickedItem ? (
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "14px", padding: "12px", border: "1px solid rgba(96,165,250,0.3)" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  {pickedItem.posterUrl ? (
                    <img
                      src={proxyPosterUrl(pickedItem.posterUrl)}
                      alt={pickedItem.title}
                      style={{ width: "52px", height: "76px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div style={{ width: "52px", height: "76px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", display: "grid", placeItems: "center", fontSize: "20px", flexShrink: 0 }}>
                      {MEDIA_TYPE_ICONS[pickedItem.type]}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "rgba(96,165,250,0.18)", color: "#93c5fd", fontWeight: 700 }}>
                        {MEDIA_TYPE_ICONS[pickedItem.type]} {MEDIA_TYPE_LABELS[pickedItem.type]}
                      </span>
                      <small style={{ fontSize: "10px", color: "var(--app-text-muted)" }}>
                        {plannedItems.length} eser arasından
                      </small>
                    </div>
                    <h4 style={{ margin: "4px 0 2px", fontSize: "14px", fontWeight: 700 }}>{pickedItem.title}</h4>
                    {(pickedItem.year || pickedItem.creator) && (
                      <p style={{ margin: 0, fontSize: "11px", color: "var(--app-text-muted)" }}>
                        {[pickedItem.year, pickedItem.creator].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {pickedItem.progress && (
                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#38bdf8" }}>
                        📌 {pickedItem.progress}
                      </p>
                    )}
                    {pickedItem.review && (
                      <p style={{ margin: "4px 0 0", fontSize: "11px", fontStyle: "italic", color: "var(--app-text-muted)" }}>
                        "{pickedItem.review}"
                      </p>
                    )}
                  </div>
                </div>

                {pickedFeedback && (
                  <div style={{ margin: "8px 0", padding: "6px", background: "rgba(34,197,94,0.15)", borderRadius: "8px", color: "#4ade80", fontSize: "11px", textAlign: "center", fontWeight: 600 }}>
                    {pickedFeedback}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
                  <button
                    type="button"
                    className="mobile-button-primary"
                    style={{ padding: "8px 6px", fontSize: "12px", background: "#10b981", borderColor: "#10b981" }}
                    onClick={() => void handleStartItem(pickedItem)}
                  >
                    ▶ Hemen Başla
                  </button>
                  <button
                    type="button"
                    className="mobile-button-secondary"
                    style={{ padding: "8px 6px", fontSize: "12px" }}
                    onClick={handlePickNext}
                  >
                    🎲 Başka Seç
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* MODE 2: Zevkime Göre Öner & MODE 3: Özel İstek */}
        {(activeMode === "recommend" || activeMode === "custom") && (
          <div>
            {activeMode === "custom" && (
              <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                <input
                  type="text"
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder="örn. 90 dk komedi filmi, zengin açık dünya RPG..."
                  maxLength={180}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", background: "var(--app-surface)", color: "#fff", fontSize: "16px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customQuery.trim()) {
                      void handleGetRecommendations(customQuery);
                    }
                  }}
                />
                <button
                  type="button"
                  className="mobile-button-primary"
                  style={{ padding: "0 12px", fontSize: "12px" }}
                  disabled={loading || !customQuery.trim()}
                  onClick={() => void handleGetRecommendations(customQuery)}
                >
                  Öner
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#93c5fd", fontSize: "13px" }}>
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: "20px", marginBottom: "6px" }}>⏳</span>
                <p style={{ margin: 0 }}>Zevkine göre nokta atışı yapıtlar seçiliyor…</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {errorMessage && (
                  <div style={{ padding: "6px 8px", borderRadius: "8px", background: "rgba(245,158,11,0.12)", color: "#fbbf24", fontSize: "11px" }}>
                    ℹ️ {errorMessage}
                  </div>
                )}
                {recs.map((rec, idx) => (
                  <div
                    key={`${rec.title}-${idx}`}
                    style={{ background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "10px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "4px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", padding: "2px 5px", borderRadius: "4px", background: "rgba(168,85,247,0.2)", color: "#c084fc", fontWeight: 700 }}>
                        {MEDIA_TYPE_ICONS[rec.type]} {MEDIA_TYPE_LABELS[rec.type]}
                      </span>
                      {rec.year && <small style={{ fontSize: "11px", color: "var(--app-text-muted)" }}>{rec.year}</small>}
                    </div>
                    <strong style={{ fontSize: "13px", color: "#fff" }}>{rec.title}</strong>
                    {rec.creator && <small style={{ fontSize: "11px", color: "var(--app-text-muted)" }}>{rec.creator}</small>}
                    <p style={{ margin: "2px 0 6px", fontSize: "11.5px", color: "#e2e8f0", lineHeight: 1.35 }}>
                      {rec.reason}
                    </p>
                    <button
                      type="button"
                      disabled={rec.added}
                      onClick={() => void handleAddRecToBacklog(rec, idx)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: rec.added ? "1px solid #10b981" : "1px solid rgba(96,165,250,0.4)",
                        background: rec.added ? "rgba(16,185,129,0.15)" : "rgba(96,165,250,0.15)",
                        color: rec.added ? "#34d399" : "#93c5fd",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: rec.added ? "default" : "pointer",
                        alignSelf: "flex-end",
                      }}
                    >
                      {rec.added ? "✓ Listeme Eklendi" : "+ Listeme Ekle"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getMobileCuratedFallbacks(type: MediaType | "all"): RecItem[] {
  const pool: Record<MediaType, RecItem[]> = {
    movie: [
      { title: "Arrival", type: "movie", year: "2016", creator: "Denis Villeneuve", reason: "Zihin açıcı kurgusu ve derin duygusal hikayesiyle modern bir bilimkurgu başyapıtı." },
      { title: "Whiplash", type: "movie", year: "2014", creator: "Damien Chazelle", reason: "Tutku, hırs ve mükemmeliyetçilik üzerine soluksuz izlenen bir tempo şaheseri." },
    ],
    series: [
      { title: "Severance", type: "series", year: "2022", creator: "Dan Erickson", reason: "Gizem dozu yüksek, özgün konseptiyle son yılların en zekice kurgulanmış dizisi." },
      { title: "Chernobyl", type: "series", year: "2019", creator: "Craig Mazin", reason: "Gerçekçiliği ve atmosferik gerilimiyle nefes kesen 5 bölümlük bir mini dizi." },
    ],
    book: [
      { title: "Dune", type: "book", year: "1965", creator: "Frank Herbert", reason: "Politika, ekoloji ve felsefeyi birleştiren eşsiz bir bilimkurgu klasiği." },
      { title: "1984", type: "book", year: "1949", creator: "George Orwell", reason: "Gözetim toplumu ve insan psikolojisi üzerine zamansız bir başyapıt." },
    ],
    game: [
      { title: "Hades", type: "game", year: "2020", creator: "Supergiant Games", reason: "Akıcı dövüş mekanikleri, mitolojik hikaye anlatımı ve kusursuz müzikleriyle bağımlılık yaratır." },
      { title: "Disco Elysium", type: "game", year: "2019", creator: "ZA/UM", reason: "Eşi benzeri olmayan derinlikte diyalogları ve edebi kalitesiyle unutulmaz bir RPG." },
    ],
  };

  if (type === "all") {
    return [pool.movie[0], pool.series[0], pool.book[0], pool.game[0]];
  }
  return pool[type] || pool.movie;
}
