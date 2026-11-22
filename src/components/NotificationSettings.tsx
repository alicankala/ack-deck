import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { type NotificationPreferences } from "../../shared/notificationPreferences";
import { loadNotificationPreferences, saveNotificationPreferences } from "../notificationStore";
import { notifyDesktop } from "../desktopClient";
import { phoneRequest, phoneStatus, type PhoneStatus } from "../phoneClient";
import {
  DESKTOP_CHANNEL_KEYS,
  MOBILE_CHANNEL_KEYS,
  NotificationChannelGroup,
} from "./NotificationChannelGroup";
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

  function showFeedback(kind: "success" | "error", text: string, autoClearMs = 3500) {
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
        if (st.configured) {
          return phoneRequest<{ devices: NotificationDevice[] }>("devices")
            .then((res) => {
              if (active && Array.isArray(res?.devices)) setDevices(res.devices);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      window.removeEventListener("ack-notification-preferences-changed", handleChanged);
      clearFeedbackTimer();
    };
  }, []);

  function updatePrefs(patch: Partial<NotificationPreferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotificationPreferences(next);
  }

  function toggleAll(enabled: boolean) {
    updatePrefs({
      desktopMaster: enabled,
      desktopTasks: enabled,
      desktopStudy: enabled,
      desktopPrayers: enabled,
      desktopPomodoro: enabled,
      desktopDormMenu: enabled,
      desktopSubscriptions: enabled,
      desktopMatches: enabled,
      mobileMaster: enabled,
      mobileTasks: enabled,
      mobileStudy: enabled,
      mobilePrayers: enabled,
      mobileDormMenu: enabled,
      mobileSubscriptions: enabled,
      mobileMatches: enabled,
    });
    showFeedback("success", enabled ? "Tüm bildirim kanalları açıldı." : "Tüm bildirimler sessize alındı.", 3000);
  }

  async function handleTestDesktop() {
    setTestBusy(true);
    clearFeedbackTimer();
    setFeedback(null);
    try {
      await notifyDesktop("ACKDeck Test Bildirimi", "Masaüstü bildirim sistemi sorunsuz çalışıyor.");
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

  const activeDesktopCount = DESKTOP_CHANNEL_KEYS.filter((k) => prefs[k] !== false).length;
  const activeMobileCount = MOBILE_CHANNEL_KEYS.filter((k) => prefs[k] !== false).length;

  return (
    <div className="notifications-settings-container">
      {/* Overview & Global Master Actions */}
      <section className="settings-card surface local-settings" aria-labelledby="notification-overview-heading">
        <div className="settings-card-heading notification-overview-head">
          <span className="feature-icon notification-overview-icon">
            <Icon name={prefs.desktopMaster || prefs.mobileMaster ? "bell" : "bellOff"} size={22} />
          </span>
          <div className="notification-overview-copy">
            <h2 id="notification-overview-heading">Bildirim Merkezi &amp; Kanal Kontrolleri</h2>
            <p className="notification-subtitle">
              Masaüstü ve mobil bildirimleri tek noktadan yönet veya tek tıkla sustur.
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
            <strong>Durum: </strong>
            <span className={`notification-status-chip ${prefs.desktopMaster ? "is-desktop-on" : "is-off"}`}>
              Masaüstü {prefs.desktopMaster ? `(${activeDesktopCount}/7)` : "(Kapalı)"}
            </span>
            {" · "}
            <span className={`notification-status-chip ${prefs.mobileMaster ? "is-mobile-on" : "is-off"}`}>
              Mobil {prefs.mobileMaster ? `(${activeMobileCount}/6)` : "(Kapalı)"}
            </span>
          </div>

          <div className="notification-status-actions">
            <label className="notification-lead-label">
              <span>Spor Uyarısı:</span>
              <select
                className="settings-select"
                value={prefs.matchLeadMinutes ?? 30}
                onChange={(e) => updatePrefs({ matchLeadMinutes: Number(e.target.value) })}
                aria-label="Spor ve maç bildirimi erken uyarı süresi"
              >
                <option value={15}>15 dk önce</option>
                <option value={30}>30 dk önce</option>
                <option value={60}>60 dk önce</option>
              </select>
            </label>
            <button type="button" className="button button-secondary notification-action-btn" onClick={() => toggleAll(true)}>
              Tümünü Aç
            </button>
            <button type="button" className="button button-secondary notification-action-btn is-danger" onClick={() => toggleAll(false)}>
              Sessize Al
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={"feedback notification-feedback " + feedback.kind}
            role="status"
            onClick={() => {
              clearFeedbackTimer();
              setFeedback(null);
            }}
            title="Kapatmak için tıklayın"
          >
            <span>{feedback.text}</span>
          </div>
        )}
      </section>

      {/* Unified 7-Row Channel Matrix */}
      <NotificationChannelGroup
        prefs={prefs}
        onToggleMaster={(target, enabled) => updatePrefs({ [target]: enabled })}
        onToggleChannel={(key, enabled) => updatePrefs({ [key]: enabled })}
      />

      {/* Test & Paired Devices */}
      <section className="settings-card surface local-settings" aria-label="Bildirim Testi ve Cihazlar">
        <div className="notification-test-row" style={{ marginTop: 0 }}>
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
            Windows Bildirim Merkezi entegrasyonunu doğrular.
          </small>
        </div>

        <NotificationDevicesCard
          devices={devices}
          phoneState={phoneState}
          mobileMaster={prefs.mobileMaster}
          testingDeviceId={testingDeviceId}
          onTestDevicePush={handleTestDevicePush}
        />
      </section>
    </div>
  );
}
