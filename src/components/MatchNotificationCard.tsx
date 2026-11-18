import type { NotificationPreferences } from "../../shared/notificationPreferences";

type Props = {
  prefs: NotificationPreferences;
  onUpdate: (patch: Partial<NotificationPreferences>) => void;
};

export function MatchNotificationCard({ prefs, onUpdate }: Props) {
  return (
    <section className="settings-card surface local-settings" aria-labelledby="match-reminders-heading">
      <div className="notification-group-header">
        <div>
          <h3 id="match-reminders-heading">⚽ Maç Hatırlatma Tercihleri</h3>
          <p className="notification-section-desc">
            Gereksiz bildirim yorgunluğu olmadan maç saatine seçtiğiniz süre kala tek bildirim gönderilir.
          </p>
        </div>
      </div>
      <div className="notification-channel-list" style={{ marginTop: "0.75rem" }}>
        <label className="notification-channel-row">
          <div className="notification-channel-info">
            <span className="notification-channel-title">Galatasaray Maçları</span>
            <span className="notification-channel-desc">Süper Lig, Türkiye Kupası ve Avrupa maçları</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.matchTeamGalatasaray !== false}
            onChange={(e) => onUpdate({ matchTeamGalatasaray: e.target.checked })}
          />
        </label>
        <label className="notification-channel-row">
          <div className="notification-channel-info">
            <span className="notification-channel-title">Türkiye A Milli Takım Maçları</span>
            <span className="notification-channel-desc">Resmi ve hazırlık milli maçları</span>
          </div>
          <input
            type="checkbox"
            checked={prefs.matchTeamTurkey !== false}
            onChange={(e) => onUpdate({ matchTeamTurkey: e.target.checked })}
          />
        </label>
        <div className="notification-channel-row">
          <div className="notification-channel-info">
            <span className="notification-channel-title">Bildirim Zamanı</span>
            <span className="notification-channel-desc">Maç başlamadan kaç dakika önce hatırlatılsın</span>
          </div>
          <select
            className="settings-select"
            value={prefs.matchLeadMinutes ?? 30}
            onChange={(e) => onUpdate({ matchLeadMinutes: Number(e.target.value) })}
            aria-label="Maç bildirimi erken uyarı süresi"
          >
            <option value={15}>15 dk önce</option>
            <option value={30}>30 dk önce (Önerilen)</option>
            <option value={60}>60 dk önce</option>
          </select>
        </div>
      </div>
    </section>
  );
}
