import type { NotificationPreferences } from "../../shared/notificationPreferences";

export type NotificationBooleanKey =
  | "desktopTasks"
  | "desktopStudy"
  | "desktopPrayers"
  | "desktopPomodoro"
  | "desktopDormMenu"
  | "desktopSubscriptions"
  | "desktopMatches"
  | "mobileTasks"
  | "mobileStudy"
  | "mobilePrayers"
  | "mobileDormMenu"
  | "mobileSubscriptions"
  | "mobileMatches";

export type UnifiedChannelRow = {
  id: string;
  title: string;
  description: string;
  desktopKey: NotificationBooleanKey;
  mobileKey: NotificationBooleanKey | null;
};

export const UNIFIED_CHANNELS: UnifiedChannelRow[] = [
  {
    id: "tasks",
    title: "Görevler & Alarmlar",
    description: "Teslim saati ve erken görev uyarıları",
    desktopKey: "desktopTasks",
    mobileKey: "mobileTasks",
  },
  {
    id: "study",
    title: "Ders Programı",
    description: "Çalışma blokları ve 15 dk öncesi hatırlatma",
    desktopKey: "desktopStudy",
    mobileKey: "mobileStudy",
  },
  {
    id: "prayers",
    title: "Namaz Vakitleri",
    description: "Vakit ve vakit öncesi ezan uyarıları",
    desktopKey: "desktopPrayers",
    mobileKey: "mobilePrayers",
  },
  {
    id: "pomodoro",
    title: "Pomodoro Odak & Mola",
    description: "Odak seansı ve mola bitiş uyarıları",
    desktopKey: "desktopPomodoro",
    mobileKey: null,
  },
  {
    id: "dorm",
    title: "Yurt Yemek Menüsü",
    description: "Günlük Altınkalem / KYK menü özeti",
    desktopKey: "desktopDormMenu",
    mobileKey: "mobileDormMenu",
  },
  {
    id: "subs",
    title: "Abonelik & İptal",
    description: "Ödeme ve iptal günü hatırlatmaları",
    desktopKey: "desktopSubscriptions",
    mobileKey: "mobileSubscriptions",
  },
  {
    id: "sports",
    title: "Spor (GS, A Milli & F1)",
    description: "Maç ve F1 ana yarışından 30 dk önce yayın kanalıyla hatırlatma",
    desktopKey: "desktopMatches",
    mobileKey: "mobileMatches",
  },
];

export const DESKTOP_CHANNEL_KEYS = UNIFIED_CHANNELS.map((c) => c.desktopKey);
export const MOBILE_CHANNEL_KEYS = UNIFIED_CHANNELS.flatMap((c) => (c.mobileKey ? [c.mobileKey] : []));

type UnifiedNotificationMatrixProps = {
  prefs: NotificationPreferences;
  onToggleMaster: (target: "desktopMaster" | "mobileMaster", enabled: boolean) => void;
  onToggleChannel: (key: NotificationBooleanKey, enabled: boolean) => void;
};

export function NotificationChannelGroup({
  prefs,
  onToggleMaster,
  onToggleChannel,
}: UnifiedNotificationMatrixProps) {
  return (
    <section className="settings-card surface local-settings" aria-labelledby="unified-notifications-heading">
      <div className="notification-matrix-header">
        <div>
          <h3 id="unified-notifications-heading">Bildirim Kanalları</h3>
          <p className="notification-section-desc">
            Her konu için masaüstü ve telefon bildirimlerini tek satırdan açıp kapatabilirsin.
          </p>
        </div>
        <div className="notification-matrix-masters">
          <label className={`notification-master-toggle ${prefs.desktopMaster ? "is-desktop-active" : ""}`}>
            <input
              type="checkbox"
              checked={prefs.desktopMaster}
              onChange={(e) => onToggleMaster("desktopMaster", e.target.checked)}
            />
            <span>💻 Masaüstü: {prefs.desktopMaster ? "Açık" : "Kapalı"}</span>
          </label>
          <label className={`notification-master-toggle ${prefs.mobileMaster ? "is-mobile-active" : ""}`}>
            <input
              type="checkbox"
              checked={prefs.mobileMaster}
              onChange={(e) => onToggleMaster("mobileMaster", e.target.checked)}
            />
            <span>📱 Mobil: {prefs.mobileMaster ? "Açık" : "Kapalı"}</span>
          </label>
        </div>
      </div>

      <div className="notification-matrix-table">
        <div className="notification-matrix-row is-head">
          <span>Kategori</span>
          <span className="notification-matrix-col">💻 Masaüstü</span>
          <span className="notification-matrix-col">📱 Mobil</span>
        </div>

        {UNIFIED_CHANNELS.map((row) => (
          <div key={row.id} className="notification-matrix-row">
            <div className="notification-matrix-info">
              <span className="notification-channel-title">{row.title}</span>
              <span className="notification-channel-desc">{row.description}</span>
            </div>
            <label className={`notification-matrix-col notification-matrix-check ${!prefs.desktopMaster ? "is-disabled" : ""}`}>
              <input
                type="checkbox"
                checked={prefs[row.desktopKey] !== false}
                disabled={!prefs.desktopMaster}
                aria-label={`${row.title} Masaüstü bildirimi`}
                onChange={(e) => onToggleChannel(row.desktopKey, e.target.checked)}
              />
            </label>
            <div className="notification-matrix-col">
              {row.mobileKey ? (
                <label className={`notification-matrix-check ${!prefs.mobileMaster ? "is-disabled" : ""}`}>
                  <input
                    type="checkbox"
                    checked={prefs[row.mobileKey] !== false}
                    disabled={!prefs.mobileMaster}
                    aria-label={`${row.title} Mobil bildirimi`}
                    onChange={(e) => onToggleChannel(row.mobileKey!, e.target.checked)}
                  />
                </label>
              ) : (
                <span className="notification-matrix-na" title="Yalnızca masaüstü">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
