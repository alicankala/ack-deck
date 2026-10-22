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
    window.dispatchEvent(new Event("ack-prayer-config-changed"));
    onNotice(`Konum ${found.city} olarak güncellendi.`);
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

      {/* 2. Namaz Vakitleri & Konum */}
      <section className="settings-card">
        <div className="settings-card-head">
          <Icon name="clock" size={20} />
          <h3>Namaz Vakitleri & Konum</h3>
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

      {/* 4. Cihaz & Senkronizasyon */}
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
