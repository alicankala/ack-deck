import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSavedAiModel, saveAiModel } from "../aiModelPreference";
import { savePreferences, type Preferences, type StartPage } from "../preferences";
import {
  aiErrorMessage,
  deleteGeminiKey,
  getGeminiKeyStatus,
  saveGeminiKey,
  testGeminiConnection,
} from "../geminiClient";
import { WeatherSettings } from "./WeatherSettings";
import { Icon } from "./Icon";
import { DisplayScaleSettings } from "./DisplayScaleSettings";
import { PhoneSettings } from "./PhoneSettings";
import { DesktopSettings } from "./DesktopSettings";
import { BackupSettings } from "./BackupSettings";
import { PaletteShortcutSettings } from "./PaletteShortcutSettings";
import { AboutSettings } from "./AboutSettings";
import type { DesktopStatus } from "../desktopClient";

type Action = "save" | "delete" | "test";
type Feedback = { kind: "success" | "error"; text: string };

export function Settings({ preferences, onPreferencesChange, desktop, onDesktopChange }: { preferences: Preferences; onPreferencesChange: (value: Preferences) => void; desktop: DesktopStatus | null; onDesktopChange: (status: DesktopStatus) => void }) {
  const [aiModel, setAiModel] = useState(getSavedAiModel);
  const [preferenceFeedback, setPreferenceFeedback] = useState("");
  function changePreference(value: Preferences) {
    if (savePreferences(value)) { onPreferencesChange(value); setPreferenceFeedback("Tercihler kaydedildi."); }
    else setPreferenceFeedback("Tercihler kaydedilemedi.");
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let active = true;
    getGeminiKeyStatus()
      .then((saved) => { if (active) setHasKey(saved); })
      .catch((error: unknown) => {
        if (active) setFeedback({ kind: "error", text: aiErrorMessage(error) });
      });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
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
      setFeedback({ kind: "success", text: "API anahtarı Windows kimlik bilgilerine kaydedildi." });
    } catch (error) {
      setFeedback({ kind: "error", text: aiErrorMessage(error) });
    } finally {
      setAction(null);
    }
  }

  async function remove() {
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

  async function test() {
    setAction("test");
    setFeedback(null);
    try {
      await testGeminiConnection(getSavedAiModel());
      setFeedback({ kind: "success", text: "Gemini bağlantısı başarılı." });
    } catch (error) {
      setFeedback({ kind: "error", text: aiErrorMessage(error) });
    } finally {
      setAction(null);
    }
  }

  return <div className="settings-page">
    <header className="feature-heading">

      <h1>Ayarlar</h1>
      <p>ACKDeck için yerel ayarlarını buradan yönet.</p>
    </header>
      {preferenceFeedback && <p className="feedback" role="status">{preferenceFeedback}</p>}
    <details className="settings-fold settings-group" open><summary>Genel</summary><div className="settings-group-content">
    <section className="settings-card surface local-settings" aria-labelledby="local-settings-heading">
      <h2 id="local-settings-heading">Yerel tercihler</h2>
      <div className="archive-form-grid">
        <label className="archive-field">Başlangıç sayfası<select value={preferences.startPage} onChange={(event) => changePreference({ ...preferences, startPage: event.target.value as StartPage })}><option value="home">Ana Sayfa</option><option value="ai">ACK AI</option><option value="projects">Projeler</option><option value="tools">Araçlar</option><option value="archive">Arşiv</option></select></label>
        <label className="archive-field">PC Durumu yenileme aralığı<select value={preferences.pcRefreshMs} onChange={(event) => changePreference({ ...preferences, pcRefreshMs: Number(event.target.value) as Preferences["pcRefreshMs"] })}><option value={2500}>2,5 saniye</option><option value={5000}>5 saniye</option><option value={10000}>10 saniye</option></select></label>

      </div>

    </section>
    <DesktopSettings status={desktop} onChange={onDesktopChange} />
    <PaletteShortcutSettings />
    <details className="advanced-fields"><summary>Hakkında ve sistem kontrolü</summary><AboutSettings version={desktop?.version} /></details>
    </div></details>
    <details className="settings-fold settings-group"><summary>Görünüm</summary><div className="settings-group-content">
    <DisplayScaleSettings />
    <WeatherSettings />
    </div></details>
    <details className="settings-fold settings-group"><summary>Bağlantılar</summary><div className="settings-group-content">
    <section className="settings-card surface" aria-labelledby="ai-settings-heading">
      <div className="settings-card-heading">
        <span className="feature-icon"><Icon name="spark" size={23} /></span>
        <div><h2 id="ai-settings-heading">ACK AI ve Gemini</h2><p>ACK AI için Gemini Developer API bağlantısı. Bağlantı testi seçili modeli kontrol eder.</p></div>
        <span className={"key-status " + (hasKey ? "saved" : "")}>{hasKey === null ? "Kontrol ediliyor" : hasKey ? "Anahtar kayıtlı" : "Anahtar yok"}</span>
      </div>
        <label className="archive-field">ACK AI modeli<select value={aiModel} onChange={(event) => { const choice = event.target.value === "powerful" ? "powerful" : "fast"; if (saveAiModel(choice)) { setAiModel(choice); setPreferenceFeedback("AI modeli kaydedildi."); } else setPreferenceFeedback("AI modeli kaydedilemedi."); }}><option value="fast">Hızlı</option><option value="powerful">Güçlü</option></select><small>ACK AI'da yaptığın son model seçimi de hatırlanır.</small></label>
      <form onSubmit={save} className="api-key-form">
        <label htmlFor="gemini-key">Gemini API Anahtarı</label>
        <input id="gemini-key" ref={inputRef} type="password" placeholder={hasKey ? "•••••••••••••••" : "API anahtarını gir"} autoComplete="new-password" spellCheck={false} disabled={action !== null} />
        <p>Anahtar Windows Kimlik Bilgisi Yöneticisi'nde saklanır. Kayıtlı anahtarın değeri uygulamada gösterilmez.</p>
        <div className="settings-actions">
          <button className="button button-primary" type="submit" disabled={action !== null}>{action === "save" ? "Kaydediliyor..." : "Kaydet"}</button>
          <button className="button button-secondary" type="button" onClick={test} disabled={action !== null || !hasKey}>{action === "test" ? "Test ediliyor..." : "Bağlantıyı Test Et"}</button>
          <details className="overflow-menu"><summary aria-label="Gemini anahtarı işlemleri">⋯</summary><div><button className="danger-action" type="button" onClick={remove} disabled={action !== null || !hasKey}>Kayıtlı anahtarı sil</button></div></details>
        </div>
      </form>
      {feedback && <div className={"feedback " + feedback.kind} role="status">{feedback.text}</div>}
    </section>
    <PhoneSettings />
    <details className="advanced-fields"><summary>İnternet kullanımı</summary>    <section className="settings-card surface local-settings"><h2>İnternet kullanan özellikler</h2><dl className="system-check-list"><div><dt>ACK AI</dt><dd>Yalnızca mesaj gönderdiğinde Gemini ile iletişim kurar.</dd></div><div><dt>Dosya Analizi</dt><dd>Yalnızca seçip gönderdiğin dosya Gemini'ye iletilir.</dd></div><div><dt>Genel IP</dt><dd>IP sayfasını açtığında veya yenilediğinde public IP hizmetine istek gönderir.</dd></div><div><dt>Hız Testi</dt><dd>Yalnızca başlattığında Cloudflare altyapısını kullanır.</dd></div></dl><p>Kayıtlar, sohbet araması, çalışma alanları ve kısayollar yereldir. İzleme veya kullanım istatistikleri toplanmaz. Telefon eşitlemesi yalnızca açık onayınızla etkinleştirilir.</p></section></details>
    </div></details>
    <details className="settings-fold settings-group"><summary>Yedekleme</summary><div className="settings-group-content">
    <BackupSettings desktop={desktop} />
    </div></details>

  </div>;
}
