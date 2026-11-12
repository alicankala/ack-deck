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
  mobileMaster: boolean;
  testingDeviceId: string | null;
  onTestDevicePush: (deviceId: string, deviceName: string) => void;
};

/** Paired mobile devices list and push notification test actions. */
export function NotificationDevicesCard({
  devices,
  phoneState,
  mobileMaster,
  testingDeviceId,
  onTestDevicePush,
}: NotificationDevicesCardProps) {
  return (
    <div className="notification-devices-section">
      <h3>Eşleştirilmiş Cihazlar & Push Testi</h3>
      {devices.length > 0 ? (
        <div className="notification-device-list">
          {devices.map((dev) => (
            <div key={dev.id} className="notification-device-row">
              <div>
                <strong className="notification-device-name">{dev.name}</strong>
                <div className="notification-device-meta">
                  Push Durumu:{" "}
                  <span className={`notification-device-state ${dev.notifications ? "is-allowed" : "is-missing"}`}>
                    {dev.notifications ? "İzin Verildi (Aktif)" : "Abonelik Yok veya Kapalı"}
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
                {testingDeviceId === dev.id ? "İletiliyor..." : "Telefona Test Push Gönder"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="notification-empty-devices">
          {phoneState?.enabled
            ? "Şu an eşleştirilmiş bir cihaz bulunmuyor. Telefon sekmesinden cihazınızı eşleştirebilirsiniz."
            : "Telefon entegrasyonu henüz açık değil. Telefon sekmesinden eşleştirme yaparak mobil bildirimleri etkinleştirebilirsiniz."}
        </p>
      )}
    </div>
  );
}
