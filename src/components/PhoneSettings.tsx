import { useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";
import { configurePhone, phoneRequest, phoneStatus, type PhoneStatus } from "../phoneClient";
import { readPhoneSync, resolvePhoneConflict, synchronizePhone } from "../phoneSync";

type Device = { id: string; name: string; lastSeen: number; notifications: number | null };

export function PhoneSettings() {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pair, setPair] = useState<{ url: string; code: string; expiresAt: number } | null>(null);
  const [qr, setQr] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [sync, setSync] = useState(() => {
    try {
      return readPhoneSync();
    } catch {
      return null;
    }
  });

  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    void phoneStatus()
      .then((val) => {
        if (!active) return;
        setStatus(val);
        if (val.enabled) {
          void phoneRequest<{ devices: Device[] }>("devices")
            .then((res) => active && setDevices(res.devices))
            .catch(() => {});
        }
      })
      .catch(() => window.dispatchEvent(new CustomEvent("ack-settings-toast", { detail: "Telefon ayarları okunamadı." })));

    const configured = () => {
      void phoneStatus().then((val) => active && setStatus(val)).catch(() => {});
    };
    window.addEventListener("ack-phone-configured", configured);

    const refresh = () => {
      try {
        setSync(readPhoneSync());
      } catch {}
    };
    window.addEventListener("ack-phone-sync-status", refresh);

    return () => {
      active = false;
      window.removeEventListener("ack-phone-configured", configured);
      window.removeEventListener("ack-phone-sync-status", refresh);
    };
  }, []);

  useEffect(() => {
    if (!pair) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((pair.expiresAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [pair]);

  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "Telefon işlemi tamamlanamadı.";
      window.dispatchEvent(new CustomEvent("ack-settings-toast", { detail: msg }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleStartPair() {
    await action(async () => {
      if (!status?.enabled) {
        await configurePhone("", true);
        setStatus(await phoneStatus());
        window.dispatchEvent(new Event("ack-phone-configured"));
      }
      const result = await phoneRequest<{ url: string; code: string; expiresAt: number }>("pair");
      setPair(result);
      setQr(await toDataURL(result.url, { width: 220, margin: 2 }));
    });
  }

  async function handleRevoke(device: Device) {
    if (!window.confirm(`${device.name} cihazının erişimi kaldırılsın mı? Görev ve notlar silinmez.`)) return;
    await action(async () => {
      await phoneRequest("revoke", { deviceId: device.id });
      setDevices(devices.filter((row) => row.id !== device.id));
      window.dispatchEvent(new CustomEvent("ack-settings-toast", { detail: `${device.name} cihazının bağlantısı kesildi.` }));
    });
  }

  return (
    <section className="settings-card surface local-settings" aria-labelledby="phone-settings-title">
      <div className="settings-card-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 id="phone-settings-title" style={{ margin: 0 }}>Telefon Eşitleme</h2>
          <p className="task-hint" style={{ marginTop: "0.25rem" }}>
            Görevler, notlar ve hatırlatıcılar iPhone ACKDeck Mobile PWA ile güvenli bulut üzerinden eşitlenir.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.65rem", background: status?.enabled ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)", borderRadius: "999px", border: `1px solid ${status?.enabled ? "rgba(16, 185, 129, 0.25)" : "rgba(148, 163, 184, 0.2)"}` }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: status?.enabled ? "#10b981" : "#94a3b8" }} />
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: status?.enabled ? "#10b981" : "#94a3b8" }}>
            {status?.enabled ? "Bulut Aktif" : "Kapalı"}
          </span>
        </div>
      </div>

      <div className="settings-actions" style={{ marginTop: "1rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="button button-primary"
          disabled={busy}
          onClick={handleStartPair}
        >
          📱 Telefon Eşleştir
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => void action(async () => {
            await synchronizePhone();
            setSync(readPhoneSync());
            window.dispatchEvent(new CustomEvent("ack-settings-toast", { detail: "Senkronizasyon tamamlandı." }));
          })}
        >
          Şimdi Eşitle
        </button>
      </div>

      {pair && (
        <div className="phone-pair-card" style={{ marginTop: "1.25rem", padding: "1.25rem", background: "rgba(0, 0, 0, 0.2)", borderRadius: "10px", border: "1px solid var(--app-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem" }}>iPhone Eşleştirme</h3>
            <button type="button" className="button button-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }} onClick={() => setPair(null)}>Kapat</button>
          </div>
          {remaining > 0 ? (
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <img src={qr} alt="Eşleştirme QR kodu" style={{ width: "160px", height: "160px", borderRadius: "8px", background: "white", padding: "4px" }} />
              <div style={{ flex: 1, minWidth: "220px" }}>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--app-secondary)" }}>
                  1. iPhone kamerasından QR kodu okutun veya Safari ile açın.
                </p>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--app-secondary)" }}>
                  2. İstersen mobil açılışta aşağıdaki eşleştirme kodunu girin:
                </p>
                <div style={{ display: "inline-block", padding: "0.4rem 0.8rem", background: "rgba(255, 255, 255, 0.06)", border: "1px dashed rgba(255, 255, 255, 0.2)", borderRadius: "6px", fontFamily: "monospace", fontSize: "1.25rem", letterSpacing: "2px", fontWeight: "bold", color: "#38bdf8" }}>
                  {pair.code}
                </div>
                <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#eab308" }}>
                  ⏱ Kalan süre: {remaining} saniye
                </p>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <p style={{ color: "#ef4444", marginBottom: "0.75rem" }}>Eşleştirme kodunun süresi doldu.</p>
              <button type="button" className="button button-primary" onClick={handleStartPair}>Yeni Kod Oluştur</button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Eşleştirilmiş Cihazlar</h3>
        {devices.length > 0 ? (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {devices.map((device) => (
              <div
                key={device.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem 1rem",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "8px",
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "0.9rem" }}>📱 {device.name}</strong>
                  <small style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
                    Son erişim: {new Date(device.lastSeen).toLocaleString("tr-TR")} · Bildirimler: {device.notifications ? "Açık" : "Kapalı"}
                  </small>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem", color: "#f87171" }}
                  disabled={busy}
                  onClick={() => handleRevoke(device)}
                >
                  Erişimi Kaldır
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="task-hint" style={{ fontSize: "0.82rem", margin: 0 }}>
            Henüz eşleştirilmiş bir telefon yok.
          </p>
        )}
      </div>

      {sync?.conflicts && sync.conflicts.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          {sync.conflicts.map((conflict, index) => (
            <div className="backup-confirm" key={index} style={{ padding: "0.75rem", borderRadius: "8px" }}>
              <h4 style={{ margin: "0 0 0.3rem" }}>Eşitleme Çakışması</h4>
              <p style={{ fontSize: "0.8rem", margin: "0 0 0.5rem" }}>
                {conflict.local.data && "text" in conflict.local.data
                  ? conflict.local.data.text
                  : conflict.local.data && "title" in conflict.local.data
                  ? conflict.local.data.title
                  : "Silinmiş kayıt"}
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ fontSize: "0.75rem" }}
                  disabled={busy}
                  onClick={() => void action(async () => {
                    await resolvePhoneConflict(index, true);
                    setSync(readPhoneSync());
                  })}
                >
                  Bulut Sürümünü Kullan
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ fontSize: "0.75rem" }}
                  disabled={busy}
                  onClick={() => void action(async () => {
                    await resolvePhoneConflict(index, false);
                    await synchronizePhone();
                    setSync(readPhoneSync());
                  })}
                >
                  Yerel Sürümü Gönder
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* toast handles feedback */}
    </section>
  );
}
