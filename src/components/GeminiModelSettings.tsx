import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { aiErrorMessage } from "../geminiClient";
type Models = { fast: string; powerful: string };
export function GeminiModelSettings({ hasKey }: { hasKey: boolean }) {
  const [saved, setSaved] = useState<Models | null>(null), [draft, setDraft] = useState<Models | null>(null);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  const running = useRef(false);
  useEffect(() => { let active = true; void invoke<Models>("get_gemini_models").then(value => { if (active) { setSaved(value); setDraft(value); } }).catch(() => { if (active) setFeedback("Model ayarları okunamadı. Mevcut ayarlar korunuyor."); }); return () => { active = false; }; }, []);
  async function save() {
    if (!draft || running.current || !hasKey) return;
    running.current = true; setBusy(true); setFeedback("Modellerin gerçek yanıtı kontrol ediliyor…");
    try {
      for (const modelName of [...new Set([draft.fast.trim(), draft.powerful.trim()])]) await invoke("test_gemini_model", { modelName });
      const settings = { fast: draft.fast.trim(), powerful: draft.powerful.trim() };
      await invoke("save_gemini_models", { settings }); setSaved(settings); setDraft(settings); setFeedback("İki model de yanıt verdi; model ayarları kaydedildi.");
    } catch (error) { setFeedback(aiErrorMessage(error) + " Mevcut model ayarları değiştirilmedi."); }
    finally { running.current = false; setBusy(false); }
  }
  return <details className="gemini-model-settings"><summary>Model adlarını düzenle</summary><p className="task-hint">Hızlı ve Güçlü seçeneklerinin kullanacağı Gemini modelini belirle. Kaydetmeden önce kısa bir yanıt testi yapılır.</p>{draft && <div className="archive-form-grid"><label className="archive-field">Hızlı model<input value={draft.fast} maxLength={100} spellCheck={false} disabled={busy} onChange={e => setDraft({ ...draft, fast: e.target.value })} placeholder="gemini-3.5-flash-lite" /></label><label className="archive-field">Güçlü model<input value={draft.powerful} maxLength={100} spellCheck={false} disabled={busy} onChange={e => setDraft({ ...draft, powerful: e.target.value })} placeholder="gemini-3.8-flash" /></label></div>}<div className="settings-actions"><button type="button" className="button button-secondary" onClick={save} disabled={busy || !draft || !hasKey}>{busy ? "Test ediliyor…" : "Test et ve kaydet"}</button><button type="button" className="button button-secondary" disabled={busy || !saved} onClick={() => { setDraft(saved); setFeedback(""); }}>Değişiklikleri geri al</button></div>{!hasKey && <p className="task-hint">Önce Gemini API anahtarını kaydet.</p>}{feedback && <p role="status" className="feedback">{feedback}</p>}</details>;
}
