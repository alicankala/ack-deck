import { TrashSettings } from "./TrashSettings";
import { ActionMenu } from "./ActionMenu";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  PC_REFRESH_INTERVALS,
  START_PAGES,
  normalizeStartPage,
  savePreferences,
  type PcRefreshInterval,
  type Preferences,
  type StartPage,
} from "../preferences";
import {
  aiErrorMessage,
  deleteGeminiKey,
  getGeminiKeyStatus,
  saveGeminiKey,
  testGeminiConnection,
} from "../geminiClient";
import { Icon, type IconName } from "./Icon";
import { DisplayScaleControls } from "./DisplayScaleControls";
import { PhoneSettings } from "./PhoneSettings";
import { DesktopSettings } from "./DesktopSettings";
import { BackupSettings } from "./BackupSettings";
import { UpdateSettings } from "./UpdateSettings";
import { NotificationSettings } from "./NotificationSettings";
import { CitySettings } from "./CitySettings";
import type { DesktopStatus } from "../desktopClient";

// 4 Temiz ve Sade Sekme
const sections: { id: string; label: string; description: string; icon: IconName }[] = [
  { id: "general", label: "Genel", description: "Görünüm, başlangıç, şehir ve Windows", icon: "settings" },
  { id: "notifications", label: "Bildirimler", description: "Masaüstü ve mobil bildirimleri", icon: "bell" },
  { id: "connections", label: "Bağlantılar", description: "Telefon eşitleme ve ACK AI", icon: "files" },
  { id: "data", label: "Veri & Güncelleme", description: "Yedekler, çöp kutusu ve sürüm", icon: "archive" },
];

const START_PAGE_LABELS: Record<StartPage, string> = {
  home: "Ana Sayfa",
  tasks: "Görevler",
  calendar: "Aylık Plan",
  notes: "Notlar",
  projects: "Projeler & Araçlar",
  ai: "ACK AI",
  subscriptions: "Abonelikler",
  inbox: "Gelenler",
};

const PC_REFRESH_LABELS: Record<PcRefreshInterval, string> = {
  2500: "2,5 saniye",
  5000: "5 saniye",
  10000: "10 saniye",
};

type Action = "save" | "delete" | "test";
type Feedback = { kind: "success" | "error"; text: string };

export function Settings({
  preferences,
  onPreferencesChange,
  desktop,
  onDesktopChange,
}: {
  preferences: Preferences;
  onPreferencesChange: (value: Preferences) => void;
  desktop: DesktopStatus | null;
  onDesktopChange: (status: DesktopStatus) => void;
}) {
  const [selectedSection, setSelectedSection] = useState("general");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        setToast(detail);
      }
    };
    window.addEventListener("ack-settings-toast", handleToast);
    return () => window.removeEventListener("ack-settings-toast", handleToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  function changePreference(value: Preferences) {
    if (savePreferences(value)) {
      onPreferencesChange(value);
      setToast("Tercihler kaydedildi.");
    } else {
      setToast("Tercihler kaydedilemedi.");
    }
  }

  // Gemini API Key State
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let active = true;
    getGeminiKeyStatus()
      .then((saved) => {
        if (active) setHasKey(saved);
      })
      .catch((error: unknown) => {
        if (active) setFeedback({ kind: "error", text: aiErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let apiKey = inputRef.current?.value.trim() ?? "";
    if (!apiKey) {
      setFeedback({ kind: "error", text: "Gemini API anahtarını girin." });
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
    setAction("save");
    setFeedback(null);
    try {
      const request = saveGeminiKey(apiKey);
      apiKey = "";
      await request;
      setHasKey(true);
      setFeedback({ kind: "success", text: "API anahtarı Windows Kimlik Bilgisi Yöneticisi'ne güvenle kaydedildi." });
    } catch (error) {
      setFeedback({ kind: "error", text: aiErrorMessage(error) });
    } finally {
      setAction(null);
    }
  }

  async function removeKey() {
    setAction("delete");
    setFeedback(null);
    try {
      await deleteGeminiKey();
      if (inputRef.current) inputRef.current.value = "";
      setHasKey(false);
      setFeedback({ kind: "success", text: "API anahtarı silindi." });
    } catch (error) {
      setFeedback({ kind: "error", text: aiErrorMessage(error) });
    } finally {
      setAction(null);
    }
  }

  async function testKey() {
    setAction("test");
    setFeedback(null);
    try {
      await testGeminiConnection("fast");
      setFeedback({ kind: "success", text: "Gemini bağlantısı başarılı. ACK AI kullanıma hazır." });
    } catch (error) {
      setFeedback({ kind: "error", text: aiErrorMessage(error) });
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="settings-page">
      <header className="feature-heading">
        <h1>Ayarlar</h1>
        <p>Değiştirmek istediğin bölümü seç.</p>
      </header>

      {/* Floating toast pop-up instead of pushing the page down */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "2.5rem",
            right: "2.5rem",
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            color: "#f8fafc",
            padding: "0.75rem 1.25rem",
            borderRadius: "0.75rem",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            fontSize: "0.88rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            zIndex: 9999,
            backdropFilter: "blur(8px)",
            animation: "livePulse 0.3s ease-out",
          }}
        >
          <span style={{ color: "#38bdf8" }}>✓</span>
          <span>{toast}</span>
        </div>
      )}

      <div className="settings-layout">
        <div className="settings-navigation" role="tablist" aria-label="Ayar bölümleri" aria-orientation="vertical">
          {sections.map((section) => (
            <button
              type="button"
              role="tab"
              id={"settings-tab-" + section.id}
              aria-controls={"settings-panel-" + section.id}
              aria-selected={section.id === selectedSection}
              tabIndex={section.id === selectedSection ? 0 : -1}
              key={section.id}
              onClick={() => setSelectedSection(section.id)}
              onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const index = sections.findIndex((item) => item.id === selectedSection);
                const next =
                  sections[
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                      ? sections.length - 1
                      : (index + (event.key === "ArrowDown" ? 1 : -1) + sections.length) % sections.length
                  ];
                setSelectedSection(next.id);
                document.getElementById("settings-tab-" + next.id)?.focus();
              }}
            >
              <Icon name={section.icon} size={20} />
              <span>
                <strong>{section.label}</strong>
                <small>{section.description}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="settings-panels">
          {/* 1. SEKME: GENEL */}
          <section
            role="tabpanel"
            id="settings-panel-general"
            aria-labelledby="settings-tab-general"
            hidden={selectedSection !== "general"}
            className="settings-section-panel"
          >
            {/* Kart 1: Görünüm (Tema & Arayüz Ölçeği Birleşik) */}
            <section className="surface settings-card local-settings" aria-labelledby="theme-settings-title">
              <h2 id="theme-settings-title">Görünüm</h2>
              <p>Göz yormayan koyu çalışma alanı veya yumuşak taş tonlu açık tema arasında geçiş yapabilirsin.</p>
              <div className="theme-toggle-options" role="radiogroup" aria-label="Tema seçimi">
                <button
                  type="button"
                  role="radio"
                  aria-checked={(preferences.theme ?? "dark") === "dark"}
                  className={`theme-choice-card ${(preferences.theme ?? "dark") === "dark" ? "is-selected" : ""}`}
                  onClick={() => changePreference({ ...preferences, theme: "dark" })}
                >
                  <span className="theme-preview-swatch swatch-dark" aria-hidden="true" />
                  <div>
                    <strong>Koyu Tema</strong>
                    <small>Gece mavisi ve derin koyu yüzeyler</small>
                  </div>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={preferences.theme === "light"}
                  className={`theme-choice-card ${preferences.theme === "light" ? "is-selected" : ""}`}
                  onClick={() => changePreference({ ...preferences, theme: "light" })}
                >
                  <span className="theme-preview-swatch swatch-light" aria-hidden="true" />
                  <div>
                    <strong>Açık Tema</strong>
                    <small>Göz almayan yumuşak gri-taş tonları</small>
                  </div>
                </button>
              </div>

              {/* Ölçek Seçimi Kartın İçinde Zarif Bir Şekilde Yer Alır */}
              <DisplayScaleControls />
            </section>

            {/* Kart 2: Başlangıç ve Sistem Durumu */}
            <section className="settings-card surface local-settings" aria-labelledby="general-preferences-title">
              <div className="settings-card-heading">
                <div>
                  <h2 id="general-preferences-title">Başlangıç ve Sistem Durumu</h2>
                  <p className="task-hint">
                    ACKDeck açılışında gösterilecek varsayılan sayfayı ve ana sayfadaki sistem durumu yenileme hızını seç.
                  </p>
                </div>
              </div>
              <div className="archive-form-grid" style={{ marginTop: "0.75rem" }}>
                <label className="archive-field" htmlFor="settings-start-page">
                  Başlangıç Sayfası
                  <select
                    id="settings-start-page"
                    value={normalizeStartPage(preferences.startPage)}
                    onChange={(event) =>
                      changePreference({
                        ...preferences,
                        startPage: normalizeStartPage(event.target.value),
                      })
                    }
                    style={{ fontSize: "14px", padding: "8px 12px", borderRadius: "6px" }}
                  >
                    {START_PAGES.map((page) => (
                      <option key={page} value={page}>
                        {START_PAGE_LABELS[page]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="archive-field" htmlFor="settings-pc-refresh">
                  Sistem Durumu Yenileme Hızı
                  <select
                    id="settings-pc-refresh"
                    value={preferences.pcRefreshMs}
                    onChange={(event) => {
                      const nextMs = Number(event.target.value);
                      if ((PC_REFRESH_INTERVALS as readonly number[]).includes(nextMs)) {
                        changePreference({
                          ...preferences,
                          pcRefreshMs: nextMs as PcRefreshInterval,
                        });
                      }
                    }}
                    style={{ fontSize: "14px", padding: "8px 12px", borderRadius: "6px" }}
                  >
                    {PC_REFRESH_INTERVALS.map((interval) => (
                      <option key={interval} value={interval}>
                        {PC_REFRESH_LABELS[interval]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {/* Kart 3: Şehir ve Konum (Tek Seçim 81 İl) */}
            <CitySettings />

            {/* Kart 4: Windows Davranışı */}
            <DesktopSettings status={desktop} onChange={onDesktopChange} />
          </section>

          {/* 2. SEKME: BİLDİRİMLER */}
          <section
            role="tabpanel"
            id="settings-panel-notifications"
            aria-labelledby="settings-tab-notifications"
            hidden={selectedSection !== "notifications"}
            className="settings-section-panel"
          >
            <NotificationSettings />
          </section>

          {/* 3. SEKME: BAĞLANTILAR (Telefon & ACK AI) */}
          <section
            role="tabpanel"
            id="settings-panel-connections"
            aria-labelledby="settings-tab-connections"
            hidden={selectedSection !== "connections"}
            className="settings-section-panel"
          >
            {/* Telefon Eşitleme Kartı */}
            <PhoneSettings />

            {/* ACK AI Gemini Kartı */}
            <section className="settings-card surface local-settings" aria-labelledby="ai-settings-heading">
              <div className="settings-card-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 id="ai-settings-heading" style={{ margin: 0 }}>ACK AI (Gemini)</h2>
                  <p className="task-hint" style={{ marginTop: "0.25rem" }}>
                    ACK AI sohbeti ve akıllı asistan için Google Gemini API bağlantısı.
                  </p>
                </div>
                <span className={"key-status " + (hasKey ? "saved" : "")}>
                  {hasKey === null ? "Kontrol ediliyor" : hasKey ? "● Anahtar Kayıtlı" : "Anahtar Yok"}
                </span>
              </div>

              <form onSubmit={saveKey} className="api-key-form" style={{ marginTop: "1rem" }}>
                <label htmlFor="gemini-key">Gemini API Anahtarı</label>
                <input
                  id="gemini-key"
                  ref={inputRef}
                  type="password"
                  placeholder={hasKey ? "••••••••••••••••••••••••••••••••" : "AIzaSy... API anahtarını girin"}
                  autoComplete="new-password"
                  spellCheck={false}
                  disabled={action !== null}
                />
                <p className="task-hint" style={{ fontSize: "0.78rem", marginTop: "0.4rem" }}>
                  API anahtarınız yerel Windows Kimlik Bilgisi Yöneticisi'nde şifreli olarak korunur; asla dışarıya sızdırılmaz.
                </p>
                <div className="settings-actions" style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                  <button className="button button-primary" type="submit" disabled={action !== null}>
                    {action === "save" ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  <button className="button button-secondary" type="button" onClick={testKey} disabled={action !== null || !hasKey}>
                    {action === "test" ? "Test ediliyor..." : "Bağlantıyı Test Et"}
                  </button>
                  <ActionMenu label="İşlemler">
                    <button className="danger-action" type="button" onClick={removeKey} disabled={action !== null || !hasKey}>
                      Kayıtlı Anahtarı Sil
                    </button>
                  </ActionMenu>
                </div>
              </form>

              {feedback && (
                <div className={"feedback " + feedback.kind} role="status" style={{ marginTop: "0.75rem" }}>
                  {feedback.text}
                </div>
              )}
            </section>
          </section>

          {/* 4. SEKME: VERİ & GÜNCELLEME (En Son Sekme) */}
          <section
            role="tabpanel"
            id="settings-panel-data"
            aria-labelledby="settings-tab-data"
            hidden={selectedSection !== "data"}
            className="settings-section-panel"
          >
            {/* Kart 1: Yedekleme */}
            <BackupSettings desktop={desktop} />

            {/* Kart 2: Çöp Kutusu */}
            <TrashSettings />

            {/* Kart 3: Uygulama Güncellemesi */}
            <UpdateSettings version={desktop?.version} />
          </section>
        </div>
      </div>
    </div>
  );
}
