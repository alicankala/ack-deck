import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createFullBackup, parseBackup, restoreBackup, type Backup } from "../backupStore";
import { getDesktopStatus, type DesktopStatus } from "../desktopClient";
import { localDateKey } from "../taskStore";
export function BackupSettings({ desktop }: { desktop: DesktopStatus | null }) {
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(""), [pending, setPending] = useState<Backup | null>(null);
  const busyRef = useRef(false);
  async function exportBackup() {
    if (!desktop || busyRef.current) return; busyRef.current = true; setBusy(true); setFeedback("");
    try { const backup = await createFullBackup({ ...desktop.preferences, autoStart: desktop.autoStart }, desktop.version); const saved = await invoke<boolean>("save_backup", { content: JSON.stringify(backup, null, 2), fileName: "ACKDeck-Backup-" + localDateKey() + ".json" }); setFeedback(saved ? "Yedek kaydedildi. API anahtarı yedeğe dahil edilmedi." : "Yedekleme iptal edildi."); }
    catch { setFeedback("Yedek oluşturulamadı. Kayıtların okunabilirliğini ve seçtiğin konumu kontrol et. Gizli anahtar içeren kayıtlar yedeklenmez."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function selectBackup() {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setFeedback("");
    try { const content = await invoke<string | null>("choose_backup"); if (content !== null) setPending(parseBackup(content)); }
    catch { setFeedback("Yedek okunamadı veya biçimi geçersiz. Mevcut veriler değiştirilmedi."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!pending || busyRef.current) return; busyRef.current = true; setBusy(true); setFeedback("");
    try { const current = await getDesktopStatus(); await restoreBackup(pending, true, { ...current.preferences, autoStart: current.autoStart }); setPending(null); setFeedback("Yedek geri yüklendi."); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Geri yükleme tamamlanamadı. Mevcut veriler korunuyor."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <section className="settings-card surface local-settings" aria-labelledby="backup-title"><h2 id="backup-title">Veriler</h2><p className="task-hint">Kayıtlar, dosya yolları ve tercihler yerel JSON yedeğine kaydedilir. Sohbet geçmişi, çalışma alanları, kısayollar, son kullanılanlar ve global kısayol tercihi dahildir. Gerçek dosyalar, eklenen dosya içerikleri, API anahtarı ve Credential Manager içeriği dahil edilmez.</p><div className="settings-actions"><button type="button" className="button button-secondary" onClick={exportBackup} disabled={busy || !desktop || !!pending}>Yedek Oluştur</button><button type="button" className="button button-secondary" onClick={selectBackup} disabled={busy || !desktop || !!pending}>Yedekten Geri Yükle</button></div>
    {pending && <div className="backup-confirm" role="group" aria-label="Yedekten geri yükleme onayı"><h3>Mevcut ACKDeck kayıtları değiştirilsin mi?</h3><p>Görevler, projeler, notlar, dosya kayıtları, arşiv, hız testi sonucu ve tercihler yedektekilerle değişir. Windows başlangıç tercihleri de uygulanır. Yedekte varsa çalışma alanları, kısayollar, sabitlemeler, son kullanılanlar, sohbetler ve global kısayol da geri yüklenir. Eski yedekler yeni kayıtları silmez. Gerçek dosyalar ve Gemini anahtarı değişmez.</p><p>Seçilmiş uygulama hedefleri yalnızca bu bilgisayardaki güvenli kayıttan açılır. Başka bilgisayarda veya eksik native kayıtta uygulamayı yeniden seçmek gerekir.</p><p>Yedek tarihi: {new Date(pending.createdAt).toLocaleString("tr-TR")}</p><button type="button" className="button button-primary" disabled={busy} onClick={confirm}>Onayla ve Geri Yükle</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setPending(null)}>İptal</button></div>}{feedback && <p className="feedback" role="status">{feedback}</p>}</section>;
}
