import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createFullBackup, parseBackup, restoreBackup, type Backup } from "../backupStore";
import { getDesktopStatus, type DesktopStatus } from "../desktopClient";
import { localDateKey } from "../taskStore";
import { getAutoBackupInfo } from "../useAutoBackup";

export function BackupSettings({ desktop }: { desktop: DesktopStatus | null }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const busyRef = useRef(false);
  const [kind, setKind] = useState("portable");
  const [token, setToken] = useState<string | null>(null);
  const [autoBackup, setAutoBackup] = useState(getAutoBackupInfo);

  useEffect(() => {
    const onBackupDone = () => setAutoBackup(getAutoBackupInfo());
    window.addEventListener("ack-auto-backup-completed", onBackupDone);
    return () => window.removeEventListener("ack-auto-backup-completed", onBackupDone);
  }, []);

  function notify(msg: string) {
    window.dispatchEvent(new CustomEvent("ack-settings-toast", { detail: msg }));
  }

  async function exportBackup() {
    if (!desktop || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const backup = await createFullBackup({ ...desktop.preferences, autoStart: desktop.autoStart }, desktop.version);
      if (kind === "portable") {
        const count = await invoke<number | null>("save_portable_backup", { content: JSON.stringify(backup) });
        notify(count === null ? "Yedekleme iptal edildi." : `Dosyalı yedek kaydedildi (${count} ek dosya dahil).`);
      } else {
        const saved = await invoke<boolean>("save_backup", {
          content: JSON.stringify(backup, null, 2),
          fileName: "ACKDeck-Backup-" + localDateKey() + ".json",
        });
        notify(saved ? "JSON yedeği kaydedildi." : "Yedekleme iptal edildi.");
      }
    } catch {
      notify("Yedek oluşturulamadı.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function selectBackup() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await invoke<{ content: string; token: string | null; fileCount: number } | null>("choose_portable_backup");
      if (result) {
        try {
          setPending(parseBackup(result.content));
          setToken(result.token);
        } catch (error) {
          if (result.token) await invoke("finish_portable_restore", { token: result.token, keep: false });
          throw error;
        }
      }
    } catch {
      notify("Yedek okunamadı veya biçimi geçersiz.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function openBackupFolder() {
    try {
      await invoke("open_auto_backup_dir");
    } catch {
      notify("Yedek klasörü açılamadı.");
    }
  }

  async function confirm() {
    if (!pending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let restoring = false;
    try {
      const current = await getDesktopStatus();
      const backup = token ? parseBackup(await invoke<string>("prepare_portable_restore", { token })) : pending;
      restoring = true;
      await restoreBackup(backup, true, { ...current.preferences, autoStart: current.autoStart });
      if (token) await invoke("finish_portable_restore", { token, keep: true });
      setPending(null);
      setToken(null);
      notify(token ? "Yedek başarıyla geri yüklendi." : "JSON yedeği geri yüklendi.");
    } catch (error) {
      if (token) await invoke("finish_portable_restore", { token, keep: restoring }).catch(() => {});
      setPending(null);
      setToken(null);
      notify(error instanceof Error ? error.message : "Geri yükleme tamamlanamadı.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="settings-card surface local-settings" aria-labelledby="backup-title">
      <div className="settings-card-heading">
        <div>
          <h2 id="backup-title">Yedekleme</h2>
          <p className="task-hint">
            Kayıtlarını, sohbetlerini ve tercihlerini sakla. Dosyalı yedek, not eklerini ve arşiv dosyalarını da güvenle paketler.
          </p>
        </div>
      </div>

      <label className="archive-field backup-kind" style={{ marginTop: "0.75rem" }}>
        Yedek türü
        <select value={kind} disabled={busy || !!pending} onChange={(e) => setKind(e.target.value)}>
          <option value="portable">Dosyalar dahil · ZIP</option>
          <option value="json">Yalnız kayıtlar · JSON</option>
        </select>
        <small>
          {kind === "portable"
            ? "Dosya başına 100 MB, toplam 512 MB. Not ve arşiv ekleri dahildir."
            : "Yalnızca JSON metin kayıtları saklanır; harici dosya içerikleri taşınmaz."}
        </small>
      </label>

      <div className="settings-actions" style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <button type="button" className="button button-primary" onClick={exportBackup} disabled={busy || !desktop || !!pending}>
          Yedek Oluştur
        </button>
        <button type="button" className="button button-secondary" onClick={openBackupFolder} disabled={busy}>
          📂 Yedek Klasörünü Aç
        </button>
        <button type="button" className="button button-secondary" onClick={selectBackup} disabled={busy || !desktop || !!pending}>
          Yedekten Geri Yükle
        </button>
      </div>

      {autoBackup.lastTime && (
        <div
          className="auto-backup-status-badge"
          style={{
            marginTop: "1.25rem",
            padding: "0.65rem 0.85rem",
            background: "rgba(14, 165, 233, 0.08)",
            border: "1px solid rgba(14, 165, 233, 0.2)",
            borderRadius: "0.6rem",
            fontSize: "0.82rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>🛡️</span>
          <div>
            <strong>Son otomatik yedek:</strong> {new Date(autoBackup.lastTime).toLocaleString("tr-TR")} ({autoBackup.lastFile})
          </div>
        </div>
      )}

      {pending && (
        <div className="backup-confirm" role="group" aria-label="Yedekten geri yükleme onayı" style={{ marginTop: "1rem" }}>
          <h3>Mevcut ACKDeck kayıtları değiştirilsin mi?</h3>
          <p>
            Görevler, projeler, notlar, arşiv ve tercihler yedektekilerle eşitlenir.
          </p>
          <p>Yedek tarihi: {new Date(pending.createdAt).toLocaleString("tr-TR")}</p>
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.75rem" }}>
            <button type="button" className="button button-primary" disabled={busy} onClick={confirm}>
              Onayla ve Geri Yükle
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                if (token) void invoke("finish_portable_restore", { token, keep: false }).catch(() => {});
                setPending(null);
                setToken(null);
              }}
            >
              İptal
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
