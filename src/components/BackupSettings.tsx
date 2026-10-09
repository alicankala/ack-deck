import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createFullBackup, parseBackup, restoreBackup, type Backup } from "../backupStore";
import { getDesktopStatus, type DesktopStatus } from "../desktopClient";
import { localDateKey } from "../taskStore";
export function BackupSettings({ desktop }: { desktop: DesktopStatus | null }) {
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(""), [pending, setPending] = useState<Backup | null>(null);
  const busyRef = useRef(false);
  const [kind, setKind] = useState("portable"), [token, setToken] = useState<string | null>(null), [fileCount, setFileCount] = useState(0);
  async function exportBackup() {
    if (!desktop || busyRef.current) return; busyRef.current = true; setBusy(true); setFeedback("");
    try {
      const backup = await createFullBackup({ ...desktop.preferences, autoStart: desktop.autoStart }, desktop.version);
      if (kind === "portable") { const count = await invoke<number | null>("save_portable_backup", { content: JSON.stringify(backup) }); setFeedback(count === null ? "Yedekleme iptal edildi." : `Dosyalı yedek kaydedildi. ${count} ek dosya dahil edildi; API anahtarı dahil edilmedi.`); }
      else { const saved = await invoke<boolean>("save_backup", { content: JSON.stringify(backup, null, 2), fileName: "ACKDeck-Backup-" + localDateKey() + ".json" }); setFeedback(saved ? "JSON yedeği kaydedildi. Fiziksel dosyalar ve API anahtarı dahil edilmedi." : "Yedekleme iptal edildi."); }
    }
    catch (error) { const errors = ["Bir ek dosya bulunamadı. Eksik dosyayı düzelt veya JSON yedeğini kullan.", "Dosyalı yedek sınırı aşıldı: dosya başına 100 MB, toplam 512 MB.", "Ek dosya gizli anahtar içeriyor; dosyalı yedek oluşturulmadı.", "Dosyalı yedeğe çalıştırılabilir veya gizli anahtar dosyası eklenemez. JSON yedeğini kullanabilirsin."]; setFeedback(typeof error === "string" && errors.includes(error) ? error : "Yedek oluşturulamadı. Ek dosyaların bu bilgisayarda bulunduğunu ve seçtiğin konumu kontrol et. Eksik veya gizli anahtar içeren dosyalar sessizce atlanmaz."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function selectBackup() {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setFeedback("");
    try { const result = await invoke<{content:string;token:string|null;fileCount:number} | null>("choose_portable_backup"); if (result) { try { setPending(parseBackup(result.content)); setToken(result.token); setFileCount(result.fileCount); } catch (error) { if (result.token) await invoke("finish_portable_restore", { token:result.token, keep:false }); throw error; } } }
    catch { setFeedback("Yedek okunamadı veya biçimi geçersiz. Mevcut veriler değiştirilmedi."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!pending || busyRef.current) return; busyRef.current = true; setBusy(true); setFeedback("");
    let restoring = false;
    try { const current = await getDesktopStatus(); const backup = token ? parseBackup(await invoke<string>("prepare_portable_restore", { token })) : pending; restoring = true; await restoreBackup(backup, true, { ...current.preferences, autoStart: current.autoStart }); if (token) await invoke("finish_portable_restore", { token, keep:true }); setPending(null); setToken(null); setFeedback(token ? "Yedek geri yüklendi; ek dosyalar bu bilgisayara taşındı." : "JSON yedeği geri yüklendi."); }
    catch (error) { if (token) await invoke("finish_portable_restore", { token, keep:restoring }).catch(() => {}); setPending(null); setToken(null); setFeedback(error instanceof Error ? error.message : "Geri yükleme tamamlanamadı. Mevcut veriler korunuyor."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <section className="settings-card surface local-settings" aria-labelledby="backup-title"><h2 id="backup-title">Yedekleme</h2><p className="task-hint">Kayıtlarını, sohbetlerini ve tercihlerini sakla. Dosyalı yedek, not eklerini ve arşive bağladığın dosyaları başka bilgisayara taşır. API anahtarları ve seçilmiş uygulamaların çalışma izni yedeklenmez.</p><label className="archive-field backup-kind">Yedek türü<select value={kind} disabled={busy || !!pending} onChange={e => setKind(e.target.value)}><option value="portable">Dosyalar dahil · ZIP</option><option value="json">Yalnız kayıtlar · JSON</option></select><small>{kind === "portable" ? "Dosya başına 100 MB, toplam 512 MB. Eksik dosya varsa yedekleme durur." : "Dosya yolları saklanır; dosyaların içeriği taşınmaz."}</small></label><div className="settings-actions"><button type="button" className="button button-secondary" onClick={exportBackup} disabled={busy || !desktop || !!pending}>Yedek Oluştur</button><button type="button" className="button button-secondary" onClick={selectBackup} disabled={busy || !desktop || !!pending}>Yedekten Geri Yükle</button></div>
    {pending && <div className="backup-confirm" role="group" aria-label="Yedekten geri yükleme onayı"><h3>Mevcut ACKDeck kayıtları değiştirilsin mi?</h3><p>Görevler, projeler, notlar, dosya kayıtları, arşiv, hız testi sonucu ve tercihler yedektekilerle değişir. Windows başlangıç tercihleri de uygulanır. Yedekte varsa çalışma alanları, kısayollar, sabitlemeler, son kullanılanlar, sohbetler ve global kısayol da geri yüklenir. Eski yedekler yeni kayıtları silmez. Gemini anahtarı değişmez.</p>{token ? <p>{fileCount} ek dosya uygulamanın veri klasörüne kopyalanır; var olan dosyaların üzerine yazılmaz.</p> : <p>Bu JSON yedeği fiziksel dosyaları içermez.</p>}<p>Seçilmiş uygulama hedefleri yalnızca bu bilgisayardaki güvenli kayıttan açılır. Başka bilgisayarda veya eksik native kayıtta uygulamayı yeniden seçmek gerekir.</p><p>Yedek tarihi: {new Date(pending.createdAt).toLocaleString("tr-TR")}</p><button type="button" className="button button-primary" disabled={busy} onClick={confirm}>Onayla ve Geri Yükle</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => { if (token) void invoke("finish_portable_restore", { token, keep:false }).catch(() => {}); setPending(null); setToken(null); }}>İptal</button></div>}{feedback && <p className="feedback" role="status">{feedback}</p>}</section>;
}
