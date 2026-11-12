import type { ReactNode } from "react";
import { type NotificationPreferences } from "../../shared/notificationPreferences";

export type ChannelOption = {
  key: keyof NotificationPreferences;
  title: string;
  description: string;
};

export const DESKTOP_CHANNELS: readonly ChannelOption[] = [
  {
    key: "desktopTasks",
    title: "Görev Alarmları & Hatırlatıcılar",
    description:
      "Görevlerin teslim saatinde veya görev için ayarlanan erken bildirim süresinde (15 dk, 30 dk, 1 saat önce vb.) masaüstü bildirimi gösterir.",
  },
  {
    key: "desktopStudy",
    title: "Ders Programı & Çalışma Blokları",
    description:
      "Haftalık ders programınızdaki oturumların başlangıç saatinde veya ders öncesinde erken uyarı masaüstü bildirimi iletir.",
  },
  {
    key: "desktopPrayers",
    title: "Namaz Vakitleri & Ezan Uyarıları",
    description:
      "Vakit girdiğinde veya vakit öncesi belirlenen sürede (5, 10, 15, 30 dk önce) masaüstü Bildirim Merkezi üzerinden nazikçe uyarır.",
  },
  {
    key: "desktopPomodoro",
    title: "Pomodoro Odak & Mola Bildirimleri",
    description:
      "25 dakikalık odak seansı bittiğinde veya mola süresi tamamlandığında masaüstü toast bildirimi ve hafif sesli uyarı verir.",
  },
  {
    key: "desktopDormMenu",
    title: "Yurt Yemek Menüsü Hatırlatması",
    description:
      "Öğle ve akşam saatlerinde günün Altınkalem / KYK yurt yemek menüsünü masaüstünde bildirir.",
  },
  {
    key: "desktopSubscriptions",
    title: "Abonelik & Fatura Hatırlatıcıları",
    description:
      "Yenileme ve ödeme günü yaklaşan aboneliklerinizin tutar ve tarihini masaüstünde önceden hatırlatır.",
  },
];

export const MOBILE_CHANNELS: readonly ChannelOption[] = [
  {
    key: "mobileTasks",
    title: "Mobil Görev Alarmları & Push Hatırlatıcılar",
    description:
      "Bilgisayarınız kapalıyken bile teslim saati gelen veya erken uyarısı kurulmuş görevlerin bildirimi anında iPhone/Android kilit ekranınıza düşer.",
  },
  {
    key: "mobileStudy",
    title: "Mobil Ders Programı & Oturum Bildirimleri",
    description:
      "PC kapalıyken Cloudflare zamanlayıcısı ders saatinden 15 dk önce ve ders anında telefonunuza ders hatırlatması gönderir.",
  },
  {
    key: "mobilePrayers",
    title: "Mobil Ezan & Namaz Vakitleri",
    description:
      "Vakit girdiğinde ve vakit öncesi erken bildirim dakikasında telefonunuza sessiz veya sesli kilit ekranı ezan bildirimi iletir.",
  },
  {
    key: "mobileDormMenu",
    title: "Mobil Günlük Yemek Menüsü (12:30 Push)",
    description:
      "Her gün saat 12:30'da günün akşam yemeği menüsünü telefona doğrudan push bildirimi olarak iletir.",
  },
  {
    key: "mobileSubscriptions",
    title: "Mobil Abonelik & Ödeme Günü Hatırlatıcıları",
    description:
      "Fatura veya yenileme tarihi yaklaşan aboneliklerinizin tutar bilgisini telefon kilit ekranınıza gönderir.",
  },
];

type NotificationChannelGroupProps = {
  headingId: string;
  title: string;
  subtitle: string;
  masterEnabled: boolean;
  masterActiveClass: "is-desktop-active" | "is-mobile-active";
  masterLabelPrefix: string;
  warningText: string;
  channels: readonly ChannelOption[];
  prefs: NotificationPreferences;
  onToggleMaster: (enabled: boolean) => void;
  onToggleChannel: (key: keyof NotificationPreferences, enabled: boolean) => void;
  children?: ReactNode;
};

/** Notification channel group card with master toggle and per-channel switches. */
export function NotificationChannelGroup({
  headingId,
  title,
  subtitle,
  masterEnabled,
  masterActiveClass,
  masterLabelPrefix,
  warningText,
  channels,
  prefs,
  onToggleMaster,
  onToggleChannel,
  children,
}: NotificationChannelGroupProps) {
  return (
    <section className="settings-card surface local-settings" aria-labelledby={headingId}>
      <div className="notification-section-header">
        <div>
          <h2 id={headingId}>{title}</h2>
          <p className="notification-subtitle">{subtitle}</p>
        </div>

        <label className={`notification-master-toggle ${masterEnabled ? masterActiveClass : ""}`}>
          <input
            type="checkbox"
            checked={masterEnabled}
            onChange={(e) => onToggleMaster(e.target.checked)}
          />
          <span>
            {masterLabelPrefix}: {masterEnabled ? "Açık" : "Kapalı"}
          </span>
        </label>
      </div>

      {!masterEnabled && <p className="notification-warning-banner">{warningText}</p>}

      <div className={`toggle-settings notification-channel-list ${masterEnabled ? "" : "is-disabled"}`}>
        {channels.map((item) => (
          <label key={item.key} className="notification-channel-row">
            <input
              type="checkbox"
              checked={prefs[item.key]}
              disabled={!masterEnabled}
              onChange={(e) => onToggleChannel(item.key, e.target.checked)}
            />
            <div className="notification-channel-copy">
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </div>
          </label>
        ))}
      </div>

      {children}
    </section>
  );
}
