import { ActionMenu } from "./ActionMenu";
import { useEffect, useState } from "react";
import { loadSubscriptions, saveSubscriptions } from "../subscriptionStore";
import {
  monthlyTotals,
  yearlyTotals,
  money,
  moneyRounded,
  cycleLabel,
  cycleAdjective,
  paymentLabel,
  paymentShortLabel,
  paymentOccurrence,
  daysUntilPayment,
  paymentCountdownLabel,
  subscriptionShares,
  moveSubscriptionItem,
  type Subscription,
} from "../../shared/subscriptions";
import { newSubscription, SubscriptionForm } from "../../shared/SubscriptionForm";
import { EditorDialog } from "./EditorDialog";
import { offerUndo } from "../recordUndo";
import { Icon } from "./Icon";
import "./subscriptions.css";

export function Subscriptions({ compact = false, onOpen, initialId }: { compact?: boolean; onOpen?: () => void; initialId?: string }) {
  const [loaded, setLoaded] = useState(loadSubscriptions);
  const [draft, setDraft] = useState<Subscription | null>(null);
  const [error, setError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setLoaded(loadSubscriptions());
    window.addEventListener("ack-data-changed", refresh);
    return () => window.removeEventListener("ack-data-changed", refresh);
  }, []);

  useEffect(() => {
    if (initialId) document.getElementById("subscription-" + initialId)?.scrollIntoView({ block: "center" });
  }, [initialId]);

  const active = loaded.entries.filter(s => s.status === "active");
  const upcoming = active
    .filter(s => paymentOccurrence(s))
    .sort((a, b) => paymentOccurrence(a)!.at - paymentOccurrence(b)!.at);
  const totals = monthlyTotals(loaded.entries);

  function commit(entries: Subscription[]) {
    if (!saveSubscriptions(entries)) throw Error("Abonelikler kaydedilemedi.");
    setLoaded(loadSubscriptions());
  }

  function reorderByStep(id: string, delta: -1 | 1) {
    if (loaded.locked) return;
    const current = loadSubscriptions().entries;
    const idx = current.findIndex(item => item.id === id);
    if (idx === -1) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= current.length) return;
    try {
      commit(moveSubscriptionItem(current, id, nextIdx));
      setError("");
    } catch {
      setError("Sıralama kaydedilemedi.");
    }
  }

  function reorderByDrop(fromId: string, targetId: string) {
    if (loaded.locked || fromId === targetId) return;
    const current = loadSubscriptions().entries;
    const targetIdx = current.findIndex(item => item.id === targetId);
    if (targetIdx === -1) return;
    try {
      commit(moveSubscriptionItem(current, fromId, targetIdx));
      setError("");
    } catch {
      setError("Sıralama kaydedilemedi.");
    }
  }

  const total = (
    <div className="subscription-totals">
      <span>Aylık karşılık:</span>
      {totals.map(([currency, amount]) => (
        <strong key={currency}>{money(amount, currency)}</strong>
      ))}
      {!totals.length && <span>—</span>}
    </div>
  );

  if (compact) {
    const monthlyText = totals.length > 0
      ? `${totals.map(([currency, amount]) => money(amount, currency)).join(" + ")} / ay`
      : active.length > 0
      ? `${active.length} aktif`
      : "Aktif yok";
    const nextText = upcoming[0]
      ? `Sıradaki: ${upcoming[0].name} · ${paymentLabel(upcoming[0])}`
      : active[0]
      ? active.slice(0, 2).map(s => s.name).join(", ")
      : "Yaklaşan ödeme yok";

    return (
      <details className="dashboard-pc dashboard-subscriptions" aria-label="Abonelikler">
        <summary className="dashboard-pc-summary dashboard-subscriptions-summary">
          <div className="dashboard-pc-header-line">
            <span className="dashboard-pc-title">
              <Icon name="archive" size={15} />
              <strong>Abonelikler</strong>
            </span>
            <span className={`sub-net-pill ${active.length > 0 ? "active" : "empty"}`}>
              <span className="dashboard-network-dot" />
              {monthlyText}
            </span>
          </div>
          <div className="dashboard-pc-metrics-line sub-metrics-line">
            <span className="pc-metric-tag sub-count-tag">{active.length} aktif</span>
            <span className="pc-metric-tag sub-upcoming-tag" title={nextText}>{nextText}</span>
            <small className="pc-metric-details">Ayrıntılar&nbsp;›</small>
          </div>
        </summary>
        <div className="dashboard-subscription-body">
          <div className="dashboard-section-top">
            <h2>Yaklaşan ödemeler</h2>
            <button type="button" className="dashboard-more" onClick={onOpen}>Tümünü Gör</button>
          </div>
          {loaded.warning ? (
            <p role="status">{loaded.warning}</p>
          ) : (
            <>
              {upcoming.slice(0, 3).map(s => (
                <div className="subscription-compact" key={s.id}>
                  <span>{s.name}</span>
                  <small>{paymentLabel(s)} · {money(s.amount, s.currency)}</small>
                </div>
              ))}
              {!upcoming.length && <p className="dashboard-empty">Yaklaşan ödeme yok.</p>}
              {total}
            </>
          )}
        </div>
      </details>
    );
  }

  const nextUpcoming = upcoming[0];
  const nextDays = nextUpcoming ? daysUntilPayment(nextUpcoming) : null;
  const nextCountdown = nextUpcoming ? paymentCountdownLabel(nextUpcoming) : null;
  const annual = yearlyTotals(loaded.entries);
  const shares = subscriptionShares(loaded.entries, 4);
  const inactiveCount = loaded.entries.length - active.length;

  return (
    <section className="subscriptions-page hub-page">
      <div className="section-heading">
        <div className="section-heading-titles">
          <h1>Abonelikler</h1>
          <p className="section-subtext">Düzenli giderlerini, yaklaşan yenileme tarihlerini ve aylık bütçeni takip et.</p>
        </div>
        <button
          type="button"
          className="button button-primary"
          disabled={loaded.locked}
          onClick={() => setDraft(newSubscription())}
        >
          + Yeni Abonelik
        </button>
      </div>

      {(loaded.warning || error) && (
        <p className="tool-feedback error" role="alert">{loaded.warning || error}</p>
      )}

      {/* Tek Parça Bütçe Şeridi */}
      <div className="subscriptions-budget-bar surface" aria-label="Bütçe özeti">
        <div className="budget-bar-primary">
          <div className="budget-bar-eyebrow">
            <span>Aylık Karşılık</span>
            <span className={`budget-count-pill ${active.length > 0 ? "is-active" : ""}`}>
              {active.length} aktif{inactiveCount > 0 ? ` · ${inactiveCount} pasif` : ""}
            </span>
          </div>
          <div className="budget-bar-figures">
            {totals.length > 0 ? (
              totals.map(([cur, amt]) => (
                <strong key={cur} className="budget-monthly-amount">
                  {money(amt, cur)} <small>/ ay</small>
                </strong>
              ))
            ) : (
              <strong className="budget-monthly-amount">₺0,00 <small>/ ay</small></strong>
            )}
          </div>
          <p className="budget-bar-subline">
            {annual.length > 0
              ? `Yıllık ~${annual.map(([cur, amt]) => moneyRounded(amt, cur)).join(" + ")}`
              : "Henüz aktif düzenli gider yok"}
          </p>
        </div>

        <div className="budget-bar-shares">
          <div className="budget-bar-eyebrow">
            <span>Pay Dağılımı</span>
            {totals.length > 1 && shares[0] && (
              <small className="budget-currency-note">{shares[0].currency} bazında</small>
            )}
          </div>
          {shares.length > 0 ? (
            <>
              <div className="budget-share-track" role="img" aria-label="Harcama pay dağılımı">
                {shares.map(seg => (
                  <span
                    key={seg.id}
                    className="budget-share-segment"
                    style={{ width: `${Math.max(seg.exactPercent, 4)}%`, backgroundColor: seg.color }}
                    title={`${seg.name}: %${seg.percent}`}
                  />
                ))}
              </div>
              <div className="budget-share-legend">
                {shares.map(seg => (
                  <span key={seg.id} className="budget-share-item">
                    <i className="budget-share-dot" style={{ backgroundColor: seg.color }} aria-hidden="true" />
                    <span className="budget-share-name">{seg.name}</span>
                    <strong>%{seg.percent}</strong>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="budget-bar-empty">Aktif abonelik eklendiğinde bütçe payları burada görünür.</p>
          )}
        </div>

        <div className="budget-bar-upcoming">
          <div className="budget-bar-eyebrow">
            <span>Sıradaki Ödeme</span>
          </div>
          {nextUpcoming ? (
            <>
              <div className="budget-upcoming-main">
                <strong className="budget-upcoming-name" title={nextUpcoming.name}>{nextUpcoming.name}</strong>
                {nextCountdown && (
                  <span className={`budget-upcoming-countdown ${nextDays !== null && nextDays <= 7 ? "is-soon" : ""}`}>
                    {nextCountdown}
                  </span>
                )}
              </div>
              <p className="budget-bar-subline">
                {paymentLabel(nextUpcoming)} · {money(nextUpcoming.amount, nextUpcoming.currency)}
              </p>
            </>
          ) : (
            <>
              <strong className="budget-upcoming-empty">Yaklaşan ödeme yok</strong>
              <p className="budget-bar-subline">Planlanan bir sonraki fatura bulunmuyor.</p>
            </>
          )}
        </div>
      </div>

      {draft && (
        <EditorDialog
          title={draft.name ? "Aboneliği Düzenle" : "Yeni Abonelik Ekle"}
          onClose={() => setDraft(null)}
        >
          <SubscriptionForm
            showHeading={false}
            key={draft.id}
            initial={draft}
            onCancel={() => setDraft(null)}
            onSave={s => {
              const current = loadSubscriptions().entries;
              const exists = current.some(v => v.id === s.id);
              commit(exists ? current.map(v => (v.id === s.id ? s : v)) : [...current, s]);
              setDraft(null);
            }}
          />
        </EditorDialog>
      )}

      {/* Finans Listesi / Ledger */}
      {loaded.entries.length > 0 && (
        <div className="subscriptions-ledger surface" role="list" aria-label="Abonelik listesi">
          {loaded.entries.map((s, idx) => {
            const isPaused = s.status === "paused";
            const isCancelled = s.status === "cancelled";
            const days = daysUntilPayment(s);
            const countdown = paymentCountdownLabel(s);
            const shareColor = shares.find(seg => seg.id === s.id)?.color;

            return (
              <article
                id={"subscription-" + s.id}
                role="listitem"
                draggable={!loaded.locked && loaded.entries.length > 1}
                onDragStart={e => {
                  setDraggedId(s.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", s.id);
                }}
                onDragOver={e => {
                  if (!draggedId || draggedId === s.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== s.id) setDragOverId(s.id);
                }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dragOverId === s.id) {
                    setDragOverId(null);
                  }
                }}
                onDrop={e => {
                  e.preventDefault();
                  const fromId = draggedId || e.dataTransfer.getData("text/plain");
                  setDraggedId(null);
                  setDragOverId(null);
                  if (fromId) reorderByDrop(fromId, s.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={[
                  "subscription-ledger-row",
                  initialId === s.id ? "record-highlight" : "",
                  isPaused || isCancelled ? "is-inactive" : "",
                  draggedId === s.id ? "is-dragging" : "",
                  dragOverId === s.id ? "is-drag-over" : "",
                ].filter(Boolean).join(" ")}
                key={s.id}
              >
                <button
                  type="button"
                  className="subscription-ledger-main"
                  disabled={loaded.locked}
                  onClick={() => setDraft(s)}
                >
                  <span
                    className="subscription-monogram"
                    style={shareColor ? { borderColor: `${shareColor}44`, color: shareColor } : undefined}
                    aria-hidden="true"
                  >
                    {s.icon || s.name.slice(0, 1).toLocaleUpperCase("tr")}
                  </span>

                  <span className="subscription-col-identity">
                    <span className="subscription-title">{s.name}</span>
                    {s.category.trim() && (
                      <span className="subscription-category-sub">{s.category.trim()}</span>
                    )}
                  </span>

                  <span className="subscription-col-cycle">
                    <span className={`ledger-status-dot ${isPaused ? "dot-paused" : isCancelled ? "dot-cancelled" : "dot-active"}`} />
                    <span>
                      {isPaused
                        ? `Duraklatıldı · ${cycleAdjective(s)}`
                        : isCancelled
                        ? "İptal Edildi"
                        : `${s.autoRenew ? "Otomatik" : "Manuel"} · ${cycleAdjective(s)}`}
                    </span>
                  </span>

                  <span className="subscription-col-schedule">
                    {s.status === "active" ? (
                      countdown ? (
                        <>
                          <strong className={`ledger-countdown ${days !== null && days <= 7 ? "is-soon" : ""}`}>
                            {countdown}
                          </strong>
                          <span className="ledger-date-paren">({paymentShortLabel(s)})</span>
                        </>
                      ) : (
                        <span className="ledger-date-muted">{paymentShortLabel(s)}</span>
                      )
                    ) : (
                      <span className="ledger-date-muted">—</span>
                    )}
                  </span>

                  <span className="subscription-col-amount">
                    <strong className="subscription-cost">{money(s.amount, s.currency)}</strong>
                    <small>/ {cycleLabel(s)}</small>
                  </span>
                </button>

                <div className="subscription-ledger-actions">
                  {loaded.entries.length > 1 && (
                    <div className="subscription-order-controls" role="group" aria-label={`${s.name} sırasını değiştir`}>
                      <button
                        type="button"
                        className="ledger-order-btn"
                        disabled={loaded.locked || idx === 0}
                        onClick={() => reorderByStep(s.id, -1)}
                        title="Yukarı taşı"
                        aria-label={`${s.name} yukarı taşı`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="ledger-order-btn"
                        disabled={loaded.locked || idx === loaded.entries.length - 1}
                        onClick={() => reorderByStep(s.id, 1)}
                        title="Aşağı taşı"
                        aria-label={`${s.name} aşağı taşı`}
                      >
                        ▼
                      </button>
                    </div>
                  )}

                  <ActionMenu label={`${s.name} işlemleri`}>
                    <button type="button" disabled={loaded.locked} onClick={() => setDraft(s)}>
                      Düzenle
                    </button>
                    {idx > 0 && (
                      <button type="button" disabled={loaded.locked} onClick={() => reorderByStep(s.id, -1)}>
                        Yukarı taşı
                      </button>
                    )}
                    {idx < loaded.entries.length - 1 && (
                      <button type="button" disabled={loaded.locked} onClick={() => reorderByStep(s.id, 1)}>
                        Aşağı taşı
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={loaded.locked}
                      onClick={() => {
                        try {
                          commit(
                            loadSubscriptions().entries.map(v =>
                              v.id === s.id
                                ? { ...v, status: s.status === "active" ? "paused" : "active", updatedAt: Date.now() }
                                : v
                            )
                          );
                        } catch {
                          setError("Durum kaydedilemedi.");
                        }
                      }}
                    >
                      {s.status === "active" ? "Duraklat" : "Etkinleştir"}
                    </button>
                    <button
                      type="button"
                      className="danger-action"
                      disabled={loaded.locked}
                      onClick={() => {
                        if (window.confirm("Yalnızca ACKDeck abonelik kaydı silinsin mi? Hizmet sağlayıcısındaki aboneliğiniz değişmez.")) {
                          try {
                            commit(loadSubscriptions().entries.filter(v => v.id !== s.id));
                            offerUndo({ source: "subscriptions", record: s });
                          } catch {
                            setError("Abonelik silinemedi.");
                          }
                        }
                      }}
                    >
                      Kaydı sil
                    </button>
                  </ActionMenu>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loaded.entries.length && !draft && (
        <div className="surface subscriptions-empty-box">
          <Icon name="archive" size={28} />
          <p className="empty-title">Henüz eklenmiş bir abonelik yok</p>
          <p className="empty-desc">Spotify, Netflix, YouTube Premium gibi düzenli harcamalarını ekleyerek aylık bütçeni kontrol altına al.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setDraft(newSubscription())}
          >
            + İlk Aboneliği Ekle
          </button>
        </div>
      )}
    </section>
  );
}
