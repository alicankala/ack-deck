import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import {
  loadPrayerConfig,
  savePrayerConfig,
  TURKEY_CITIES,
  type PrayerTimesConfig,
} from "../../shared/prayerTimes";
import { api, emptyState, json, type MobileState } from "./store";
import { enablePush } from "./push";
import {
  loadSecurityConfig,
  saveSecurityConfig,
  setSecurityPasscode,
  disableSecurity,
  isBiometricsAvailable,
  registerBiometrics,
  type MobileSecurityConfig,
} from "./mobileSecurity";

export function MobileSettings({
  state,
  commit,
  busy,
  name,
  setName,
  push,
  setPush,
  online,
  tasksCount,
  notesCount,
  onNotice,
  onError,
  onBack,
  onSync,
}: {
  state: MobileState;
  commit: (next: MobileState) => Promise<void>;
  busy: boolean;
  name: string;
  setName: (val: string) => void;
  push: boolean;
  setPush: (val: boolean) => void;
  online: boolean;
  tasksCount: number;
  notesCount: number;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
  onBack: () => void;
  onSync: () => Promise<void>;
}) {
  const [prayerConfig, setPrayerConfig] = useState<PrayerTimesConfig>(loadPrayerConfig);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("ack-deck.mobile-theme") as "dark" | "light") || "dark";
  });
  const [syncing, setSyncing] = useState(false);
  const [securityConfig, setSecurityConfig] = useState<MobileSecurityConfig>(loadSecurityConfig);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDraft1, setPinDraft1] = useState("");
  const [pinDraft2, setPinDraft2] = useState("");
  const [pinError, setPinError] = useState("");
  const [bioSupported, setBioSupported] = useState(false);

  useEffect(() => {
    void isBiometricsAvailable().then(setBioSupported);
    const handleSec = (e: Event) => {
      setSecurityConfig((e as CustomEvent<MobileSecurityConfig>).detail ?? loadSecurityConfig());
    };
    window.addEventListener("ack-mobile-security-changed", handleSec);
    return () => window.removeEventListener("ack-mobile-security-changed", handleSec);
  }, []);

  async function handleSaveNewPin(e: FormEvent) {
    e.preventDefault();
    setPinError("");
    if (pinDraft1.length < 4) {
      setPinError("Şifre en az 4 basamaklı olmalıdır.");
      return;
    }
    if (pinDraft1 !== pinDraft2) {
      setPinError("Girdiğiniz şifreler birbiriyle eşleşmiyor.");
      return;
    }
    try {
      await setSecurityPasscode(pinDraft1, bioSupported);
      setShowPinModal(false);
      setPinDraft1("");
      setPinDraft2("");
      onNotice("Uygulama kilidi ve şifre başarıyla kaydedildi.");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Şifre kaydedilemedi.");
    }
  }

  async function handleToggleFaceId() {
    if (!securityConfig.enabled) {
      onError("Önce bir şifre belirleyerek uygulama kilidini açmalısınız.");
      return;
    }
    if (securityConfig.biometricsEnabled) {
      saveSecurityConfig({ ...securityConfig, biometricsEnabled: false });
      onNotice("Face ID kapatıldı (Şifre koruması devam ediyor).");
    } else {
      try {
        const credId = await registerBiometrics();
        saveSecurityConfig({
          ...securityConfig,
          biometricsEnabled: true,
          biometricsCredentialId: credId,
        });
        onNotice("Face ID başarıyla etkinleştirildi.");
      } catch (err) {
        onError(err instanceof Error ? err.message : "Face ID doğrulanamadı.");
      }
    }
  }

  function handleDisableSecurity() {
    if (confirm("Uygulama kilidini ve şifreyi kaldırmak istediğinize emin misiniz?")) {
      disableSecurity();
      onNotice("Uygulama kilidi kaldırıldı.");
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ack-deck.mobile-theme", theme);
  }, [theme]);

  const cities = Object.values(TURKEY_CITIES)
    .filter((v, i, a) => a.findIndex(t => t.city === v.city) === i)
    .sort((a, b) => a.city.localeCompare(b.city, "tr"));

  function handleCityChange(selectedCityName: string) {
    const found = Object.values(TURKEY_CITIES).find(c => c.city === selectedCityName);
    if (!found) return;
    const next: PrayerTimesConfig = {
      ...prayerConfig,
      city: found.city,
      latitude: found.lat,
      longitude: found.lng,
    };
    setPrayerConfig(next);
    savePrayerConfig(next);
    try {
      localStorage.setItem("ack-deck.weather-city.v1", JSON.stringify(found.city));
    } catch {}
    window.dispatchEvent(new Event("ack-prayer-config-changed"));
    window.dispatchEvent(new Event("ack-weather-city-changed"));
    onNotice(`Konum ve hava durumu ${found.city} olarak güncellendi.`);
  }

  function handleNotifyAtTimeChange(enabled: boolean) {
    const next: PrayerTimesConfig = { ...prayerConfig, notifyAtTime: enabled };
    setPrayerConfig(next);
    savePrayerConfig(next);
    window.dispatchEvent(new Event("ack-prayer-config-changed"));
    onNotice(enabled ? "Vakit bildirimleri açıldı." : "Vakit bildirimleri kapatıldı.");
  }

  function handleBeforeMinutesChange(minutes: number) {
    const next: PrayerTimesConfig = { ...prayerConfig, notifyBeforeMinutes: minutes };
    setPrayerConfig(next);
    savePrayerConfig(next);
    window.dispatchEvent(new Event("ack-prayer-config-changed"));
    onNotice(minutes > 0 ? `Vaktin ${minutes} dakika öncesinde hatırlatılacak.` : "Vakit öncesi hatırlatma kapatıldı.");
  }

  async function handleDeviceRename(e: FormEvent) {
    e.preventDefault();
    try {
      await api(state, "me", json({ name }));
      await commit({ ...state, name });
      onNotice("Cihaz adı kaydedildi.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Cihaz adı kaydedilemedi.");
    }
  }

  async function handleManualSync() {
    if (syncing || busy) return;
    setSyncing(true);
    try {
      await onSync();
      onNotice("Tüm veriler başarıyla eşitlendi.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Eşitleme yapılamadı.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleRefreshCache() {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
        onNotice("Uygulama önbelleği yenilendi.");
      } else {
        onNotice("Önbellek güncel.");
      }
    } catch {
      onNotice("Önbellek kontrolü tamamlandı.");
    }
  }

  return (
    <div className="mobile-settings-page">
      <div className="settings-header-bar">
        <button type="button" className="back-to-send-btn" onClick={onBack}>
          <Icon name="back" size={18} />
          <span>Gönder'e Dön</span>
        </button>
        <h2>Ayarlar</h2>
      </div>

      {/* 1. Görünüm & Tema */}
      <section className="settings-card">
        <div className="settings-card-head">
          <Icon name="spark" size={20} />
          <h3>Görünüm & Tema</h3>
        </div>
        <div className="settings-row theme-selector-row">
          <span>Tema Tercihi</span>
          <div className="theme-toggle-group">
            <button
              type="button"
              className={`theme-btn ${theme === "dark" ? "is-active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              🌙 Koyu
            </button>
            <button
              type="button"
              className={`theme-btn ${theme === "light" ? "is-active" : ""}`}
              onClick={() => setTheme("light")}
            >
              ☀️ Açık
            </button>
          </div>
        </div>
      </section>

      {/* 2. Hava Durumu, Namaz Vakitleri & Konum */}
      <section className="settings-card">
        <div className="settings-card-head">
          <Icon name="clock" size={20} />
          <h3>Hava Durumu & Namaz Konumu</h3>
        </div>
        <div className="settings-row">
          <label htmlFor="city-select">Şehir / Konum</label>
          <select
            id="city-select"
            className="settings-select"
            value={prayerConfig.city}
            onChange={e => handleCityChange(e.target.value)}
          >
            {cities.map(c => (
              <option key={c.city} value={c.city}>
                {c.city}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <span>Vaktinde Bildirim Gönder</span>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={prayerConfig.notifyAtTime}
              onChange={e => handleNotifyAtTimeChange(e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-row">
          <label htmlFor="before-min-select">Vakit Öncesi Hatırlatma</label>
          <select
            id="before-min-select"
            className="settings-select"
            value={prayerConfig.notifyBeforeMinutes}
            onChange={e => handleBeforeMinutesChange(Number(e.target.value))}
          >
            <option value={0}>Kapalı</option>
            <option value={5}>5 dakika önce</option>
            <option value={10}>10 dakika önce</option>
            <option value={15}>15 dakika önce</option>
            <option value={20}>20 dakika önce</option>
            <option value={30}>30 dakika önce</option>
            <option value={45}>45 dakika önce</option>
          </select>
        </div>
        <p className="settings-hint">
          Vakitler Hanefi mezhebine göre Diyanet İşleri Başkanlığı takvimiyle tam uyumludur.
        </p>
      </section>

      {/* 3. Push Bildirimleri */}
      <section className="settings-card">
        <div className="settings-card-head">
          <Icon name="checkCircle" size={20} />
          <h3>Bildirimler</h3>
        </div>
        <div className="settings-row">
          <div>
            <strong>Web Push Bildirimleri</strong>
            <p className="settings-hint">Vakitler ve hatırlatmalar kilit ekranında gösterilir.</p>
          </div>
          {push ? (
            <span className="settings-badge success">Açık</span>
          ) : (
            <button
              type="button"
              className="primary-action-sm"
              disabled={busy}
              onClick={() => {
                void enablePush(state)
                  .then(() => {
                    setPush(true);
                    onNotice("Bildirimler başarıyla açıldı.");
                  })
                  .catch(e => onError(e instanceof Error ? e.message : "Bildirim açılamadı."));
              }}
            >
              Aç
            </button>
          )}
        </div>
      </section>

      {/* 4. Güvenlik & Kilit (Face ID / Şifre) */}
      <section className="settings-card">
        <div className="settings-card-head">
          <span style={{ fontSize: "1.2rem", lineHeight: 1 }} aria-hidden="true">🔒</span>
          <h3>Uygulama Kilidi & Face ID</h3>
        </div>

        <div className="settings-row">
          <div>
            <strong>Kilit Koruması (PIN / Şifre)</strong>
            <p className="settings-hint">
              {securityConfig.enabled
                ? securityConfig.biometricsEnabled
                  ? "Aktif (Face ID + Şifre)"
                  : "Aktif (Yalnızca Şifre)"
                : "Kapalı (Uygulama doğrudan açılır)"}
            </p>
          </div>
          {securityConfig.enabled ? (
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className="secondary-action-sm"
                onClick={() => {
                  setPinDraft1("");
                  setPinDraft2("");
                  setPinError("");
                  setShowPinModal(true);
                }}
              >
                Değiştir
              </button>
              <button
                type="button"
                className="danger-action-sm"
                onClick={handleDisableSecurity}
              >
                Kaldır
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="primary-action-sm"
              onClick={() => {
                setPinDraft1("");
                setPinDraft2("");
                setPinError("");
                setShowPinModal(true);
              }}
            >
              Kilitle
            </button>
          )}
        </div>

        {securityConfig.enabled && (
          <>
            <div className="settings-row">
              <div>
                <strong>Face ID / Touch ID ile Aç</strong>
                <p className="settings-hint">
                  {bioSupported
                    ? "Cihazınızın biyometrik sensörüyle anında kilit açın."
                    : "Bu cihazda Face ID / Biyometri desteği bulunmuyor."}
                </p>
              </div>
              <button
                type="button"
                className={securityConfig.biometricsEnabled ? "primary-action-sm active-bio-btn" : "secondary-action-sm"}
                disabled={!bioSupported}
                onClick={() => void handleToggleFaceId()}
              >
                {securityConfig.biometricsEnabled ? "✓ Açık" : "Etkinleştir"}
              </button>
            </div>

            <div className="settings-select-group">
              <label htmlFor="autolock-select">Otomatik Kilitleme Zamanı</label>
              <select
                id="autolock-select"
                value={securityConfig.autoLockTimeoutSeconds}
                onChange={e => {
                  const sec = Number(e.target.value);
                  saveSecurityConfig({ ...securityConfig, autoLockTimeoutSeconds: sec });
                  onNotice(
                    sec === 0
                      ? "Uygulamadan çıkıldığında hemen kilitlenecek."
                      : `${sec / 60} dakika sonra kilitlenecek.`
                  );
                }}
              >
                <option value={0}>Hemen (Arka plana geçtiğinde)</option>
                <option value={60}>1 dakika sonra</option>
                <option value={300}>5 dakika sonra</option>
                <option value={900}>15 dakika sonra</option>
              </select>
            </div>
          </>
        )}
      </section>

      {/* PIN Kurulum / Değiştirme Modalı */}
      {showPinModal && (
        <div className="prayer-guide-overlay" onClick={() => setShowPinModal(false)} role="dialog" aria-modal="true">
          <div className="prayer-guide-modal" onClick={e => e.stopPropagation()} style={{ padding: "20px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.4rem" }}>🔒</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc" }}>
                    {securityConfig.enabled ? "Şifreyi Değiştir" : "Uygulama Şifresi Belirleyin"}
                  </h3>
                  <small style={{ color: "var(--app-muted)" }}>En az 4 basamaklı bir şifre girin</small>
                </div>
              </div>
              <button
                type="button"
                className="prayer-guide-close"
                onClick={() => setShowPinModal(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewPin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                <span>Yeni Şifre:</span>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pinDraft1}
                  onChange={e => setPinDraft1(e.target.value)}
                  placeholder="örn. 1234"
                  maxLength={12}
                  required
                  style={{
                    minHeight: "44px",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "var(--app-field)",
                    border: "1px solid var(--app-border)",
                    color: "#fff",
                    fontSize: "18px",
                    letterSpacing: "0.2em",
                    textAlign: "center",
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                <span>Şifreyi Tekrar Girin:</span>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pinDraft2}
                  onChange={e => setPinDraft2(e.target.value)}
                  placeholder="örn. 1234"
                  maxLength={12}
                  required
                  style={{
                    minHeight: "44px",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: "var(--app-field)",
                    border: "1px solid var(--app-border)",
                    color: "#fff",
                    fontSize: "18px",
                    letterSpacing: "0.2em",
                    textAlign: "center",
                  }}
                />
              </label>

              {pinError && (
                <p style={{ color: "#f87171", margin: "2px 0", fontSize: "12px", textAlign: "center" }} role="alert">
                  {pinError}
                </p>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "6px" }}>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setShowPinModal(false)}
                  style={{ minHeight: "42px", borderRadius: "10px" }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  style={{ minHeight: "42px", borderRadius: "10px" }}
                >
                  Kaydet & Kilitle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Cihaz & Senkronizasyon */}
      <section className="settings-card">
        <div className="settings-card-head">
          <Icon name="refresh" size={20} />
          <h3>Cihaz ve Eşitleme</h3>
        </div>
        <form className="settings-rename-form" onSubmit={handleDeviceRename}>
          <label htmlFor="device-name-input">Cihaz Adı</label>
          <div className="input-with-button">
            <input
              id="device-name-input"
              value={name}
              maxLength={80}
              onChange={e => setName(e.target.value)}
              placeholder="Örn: iPhone"
            />
            <button type="submit" disabled={busy} className="primary-action-sm">
              Kaydet
            </button>
          </div>
        </form>
        <div className="settings-row" style={{ marginTop: "12px" }}>
          <span>Bağlantı Durumu</span>
          <span className={`settings-badge ${online ? "success" : "warning"}`}>
            {online ? "● Çevrimiçi" : "○ Çevrimdışı"}
          </span>
        </div>
        <div className="settings-row">
          <span>Kuyrukta Bekleyen</span>
          <span>{state.queue.length} değişiklik</span>
        </div>
        <div className="settings-actions-group">
          <button
            type="button"
            className="secondary-action full-width"
            disabled={busy || syncing}
            onClick={handleManualSync}
          >
            {syncing ? "Eşitleniyor..." : "🔄 Şimdi Eşitle"}
          </button>
        </div>
      </section>

      {/* 5. Veri & Önbellek */}
      <section className="settings-card">
        <div className="settings-card-head">
          <Icon name="files" size={20} />
          <h3>Kayıtlar & Depolama</h3>
        </div>
        <div className="settings-stats-grid">
          <div className="stat-pill">
            <strong>{tasksCount}</strong>
            <small>Kayıtlı Görev</small>
          </div>
          <div className="stat-pill">
            <strong>{notesCount}</strong>
            <small>Kayıtlı Not</small>
          </div>
          <div className="stat-pill">
            <strong>{state.records.filter(r => r.kind === "subscriptions" && !r.deleted).length}</strong>
            <small>Abonelik</small>
          </div>
        </div>
        <div className="settings-actions-group" style={{ marginTop: "12px" }}>
          <button
            type="button"
            className="secondary-action full-width"
            onClick={handleRefreshCache}
          >
            Önbelleği Yenile & Güncellemeleri Denetle
          </button>
        </div>
      </section>

      {/* 6. Tehlikeli Alan */}
      <section className="settings-card danger-zone">
        <h3>Eşleşmeyi Sonlandır</h3>
        <p className="settings-hint">
          Bu cihazın bilgisayarınızla olan bağlantısı kesilir. Görev ve notlarınız silinmez.
        </p>
        <button
          type="button"
          className="disconnect-button"
          disabled={busy}
          onClick={() => {
            if (confirm("Bu telefonun masaüstüyle bağlantısı kesilsin mi?")) {
              void api<{ id: string }>(state, "me")
                .then(me => api(state, "revoke", json({ deviceId: me.id })))
                .then(async () => {
                  const registration = await navigator.serviceWorker?.ready;
                  await (await registration?.pushManager?.getSubscription())?.unsubscribe();
                  await commit(emptyState());
                })
                .catch(e => onError(e.message));
            }
          }}
        >
          Cihaz Bağlantısını Kes
        </button>
      </section>
    </div>
  );
}
