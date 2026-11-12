import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { type NotificationPreferences } from "../../shared/notificationPreferences";
import { loadNotificationPreferences, saveNotificationPreferences } from "../notificationStore";
import { notifyDesktop } from "../desktopClient";
import { phoneRequest, phoneStatus, type PhoneStatus } from "../phoneClient";
import { DESKTOP_CHANNELS, MOBILE_CHANNELS, NotificationChannelGroup } from "./NotificationChannelGroup";
import { NotificationDevicesCard, type NotificationDevice } from "./NotificationDevicesCard";
import "./notificationSettings.css";

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(loadNotificationPreferences);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [phoneState, setPhoneState] = useState<PhoneStatus | null>(null);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  function clearFeedbackTimer() {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }

  function showFeedback(kind: "success" | "error", text: string, autoClearMs?: number) {
    clearFeedbackTimer();
    setFeedback({ kind, text });
    if (autoClearMs) {
      feedbackTimerRef.current = window.setTimeout(() => {
        feedbackTimerRef.current = null;
        setFeedback(null);
      }, autoClearMs);
    }
  }

  useEffect(() => {
    let active = true;
    const handleChanged = (e: Event) => {
      const detail = (e as CustomEvent<NotificationPreferences>).detail;
      setPrefs(detail ?? loadNotificationPreferences());
    };
    window.addEventListener("ack-notification-preferences-changed", handleChanged);

    void phoneStatus()
      .then((st) => {
        if (!active) return;
        setPhoneState(st);
        if (st.enabled) {
          void phoneRequest<{ devices: NotificationDevice[] }>("devices")
            .then((res) => {
              if (active && Array.isArray(res?.devices)) setDevices(res.devices);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      clearFeedbackTimer();
      window.removeEventListener("ack-notification-preferences-changed", handleChanged);
    };
  }, []);

  function updatePrefs(patch: Partial<NotificationPreferences>) {
    const next: NotificationPreferences = { ...prefs, ...patch };
    if (saveNotificationPreferences(next)) {
      setPrefs(next);
      showFeedback("success", "Bildirim tercihleri güncellendi.", 3000);
      return;
    }
    showFeedback("error", "Bildirim tercihleri kaydedilemedi.");
  }

  function toggleAll(enable: boolean) {
    const next: NotificationPreferences = {
      desktopMaster: enable, mobileMaster: enable,
      desktopTasks: enable, desktopStudy: enable, desktopPrayers: enable,
      desktopPomodoro: enable, desktopDormMenu: enable, desktopSubscriptions: enable,
      mobileTasks: enable, mobileStudy: enable, mobilePrayers: enable,
      mobileDormMenu: enable, mobileSubscriptions: enable,
    };
    if (saveNotificationPreferences(next)) {
      setPrefs(next);
      showFeedback(
        "success",
        enable
          ? "Tüm masaüstü ve mobil bildirim kanalları açıldı."
          : "Tüm bildirimler sessize alındı (hiçbir bildirim gönderilmeyecek).",
        3500,
      );
    }
  }

  async function handleTestDesktop() {
    setTestBusy(true);
    clearFeedbackTimer();
    setFeedback(null);
    try {
      await notifyDesktop(
        "🔔 ACKDeck Test Bildirimi",
        "Masaüstü bildirimleriniz başarıyla aktif ve sorunsuz çalışıyor!",
      );
      showFeedback("success", "Masaüstü test bildirimi gönderildi. Sağ alt köşeyi kontrol edin.");
    } catch {
      showFeedback("error", "Windows bildirim sistemi yanıt vermedi.");
    } finally {
      setTestBusy(false);
    }
  }

  async function handleTestDevicePush(deviceId: string, deviceName: string) {
    setTestingDeviceId(deviceId);
    clearFeedbackTimer();
    setFeedback(null);
    try {
      await phoneRequest("push/test-device", { deviceId });
      showFeedback("success", `"${deviceName}" cihazına test push bildirimi başarıyla iletildi.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test push iletilemedi.";
      showFeedback("error", `${deviceName}: ${msg}`);
    } finally {
      setTestingDeviceId(null);
    }
  }

  const activeDesktopCount = DESKTOP_CHANNELS.filter((item) => prefs[item.key]).length;
  const activeMobileCount = MOBILE_CHANNELS.filter((item) => prefs[item.key]).length;

  return (
    <div className="notifications-settings-container">
      {/* Overview & Global Master Actions */}
      <section className="settings-card surface local-settings" aria-labelledby="notification-overview-heading">
        <div className="settings-card-heading notification-overview-head">
          <span className="feature-icon notification-overview-icon">
            <Icon name={prefs.desktopMaster || prefs.mobileMaster ? "bell" : "bellOff"} size={22} />
          </span>
          <div className="notification-overview-copy">
            <h2 id="notification-overview-heading">Bildirim Merkezi & Kanal Kontrolleri</h2>
            <p className="notification-subtitle">
              Masaüstü ve mobil bildirimlerin tamamını tek noktadan yönetebilir, kanalları bağımsız açıp kapatabilir veya tek tıkla tümünü susturabilirsin.
            </p>
          </div>
          <span className={`key-status notification-overview-badge ${prefs.desktopMaster || prefs.mobileMaster ? "saved" : ""}`}>
            {prefs.desktopMaster && prefs.mobileMaster
              ? "Tüm Kanallar Açık"
              : prefs.desktopMaster || prefs.mobileMaster
              ? "Kısmi Aktif"
              : "Tümü Sessizde"}
          </span>
        </div>

        <div className="notification-status-bar">
          <div className="notification-status-summary">
            <strong>Durum Özeti: </strong>
            <span className={`notification-status-chip ${prefs.desktopMaster ? "is-desktop-on" : "is-off"}`}>
              Masaüstü {prefs.desktopMaster ? `(${activeDesktopCount}/6 aktif)` : "(Kapalı)"}
            </span>
            {" · "}
            <span className={`notification-status-chip ${prefs.mobileMaster ? "is-mobile-on" : "is-off"}`}>
              Mobil Push {prefs.mobileMaster ? `(${activeMobileCount}/5 aktif)` : "(Kapalı)"}
            </span>
          </div>

          <div className="notification-status-actions">
            <button type="button" className="button button-secondary notification-action-btn" onClick={() => toggleAll(true)}>
              Tüm Bildirimleri Aç
            </button>
            <button type="button" className="button button-secondary notification-action-btn is-danger" onClick={() => toggleAll(false)}>
              Tümünü Sessize Al
            </button>
          </div>
        </div>

        {feedback && (
          <p className={"feedback notification-feedback " + feedback.kind} role="status">
            {feedback.text}
          </p>
        )}
      </section>

      {/* Desktop Notifications Section */}
      <NotificationChannelGroup
        headingId="desktop-notifications-heading"
        title="💻 Masaüstü Bildirimleri (Windows)"
        subtitle="Windows Bildirim Merkezi ve sistem tepsisi üzerinden bilgisayarınızda gösterilen bildirimler"
        masterEnabled={prefs.desktopMaster}
        masterActiveClass="is-desktop-active"
        masterLabelPrefix="Masaüstü Bildirimleri"
        warningText="Masaüstü ana bildirim şalteri kapalı olduğu için Windows üzerinden hiçbir hatırlatma veya alarm gösterilmeyecektir."
        channels={DESKTOP_CHANNELS}
        prefs={prefs}
        onToggleMaster={(enabled) => updatePrefs({ desktopMaster: enabled })}
        onToggleChannel={(key, enabled) => updatePrefs({ [key]: enabled })}
      >
        <div className="notification-test-row">
          <button
            type="button"
            className="button button-secondary notification-test-btn"
            onClick={handleTestDesktop}
            disabled={testBusy || !prefs.desktopMaster}
          >
            <Icon name="bell" size={16} />
            <span>{testBusy ? "Gönderiliyor..." : "Masaüstü Test Bildirimi Gönder"}</span>
          </button>
          <small className="notification-inline-hint">
            Windows Bildirim Merkezi entegrasyonunu doğrulamak için tıkla.
          </small>
        </div>
      </NotificationChannelGroup>

      {/* Mobile Push Notifications Section */}
      <NotificationChannelGroup
        headingId="mobile-notifications-heading"
        title="📱 Mobil Push Bildirimleri (iPhone & Android)"
        subtitle="Eşleştirilmiş telefonunuza PC açık veya kapalıyken 7/24 iletilen anlık Web Push bildirimleri"
        masterEnabled={prefs.mobileMaster}
        masterActiveClass="is-mobile-active"
        masterLabelPrefix="Mobil Bildirimler"
        warningText="Mobil ana push şalteri kapalı olduğu için Cloudflare sunucusu eşleştirilmiş telefonlarınıza hiçbir anlık push bildirimi göndermeyecektir."
        channels={MOBILE_CHANNELS}
        prefs={prefs}
        onToggleMaster={(enabled) => updatePrefs({ mobileMaster: enabled })}
        onToggleChannel={(key, enabled) => updatePrefs({ [key]: enabled })}
      >
        <NotificationDevicesCard
          devices={devices}
          phoneState={phoneState}
          mobileMaster={prefs.mobileMaster}
          testingDeviceId={testingDeviceId}
          onTestDevicePush={handleTestDevicePush}
        />
      </NotificationChannelGroup>

      {/* Helpful Tips & Focus Mode Info */}
      <section className="settings-card surface local-settings notification-tips-card">
        <h3>💡 Bildirim İpuçları & Odaklanma Modu</h3>
        <ul className="notification-tips-list">
          <li>
            <strong>Windows Odaklanma Yardımı (Focus Assist):</strong> Windows ayarlarında "Rahatsız Etmeyin" veya "Odaklanma" açıkken bildirimler ekrana çıkmadan doğrudan Windows Bildirim Merkezi çekmecesine birikir.
          </li>
          <li>
            <strong>iPhone / iOS Push Bildirimleri:</strong> iOS Web Push standardı gereği ACKDeck Mobile'ın Safari menüsünden <em>"Ana Ekrana Ekle"</em> ile yüklenmesi ve uygulama içerisinden bildirim iznine izin verilmiş olması gerekir.
          </li>
          <li>
            <strong>Pil & Veri Dostu:</strong> Bildirim denetimleri sunucu tarafında Cloudflare edge cron ile yönetilir; telefonunuzun şarjını tüketmez ve arka planda çalışmayı gerektirmez.
          </li>
        </ul>
      </section>
    </div>
  );
}
