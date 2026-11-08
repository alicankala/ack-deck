import { ActionMenu } from "./ActionMenu";
import { useEffect, useState } from "react";
import { loadSubscriptions, saveSubscriptions } from "../subscriptionStore";
import { monthlyTotals, money, cycleLabel, paymentLabel, paymentOccurrence, type Subscription } from "../../shared/subscriptions";
import { newSubscription, SubscriptionForm } from "../../shared/SubscriptionForm";
import { EditorDialog } from "./EditorDialog";
import { offerUndo } from "../recordUndo";
import { Icon } from "./Icon";

export function Subscriptions({ compact = false, onOpen, initialId }: { compact?: boolean; onOpen?: () => void; initialId?: string }) {
  const [loaded, setLoaded] = useState(loadSubscriptions);
  const [draft, setDraft] = useState<Subscription | null>(null);
  const [error, setError] = useState("");

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

      {/* Modern 3'lü KPI Özet Paneli */}
      <div className="subscriptions-kpi-grid">
        <div className="subscriptions-kpi-card surface">
          <div className="subscriptions-kpi-header">
            <span className="kpi-label">Toplam Aylık Karşılık</span>
            <span className="kpi-icon-pill"><Icon name="archive" size={14} /></span>
          </div>
          <div className="subscriptions-kpi-value">
            {totals.length > 0
              ? totals.map(([cur, amt]) => <span key={cur} className="kpi-amount">{money(amt, cur)}</span>)
              : <span className="kpi-amount">₺0,00</span>
            }
          </div>
          <p className="kpi-hint">Farklı para birimleri ve dönemler aylık ortalamaya çevrilir.</p>
        </div>

        <div className="subscriptions-kpi-card surface">
          <div className="subscriptions-kpi-header">
            <span className="kpi-label">Aktif Abonelikler</span>
            <span className={`kpi-status-badge ${active.length > 0 ? "badge-active" : "badge-empty"}`}>
              {active.length > 0 ? `${active.length} Aktif` : "Kayıt Yok"}
            </span>
          </div>
          <div className="subscriptions-kpi-value">
            <span className="kpi-amount">{active.length} <small>hizmet</small></span>
          </div>
          <p className="kpi-hint">
            {loaded.entries.length > active.length
              ? `${loaded.entries.length - active.length} duraklatılmış abonelik bulunuyor.`
              : "Tüm abonelikleriniz aktif olarak izleniyor."}
          </p>
        </div>

        <div className="subscriptions-kpi-card surface">
          <div className="subscriptions-kpi-header">
            <span className="kpi-label">En Yakın Ödeme</span>
            <span className="kpi-icon-pill"><Icon name="speed" size={14} /></span>
          </div>
          <div className="subscriptions-kpi-value">
            {nextUpcoming ? (
              <span className="kpi-upcoming-name" title={nextUpcoming.name}>
                {nextUpcoming.name}
              </span>
            ) : (
              <span className="kpi-empty-text">Yaklaşan ödeme yok</span>
            )}
          </div>
          <p className="kpi-hint">
            {nextUpcoming ? (
              <span className="kpi-date-highlight">{paymentLabel(nextUpcoming)} · {money(nextUpcoming.amount, nextUpcoming.currency)}</span>
            ) : (
              "Planlanan bir sonraki fatura bulunmuyor."
            )}
          </p>
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
              commit([...loadSubscriptions().entries.filter(v => v.id !== s.id), s]);
              setDraft(null);
            }}
          />
        </EditorDialog>
      )}

      {/* Kart Listesi */}
      <div className="subscription-list">
        {loaded.entries.map(s => {
          const isPaused = s.status === "paused";
          const isCancelled = s.status === "cancelled";

          return (
            <article
              id={"subscription-" + s.id}
              className={`surface subscription-row ${initialId === s.id ? "record-highlight" : ""} ${isPaused ? "sub-paused" : ""}`}
              key={s.id}
            >
              <div className="subscription-initial" aria-hidden="true">
                {s.icon || s.name.slice(0, 1).toLocaleUpperCase("tr")}
              </div>

              <button
                type="button"
                className="subscription-info record-open"
                disabled={loaded.locked}
                onClick={() => setDraft(s)}
              >
                <div className="subscription-main-row">
                  <h2 className="subscription-title">{s.name}</h2>
                  <span className="subscription-cost">
                    {money(s.amount, s.currency)} <small>/ {cycleLabel(s)}</small>
                  </span>
                </div>

                <div className="subscription-meta-row">
                  <span className={`sub-status-pill ${isPaused ? "pill-paused" : isCancelled ? "pill-cancelled" : "pill-active"}`}>
                    {isPaused ? "Duraklatıldı" : isCancelled ? "İptal Edildi" : s.autoRenew ? "Otomatik Yenileniyor" : "Manuel Ödeme"}
                  </span>
                  <span className="sub-date-pill">
                    {paymentLabel(s)}
                  </span>
                </div>
              </button>

              <ActionMenu label={`${s.name} işlemleri`}>
                <button type="button" disabled={loaded.locked} onClick={() => setDraft(s)}>
                  Düzenle
                </button>
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
            </article>
          );
        })}
      </div>

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
