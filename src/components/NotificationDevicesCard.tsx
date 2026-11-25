import { Icon } from "./Icon";
import type { PhoneStatus } from "../phoneClient";

export type NotificationDevice = {
  id: string;
  name: string;
  lastSeen: number;
  notifications: number | null;
};

type NotificationDevicesCardProps = {
  devices: NotificationDevice[];
  phoneState: PhoneStatus | null;
  desktopMaster: boolean;
  mobileMaster: boolean;
  testBusy: boolean;
  testingDeviceId: string | null;
  onTestDesktop: () => void;
  onTestDevicePush: (deviceId: string, deviceName: string) => void;
};

/** Unified desktop & paired mobile notification test rows stacked vertically. */
export function NotificationDevicesCard({
  devices,
  phoneState,
  desktopMaster,
  mobileMaster,
  testBusy,
  testingDeviceId,
  onTestDesktop,
  onTestDevicePush,
}: NotificationDevicesCardProps) {
  return (
    <section className="settings-card surface local-settings" aria-labelledby="notification-tests-heading">
      <div className="notification-matrix-header">
        <div>
          <h3 id="notification-tests-heading">Bildirim Testi &amp; Eşleştirilmiş Cihazlar</h3>
          <p className="notification-section-desc">
            Masaüstü ve telefon bildirimlerinin anlık iletimini buradan test edebilirsin.
          </p>
        </div>
      </div>

      <div className="notification-device-list">
        <div className="notification-device-row">
          <div className="notification-device-info">
            <strong className="notification-device-name">💻 Windows Masaüstü</strong>
            <div className="notification-device-meta">
              Durum:{" "}
              <span className={`notification-device-state ${desktopMaster ? "is-allowed" : "is-missing"}`}>
                {desktopMaster ? "Açık (Aktif)" : "Sessizde (Kapalı)"}
              </span>
              {" · "}
              Windows Bildirim Merkezi entegrasyonu
            </div>
          </div>

          <button
            type="button"
            className="button button-secondary notification-device-test-btn"
            onClick={onTestDesktop}
            disabled={testBusy || !desktopMaster}
          >
            <Icon name="bell" size={15} />
            <span>{testBusy ? "Gönderiliyor..." : "Masaüstüne Test Gönder"}</span>
          </button>
        </div>

        {devices.length > 0 ? (
          devices.map((dev) => (
            <div key={dev.id} className="notification-device-row">
              <div className="notification-device-info">
                <strong className="notification-device-name">📱 {dev.name}</strong>
                <div className="notification-device-meta">
                  Push Durumu:{" "}
                  <span
                    className={`notification-device-state ${
                      dev.notifications && mobileMaster ? "is-allowed" : "is-missing"
                    }`}
                  >
                    {!mobileMaster
                      ? "Sessizde (Kapalı)"
                      : dev.notifications
                        ? "İzin Verildi (Aktif)"
                        : "Abonelik Yok veya Kapalı"}
                  </span>
                  {" · "}
                  Son bağlantı:{" "}
                  {new Date(dev.lastSeen).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              <button
                type="button"
                className="button button-secondary notification-device-test-btn"
                disabled={testingDeviceId !== null || !dev.notifications || !mobileMaster}
                onClick={() => onTestDevicePush(dev.id, dev.name)}
              >
                <Icon name="bell" size={15} />
                <span>{testingDeviceId === dev.id ? "İletiliyor..." : "Telefona Test Gönder"}</span>
              </button>
            </div>
          ))
        ) : (
          <div className="notification-device-row is-muted">
            <div className="notification-device-info">
              <strong className="notification-device-name">📱 Mobil Cihaz</strong>
              <div className="notification-device-meta">
                {phoneState?.enabled
                  ? "Henüz eşleştirilmiş cihaz yok · Telefon sekmesinden eşleştirebilirsin."
                  : "Telefon entegrasyonu kapalı · Telefon sekmesinden eşleştirme yapabilirsin."}
              </div>
            </div>

            <button
              type="button"
              className="button button-secondary notification-device-test-btn"
              disabled
            >
              <Icon name="bell" size={15} />
              <span>Telefona Test Gönder</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
