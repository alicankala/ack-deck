import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import {
  type NotificationPreferences,
} from "../../shared/notificationPreferences";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from "../notificationStore";
import { notifyDesktop } from "../desktopClient";
import { phoneRequest, phoneStatus, type PhoneStatus } from "../phoneClient";

type Device = { id: string; name: string; lastSeen: number; notifications: number | null };

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(loadNotificationPreferences);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [phoneState, setPhoneState] = useState<PhoneStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const handleChanged = (e: Event) => {
      const detail = (e as CustomEvent<NotificationPreferences>).detail;
      setPrefs(detail ?? loadNotificationPreferences());
    };
    window.addEventListener("ack-notification-preferences-changed", handleChanged);

    void phoneStatus()
      .then(st => {
        if (!active) return;
        setPhoneState(st);
        if (st.enabled) {
          void phoneRequest<{ devices: Device[] }>("devices")
            .then(res => {
              if (active && Array.isArray(res?.devices)) setDevices(res.devices);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      window.removeEventListener("ack-notification-preferences-changed", handleChanged);
    };
  }, []);

  function updatePrefs(patch: Partial<NotificationPreferences>) {
    const next: NotificationPreferences = { ...prefs, ...patch };
    if (saveNotificationPreferences(next)) {
      setPrefs(next);
      setFeedback({ kind: "success", text: "Bildirim tercihleri güncellendi." });
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    } else {
      setFeedback({ kind: "error", text: "Bildirim tercihleri kaydedilemedi." });
    }
  }

  function toggleAll(enable: boolean) {
    const next: NotificationPreferences = {
      desktopMaster: enable,
      mobileMaster: enable,
      desktopTasks: enable,
      desktopStudy: enable,
      desktopPrayers: enable,
      desktopPomodoro: enable,
      desktopDormMenu: enable,
      desktopSubscriptions: enable,
      mobileTasks: enable,
      mobileStudy: enable,
      mobilePrayers: enable,
      mobileDormMenu: enable,
      mobileSubscriptions: enable,
    };
    if (saveNotificationPreferences(next)) {
      setPrefs(next);
      setFeedback({
        kind: "success",
        text: enable
          ? "Tüm masaüstü ve mobil bildirim kanalları açıldı."
          : "Tüm bildirimler sessize alındı (hiçbir bildirim gönderilmeyecek).",
      });
      setTimeout(() => setFeedback(null), 3500);
    }
  }

  async function handleTestDesktop() {
    setTestBusy(true);
    setFeedback(null);
    try {
      await notifyDesktop(
        "🔔 ACKDeck Test Bildirimi",
        "Masaüstü bildirimleriniz başarıyla aktif ve sorunsuz çalışıyor!"
      );
      setFeedback({ kind: "success", text: "Masaüstü test bildirimi gönderildi. Sağ alt köşeyi kontrol edin." });
    } catch {
      setFeedback({ kind: "error", text: "Windows bildirim sistemi yanıt vermedi." });
    } finally {
      setTestBusy(false);
    }
  }

  async function handleTestDevicePush(deviceId: string, deviceName: string) {
    setTestingDeviceId(deviceId);
    setFeedback(null);
    try {
      await phoneRequest("push/test-device", { deviceId });
      setFeedback({ kind: "success", text: `"${deviceName}" cihazına test push bildirimi başarıyla iletildi.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test push iletilemedi.";
      setFeedback({ kind: "error", text: `${deviceName}: ${msg}` });
    } finally {
      setTestingDeviceId(null);
    }
  }

  const activeDesktopCount = [
    prefs.desktopTasks,
    prefs.desktopStudy,
    prefs.desktopPrayers,
    prefs.desktopPomodoro,
    prefs.desktopDormMenu,
    prefs.desktopSubscriptions,
  ].filter(Boolean).length;

  const activeMobileCount = [
    prefs.mobileTasks,
    prefs.mobileStudy,
    prefs.mobilePrayers,
    prefs.mobileDormMenu,
    prefs.mobileSubscriptions,
  ].filter(Boolean).length;

  return (
    <div className="notifications-settings-container" style={{ display: "grid", gap: "1.25rem" }}>
      {/* Overview & Global Master Actions */}
      <section className="settings-card surface local-settings" aria-labelledby="notification-overview-heading">
        <div className="settings-card-heading" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span className="feature-icon" style={{ display: "grid", placeItems: "center" }}>
            <Icon name={prefs.desktopMaster || prefs.mobileMaster ? "bell" : "bellOff"} size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="notification-overview-heading" style={{ margin: 0, fontSize: "1.25rem" }}>
              Bildirim Merkezi & Kanal Kontrolleri
            </h2>
            <p style={{ margin: "0.25rem 0 0", color: "#a0b2c6", fontSize: "0.88rem" }}>
              Masaüstü ve mobil bildirimlerin tamamını tek noktadan yönetebilir, kanalları bağımsız açıp kapatabilir veya tek tıkla tümünü susturabilirsin.
            </p>
          </div>
          <span
            className={"key-status " + (prefs.desktopMaster || prefs.mobileMaster ? "saved" : "")}
            style={{ whiteSpace: "nowrap" }}
          >
            {prefs.desktopMaster && prefs.mobileMaster
              ? "Tüm Kanallar Açık"
              : prefs.desktopMaster || prefs.mobileMaster
              ? "Kısmi Aktif"
              : "Tümü Sessizde"}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginTop: "1.25rem",
            padding: "0.85rem 1rem",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: "0.6rem",
          }}
        >
          <div style={{ fontSize: "0.88rem", color: "#becbd8" }}>
            <strong>Durum Özeti: </strong>
            <span style={{ color: prefs.desktopMaster ? "#7ed492" : "#94a3b8" }}>
              Masaüstü {prefs.desktopMaster ? `(${activeDesktopCount}/6 aktif)` : "(Kapalı)"}
            </span>
            {" · "}
            <span style={{ color: prefs.mobileMaster ? "#60a5fa" : "#94a3b8" }}>
              Mobil Push {prefs.mobileMaster ? `(${activeMobileCount}/5 aktif)` : "(Kapalı)"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="button button-secondary"
              style={{ fontSize: "0.84rem", padding: "0.35rem 0.75rem" }}
              onClick={() => toggleAll(true)}
            >
              Tüm Bildirimleri Aç
            </button>
            <button
              type="button"
              className="button button-secondary"
              style={{ fontSize: "0.84rem", padding: "0.35rem 0.75rem", color: "#fca5a5" }}
              onClick={() => toggleAll(false)}
            >
              Tümünü Sessize Al
            </button>
          </div>
        </div>

        {feedback && (
          <p className={"feedback " + feedback.kind} role="status" style={{ marginTop: "1rem" }}>
            {feedback.text}
          </p>
        )}
      </section>

      {/* Desktop Notifications Section */}
      <section className="settings-card surface local-settings" aria-labelledby="desktop-notifications-heading">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            paddingBottom: "1rem",
            marginBottom: "1rem",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2 id="desktop-notifications-heading" style={{ margin: 0, fontSize: "1.15rem" }}>
              💻 Masaüstü Bildirimleri (Windows)
            </h2>
            <p style={{ margin: "0.2rem 0 0", color: "#a0b2c6", fontSize: "0.85rem" }}>
              Windows Bildirim Merkezi ve sistem tepsisi üzerinden bilgisayarınızda gösterilen bildirimler
            </p>
          </div>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.55rem",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.92rem",
              background: prefs.desktopMaster ? "rgba(34, 197, 94, 0.12)" : "rgba(255, 255, 255, 0.05)",
              padding: "0.4rem 0.8rem",
              borderRadius: "0.5rem",
              border: `1px solid ${prefs.desktopMaster ? "rgba(34, 197, 94, 0.35)" : "rgba(255, 255, 255, 0.1)"}`,
            }}
          >
            <input
              type="checkbox"
              checked={prefs.desktopMaster}
              onChange={e => updatePrefs({ desktopMaster: e.target.checked })}
              style={{ width: "17px", height: "17px", cursor: "pointer" }}
            />
            <span>Masaüstü Bildirimleri: {prefs.desktopMaster ? "Açık" : "Kapalı"}</span>
          </label>
        </div>

        {!prefs.desktopMaster && (
          <p
            style={{
              margin: "0 0 1rem",
              padding: "0.6rem 0.85rem",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "0.5rem",
              color: "#fca5a5",
              fontSize: "0.84rem",
            }}
          >
            Masaüstü ana bildirim şalteri kapalı olduğu için Windows üzerinden hiçbir hatırlatma veya alarm gösterilmeyecektir.
          </p>
        )}

        <div
          className="toggle-settings"
          style={{
            display: "grid",
            gap: "0.85rem",
            opacity: prefs.desktopMaster ? 1 : 0.45,
            pointerEvents: prefs.desktopMaster ? "auto" : "none",
          }}
        >
          {/* 1. Görevler */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.desktopTasks}
              disabled={!prefs.desktopMaster}
              onChange={e => updatePrefs({ desktopTasks: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Görev Alarmları & Hatırlatıcılar
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Görevlerin teslim saatinde veya görev için ayarlanan erken bildirim süresinde (15 dk, 30 dk, 1 saat önce vb.) masaüstü bildirimi gösterir.
              </small>
            </div>
          </label>

          {/* 2. Ders Programı */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.desktopStudy}
              disabled={!prefs.desktopMaster}
              onChange={e => updatePrefs({ desktopStudy: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Ders Programı & Çalışma Blokları
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Haftalık ders programınızdaki oturumların başlangıç saatinde veya ders öncesinde erken uyarı masaüstü bildirimi iletir.
              </small>
            </div>
          </label>

          {/* 3. Namaz Vakitleri */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.desktopPrayers}
              disabled={!prefs.desktopMaster}
              onChange={e => updatePrefs({ desktopPrayers: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Namaz Vakitleri & Ezan Uyarıları
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Vakit girdiğinde veya vakit öncesi belirlenen sürede (5, 10, 15, 30 dk önce) masaüstü Bildirim Merkezi üzerinden nazikçe uyarır.
              </small>
            </div>
          </label>

          {/* 4. Pomodoro */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.desktopPomodoro}
              disabled={!prefs.desktopMaster}
              onChange={e => updatePrefs({ desktopPomodoro: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Pomodoro Odak & Mola Bildirimleri
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                25 dakikalık odak seansı bittiğinde veya mola süresi tamamlandığında masaüstü toast bildirimi ve hafif sesli uyarı verir.
              </small>
            </div>
          </label>

          {/* 5. Yurt Yemek Menüsü */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.desktopDormMenu}
              disabled={!prefs.desktopMaster}
              onChange={e => updatePrefs({ desktopDormMenu: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Yurt Yemek Menüsü Hatırlatması
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Öğle ve akşam saatlerinde günün Altınkalem / KYK yurt yemek menüsünü masaüstünde bildirir.
              </small>
            </div>
          </label>

          {/* 6. Abonelikler */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.desktopSubscriptions}
              disabled={!prefs.desktopMaster}
              onChange={e => updatePrefs({ desktopSubscriptions: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Abonelik & Fatura Hatırlatıcıları
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Yenileme ve ödeme günü yaklaşan aboneliklerinizin tutar ve tarihini masaüstünde önceden hatırlatır.
              </small>
            </div>
          </label>
        </div>

        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleTestDesktop}
            disabled={testBusy || !prefs.desktopMaster}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <Icon name="bell" size={16} />
            <span>{testBusy ? "Gönderiliyor..." : "Masaüstü Test Bildirimi Gönder"}</span>
          </button>
          <small style={{ color: "#94a3b8" }}>
            Windows Bildirim Merkezi entegrasyonunu doğrulamak için tıkla.
          </small>
        </div>
      </section>

      {/* Mobile Push Notifications Section */}
      <section className="settings-card surface local-settings" aria-labelledby="mobile-notifications-heading">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            paddingBottom: "1rem",
            marginBottom: "1rem",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2 id="mobile-notifications-heading" style={{ margin: 0, fontSize: "1.15rem" }}>
              📱 Mobil Push Bildirimleri (iPhone & Android)
            </h2>
            <p style={{ margin: "0.2rem 0 0", color: "#a0b2c6", fontSize: "0.85rem" }}>
              Eşleştirilmiş telefonunuza PC açık veya kapalıyken 7/24 iletilen anlık Web Push bildirimleri
            </p>
          </div>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.55rem",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.92rem",
              background: prefs.mobileMaster ? "rgba(59, 130, 246, 0.12)" : "rgba(255, 255, 255, 0.05)",
              padding: "0.4rem 0.8rem",
              borderRadius: "0.5rem",
              border: `1px solid ${prefs.mobileMaster ? "rgba(59, 130, 246, 0.35)" : "rgba(255, 255, 255, 0.1)"}`,
            }}
          >
            <input
              type="checkbox"
              checked={prefs.mobileMaster}
              onChange={e => updatePrefs({ mobileMaster: e.target.checked })}
              style={{ width: "17px", height: "17px", cursor: "pointer" }}
            />
            <span>Mobil Bildirimler: {prefs.mobileMaster ? "Açık" : "Kapalı"}</span>
          </label>
        </div>

        {!prefs.mobileMaster && (
          <p
            style={{
              margin: "0 0 1rem",
              padding: "0.6rem 0.85rem",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "0.5rem",
              color: "#fca5a5",
              fontSize: "0.84rem",
            }}
          >
            Mobil ana push şalteri kapalı olduğu için Cloudflare sunucusu eşleştirilmiş telefonlarınıza hiçbir anlık push bildirimi göndermeyecektir.
          </p>
        )}

        <div
          className="toggle-settings"
          style={{
            display: "grid",
            gap: "0.85rem",
            opacity: prefs.mobileMaster ? 1 : 0.45,
            pointerEvents: prefs.mobileMaster ? "auto" : "none",
          }}
        >
          {/* 1. Mobil Görevler */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.mobileTasks}
              disabled={!prefs.mobileMaster}
              onChange={e => updatePrefs({ mobileTasks: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Mobil Görev Alarmları & Push Hatırlatıcılar
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Bilgisayarınız kapalıyken bile teslim saati gelen veya erken uyarısı kurulmuş görevlerin bildirimi anında iPhone/Android kilit ekranınıza düşer.
              </small>
            </div>
          </label>

          {/* 2. Mobil Ders Programı */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.mobileStudy}
              disabled={!prefs.mobileMaster}
              onChange={e => updatePrefs({ mobileStudy: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Mobil Ders Programı & Oturum Bildirimleri
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                PC kapalıyken Cloudflare zamanlayıcısı ders saatinden 15 dk önce ve ders anında telefonunuza ders hatırlatması gönderir.
              </small>
            </div>
          </label>

          {/* 3. Mobil Namaz */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.mobilePrayers}
              disabled={!prefs.mobileMaster}
              onChange={e => updatePrefs({ mobilePrayers: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Mobil Ezan & Namaz Vakitleri
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Vakit girdiğinde ve vakit öncesi erken bildirim dakikasında telefonunuza sessiz veya sesli kilit ekranı ezan bildirimi iletir.
              </small>
            </div>
          </label>

          {/* 4. Mobil Yemek Menüsü */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.mobileDormMenu}
              disabled={!prefs.mobileMaster}
              onChange={e => updatePrefs({ mobileDormMenu: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Mobil Günlük Yemek Menüsü (12:30 Push)
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Her gün saat 12:30'da günün akşam yemeği menüsünü telefona doğrudan push bildirimi olarak iletir.
              </small>
            </div>
          </label>

          {/* 5. Mobil Abonelikler */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={prefs.mobileSubscriptions}
              disabled={!prefs.mobileMaster}
              onChange={e => updatePrefs({ mobileSubscriptions: e.target.checked })}
              style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
            />
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.92rem", color: "#f1f5f9" }}>
                Mobil Abonelik & Ödeme Günü Hatırlatıcıları
              </strong>
              <small style={{ color: "#94a3b8", display: "block", marginTop: "0.15rem", lineHeight: 1.4 }}>
                Fatura veya yenileme tarihi yaklaşan aboneliklerinizin tutar bilgisini telefon kilit ekranınıza gönderir.
              </small>
            </div>
          </label>
        </div>

        {/* Paired devices & Push Testing */}
        <div style={{ marginTop: "1.5rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1rem" }}>
          <h3 style={{ fontSize: "0.98rem", margin: "0 0 0.5rem", color: "#e2e8f0" }}>
            Eşleştirilmiş Cihazlar & Push Testi
          </h3>
          {devices.length > 0 ? (
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {devices.map(dev => (
                <div
                  key={dev.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "0.5rem",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "0.9rem", color: "#f8fafc" }}>{dev.name}</strong>
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.1rem" }}>
                      Push Durumu:{" "}
                      <span style={{ color: dev.notifications ? "#4ade80" : "#f87171" }}>
                        {dev.notifications ? "İzin Verildi (Aktif)" : "Abonelik Yok veya Kapalı"}
                      </span>
                      {" · "}
                      Son bağlantı: {new Date(dev.lastSeen).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "0.82rem", padding: "0.3rem 0.7rem" }}
                    disabled={testingDeviceId !== null || !dev.notifications || !prefs.mobileMaster}
                    onClick={() => handleTestDevicePush(dev.id, dev.name)}
                  >
                    {testingDeviceId === dev.id ? "İletiliyor..." : "Telefona Test Push Gönder"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
              {phoneState?.enabled
                ? "Şu an eşleştirilmiş bir cihaz bulunmuyor. Telefon sekmesinden cihazınızı eşleştirebilirsiniz."
                : "Telefon entegrasyonu henüz açık değil. Telefon sekmesinden eşleştirme yaparak mobil bildirimleri etkinleştirebilirsiniz."}
            </p>
          )}
        </div>
      </section>

      {/* Helpful Tips & Focus Mode Info */}
      <section
        className="settings-card surface local-settings"
        style={{
          background: "rgba(15, 23, 42, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          padding: "1rem 1.25rem",
        }}
      >
        <h3 style={{ fontSize: "0.94rem", margin: "0 0 0.4rem", color: "#93c5fd" }}>
          💡 Bildirim İpuçları & Odaklanma Modu
        </h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            fontSize: "0.84rem",
            color: "#94a3b8",
            lineHeight: 1.6,
          }}
        >
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
