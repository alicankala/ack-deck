import { useState } from "react";
import { ActionMenu } from "../../src/components/ActionMenu";
import { MobileWeek } from "./ProductViews";
import { newSubscription } from "../../shared/SubscriptionForm";
import {
  money,
  moneyRounded,
  cycleLabel,
  paymentLabel,
  paymentShortLabel,
  paymentOccurrence,
  daysUntilPayment,
  paymentCountdownLabel,
  monthlyTotals,
  yearlyTotals,
  subscriptionShares,
  type Subscription,
} from "../../shared/subscriptions";
import type { CloudRecord, Mutation } from "../../shared/phone";

interface MobilePlanViewProps {
  planTab: "calendar" | "subscriptions";
  setPlanTab: (tab: "calendar" | "subscriptions") => void;
  busy: boolean;
  records: CloudRecord[];
  studyReminders: { id: string; leadMinutes: number | null }[];
  onSaveMutation: (mutation: Mutation) => Promise<void>;
  onOpenTask: (row: CloudRecord) => void;
  onNewTaskOnDay: (day: string) => void;
  onOpenSubscription: (sub: Subscription) => void;
  onUpdateStudyReminder: (programId: string, leadMinutes: number | null) => void;
  onDeleteSubscription: (row: CloudRecord) => void;
}

export function MobilePlanView({
  planTab,
  setPlanTab,
  busy,
  records,
  studyReminders,
  onSaveMutation,
  onOpenTask,
  onNewTaskOnDay,
  onOpenSubscription,
  onUpdateStudyReminder,
  onDeleteSubscription,
}: MobilePlanViewProps) {
  const [hiddenSubs, setHiddenSubs] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("ack-deck.mobile-hidden-subs.v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [subOrder, setSubOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("ack-deck.mobile-sub-order.v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showHiddenSubs, setShowHiddenSubs] = useState(false);

  function toggleHideSub(id: string) {
    setHiddenSubs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try {
        localStorage.setItem("ack-deck.mobile-hidden-subs.v1", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function moveSub(id: string, delta: -1 | 1, orderedIds: string[]) {
    const idx = orderedIds.indexOf(id);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= orderedIds.length) return;
    const next = [...orderedIds];
    const [item] = next.splice(idx, 1);
    next.splice(targetIdx, 0, item);
    setSubOrder(next);
    try {
      localStorage.setItem("ack-deck.mobile-sub-order.v1", JSON.stringify(next));
    } catch {}
  }

  const allSubRows = records.filter(r => r.kind === "subscriptions" && !r.deleted);
  const sortedSubs = [...allSubRows].sort((a, b) => {
    const idxA = subOrder.indexOf(a.id);
    const idxB = subOrder.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });
  const visibleSubs = sortedSubs.filter(r => !hiddenSubs.includes(r.id));
  const hiddenSubRows = sortedSubs.filter(r => hiddenSubs.includes(r.id));
  const visibleIds = visibleSubs.map(r => r.id);

  const allSubEntries = allSubRows.map(r => r.data as Subscription);
  const totals = monthlyTotals(allSubEntries);
  const annual = yearlyTotals(allSubEntries);
  const shares = subscriptionShares(allSubEntries, 4);
  const upcomingSubs = allSubEntries
    .filter(s => s.status === "active" && paymentOccurrence(s))
    .sort((a, b) => paymentOccurrence(a)!.at - paymentOccurrence(b)!.at);
  const nextUpcoming = upcomingSubs[0];
  const nextCountdown = nextUpcoming ? paymentCountdownLabel(nextUpcoming) : null;

  return (
    <>
      <div className="mobile-segmented-bar plan-toggle-bar">
        <button className={`segment-btn ${planTab === "calendar" ? "is-active" : ""}`} onClick={() => setPlanTab("calendar")}>
          Aylık Plan & Dersler
        </button>
        <button className={`segment-btn ${planTab === "subscriptions" ? "is-active" : ""}`} onClick={() => setPlanTab("subscriptions")}>
          Abonelikler ({allSubRows.length})
        </button>
      </div>

      {planTab === "calendar" ? (
        <MobileWeek
          disabled={busy}
          onSave={onSaveMutation}
          records={records}
          onOpen={row => (row.kind === "subscriptions" ? onOpenSubscription(row.data as Subscription) : onOpenTask(row))}
          onNew={onNewTaskOnDay}
          getReminder={id => studyReminders.find(r => r.id === id)?.leadMinutes ?? null}
          onReminderChange={onUpdateStudyReminder}
        />
      ) : (
        <>
          <div className="subscription-totals">
            <div className="subscription-totals-head">
              <div className="subscription-totals-copy">
                <span className="subscription-totals-label">Aylık Karşılık</span>
                <div className="subscription-totals-amounts">
                  {totals.length > 0 ? (
                    totals.map(([c, a]) => (
                      <strong key={c}>{money(a, c)}</strong>
                    ))
                  ) : (
                    <strong>0,00 ₺</strong>
                  )}
                </div>
                {annual.length > 0 && (
                  <span className="subscription-totals-annual">
                    Yıllık ~{annual.map(([c, a]) => moneyRounded(a, c)).join(" + ")}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="mobile-button-primary subscription-add-btn"
                onClick={() => onOpenSubscription(newSubscription())}
              >
                + Abonelik Ekle
              </button>
            </div>

            {shares.length > 0 && (
              <div className="mobile-sub-shares">
                <div className="mobile-sub-share-track" role="img" aria-label="Pay dağılımı">
                  {shares.map(seg => (
                    <span
                      key={seg.id}
                      className="mobile-sub-share-segment"
                      style={{ width: `${Math.max(seg.exactPercent, 5)}%`, backgroundColor: seg.color }}
                    />
                  ))}
                </div>
                <div className="mobile-sub-share-legend">
                  {shares.map(seg => (
                    <span key={seg.id} className="mobile-sub-share-item">
                      <i className="mobile-sub-share-dot" style={{ backgroundColor: seg.color }} aria-hidden="true" />
                      <span>{seg.compactName} %{seg.percent}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {nextUpcoming && (
              <div className="mobile-sub-upcoming-line">
                <span className="mobile-sub-upcoming-label">Sıradaki:</span>
                <strong className="mobile-sub-upcoming-name">{nextUpcoming.name}</strong>
                <span className="mobile-sub-upcoming-meta">
                  {nextCountdown ? `${nextCountdown} (${paymentShortLabel(nextUpcoming)})` : paymentShortLabel(nextUpcoming)}
                </span>
              </div>
            )}
          </div>

          <div className="subscription-list">
            {visibleSubs.map((row, idx) => {
              const sub = row.data as Subscription;
              const days = daysUntilPayment(sub);
              const countdown = paymentCountdownLabel(sub);
              const shareColor = shares.find(seg => seg.id === sub.id)?.color;

              return (
                <article className={`subscription-row ${sub.status !== "active" ? "is-inactive-sub" : ""}`} key={row.id}>
                  <button className="mobile-task-open mobile-sub-ledger-open" type="button" onClick={() => onOpenSubscription(sub)}>
                    <span
                      className="mobile-sub-monogram"
                      style={shareColor ? { borderColor: `${shareColor}44`, color: shareColor } : undefined}
                      aria-hidden="true"
                    >
                      {sub.icon || sub.name.slice(0, 1).toLocaleUpperCase("tr")}
                    </span>

                    <span className="mobile-sub-ledger-body">
                      <span className="mobile-sub-ledger-top">
                        <h3 className="mobile-sub-title">{sub.name}</h3>
                        <span className="mobile-sub-amount">
                          <strong>{money(sub.amount, sub.currency)}</strong>
                          <small>/{cycleLabel(sub)}</small>
                        </span>
                      </span>

                      <span className="mobile-sub-ledger-bottom">
                        {sub.status === "active" ? (
                          <span className={`subscription-badge status-active ${days !== null && days <= 7 ? "is-soon" : ""}`}>
                            {countdown ? `${countdown} · ${paymentLabel(sub)}` : paymentLabel(sub)}
                          </span>
                        ) : (
                          <span className={`subscription-badge status-${sub.status}`}>
                            {sub.status === "paused" ? "Duraklatıldı" : "İptal edildi"}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <div className="subscription-card-actions">
                    <div className="subscription-order-buttons">
                      <button
                        type="button"
                        className="order-btn"
                        disabled={idx === 0}
                        onClick={() => moveSub(row.id, -1, visibleIds)}
                        title="Yukarı taşı"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="order-btn"
                        disabled={idx === visibleSubs.length - 1}
                        onClick={() => moveSub(row.id, 1, visibleIds)}
                        title="Aşağı taşı"
                      >
                        ▼
                      </button>
                    </div>
                    <ActionMenu label={sub.name + " işlemleri"}>
                      <button onClick={() => toggleHideSub(row.id)}>Aboneliği Gizle</button>
                      <button onClick={() => onOpenSubscription(sub)}>Düzenle</button>
                      <button
                        className="danger-action"
                        disabled={busy}
                        onClick={() => onDeleteSubscription(row)}
                      >
                        Kaydı sil
                      </button>
                    </ActionMenu>
                  </div>
                </article>
              );
            })}
            {visibleSubs.length === 0 && <p className="status" style={{ textAlign: "center", padding: "1.5rem" }}>Görünür abonelik yok.</p>}
          </div>

          {hiddenSubRows.length > 0 && (
            <div className="hidden-subs-container">
              <button
                type="button"
                className="text-action hidden-subs-toggle"
                onClick={() => setShowHiddenSubs(v => !v)}
              >
                {showHiddenSubs ? "Gizlenen abonelikleri kapat" : `Gizlenen abonelikler (${hiddenSubRows.length})`}
              </button>
              {showHiddenSubs && (
                <div className="subscription-list is-hidden-sub-list">
                  {hiddenSubRows.map(row => {
                    const sub = row.data as Subscription;
                    return (
                      <article className="subscription-row is-hidden-sub" key={row.id}>
                        <button className="mobile-task-open" type="button" onClick={() => onOpenSubscription(sub)}>
                          <h3>{sub.name} <small style={{ color: "var(--app-muted)" }}>(Gizli)</small></h3>
                          <p className="subscription-price">{money(sub.amount, sub.currency)}</p>
                        </button>
                        <button
                          type="button"
                          className="unhide-btn"
                          onClick={() => toggleHideSub(row.id)}
                        >
                          Görünür Yap
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
