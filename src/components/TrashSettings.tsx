import { useEffect, useState } from "react";
import {
  loadTrash,
  restoreTrash,
  removeTrash,
  trashRecordExists,
  TRASH_RETENTION,
  type TrashSource,
} from "../trashStore";

const labels: Record<TrashSource, string> = {
  tasks: "Görev",
  notes: "Not",
  archive: "Arşiv",
  workspaces: "Çalışma alanı",
  shortcuts: "Kısayol",
  subscriptions: "Abonelik",
};

export function TrashSettings() {
  const [loaded, setLoaded] = useState(loadTrash);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setLoaded(loadTrash());
    window.addEventListener("ack-trash-changed", refresh);
    window.addEventListener("ack-data-changed", refresh);
    return () => {
      window.removeEventListener("ack-trash-changed", refresh);
      window.removeEventListener("ack-data-changed", refresh);
    };
  }, []);

  const rows = loaded.entries.filter(
    (t) => t.deletedAt > Date.now() - TRASH_RETENTION && !trashRecordExists(t)
  );

  return (
    <section className="settings-card surface local-settings" aria-labelledby="trash-title">
      <div className="settings-card-heading">
        <div>
          <h2 id="trash-title">Son Silinenler</h2>
          <p className="task-hint">
            Silinen kayıtlar 30 gün boyunca bu bilgisayarda saklanır ve istendiğinde tek tıkla geri getirilebilir.
          </p>
        </div>
      </div>

      {loaded.locked && <p role="alert" className="feedback error">Silinen kayıtlar okunamadı.</p>}
      {error && <p role="alert" className="feedback error">{error}</p>}

      <div className="trash-list" style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
        {rows.map((t) => {
          const title = "text" in t.record ? t.record.text : "title" in t.record ? t.record.title : t.record.name;
          const daysLeft = Math.max(1, Math.ceil((t.deletedAt + TRASH_RETENTION - Date.now()) / 86400000));

          return (
            <div
              className="trash-row"
              key={t.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                gap: "1rem",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </strong>
                <small style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
                  {labels[t.source]} · Silinme: {new Date(t.deletedAt).toLocaleDateString("tr-TR")} · {daysLeft} gün kaldı
                </small>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                  onClick={() => {
                    setError(restoreTrash(t.id) ? "" : "Kayıt geri getirilemedi.");
                  }}
                >
                  Geri Getir
                </button>

                {confirmId === t.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <button
                      type="button"
                      className="button button-primary"
                      style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem", background: "#ef4444", borderColor: "#ef4444" }}
                      onClick={() => {
                        if (!removeTrash(t.id)) setError("Kayıt silinemedi.");
                        setConfirmId(null);
                      }}
                    >
                      Sil
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
                      onClick={() => setConfirmId(null)}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem", color: "#f87171" }}
                    onClick={() => setConfirmId(t.id)}
                  >
                    Kalıcı Sil
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!rows.length && !loaded.locked && (
        <p className="task-hint" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
          Çöp kutusu boş. Silinen herhangi bir kayıt yok.
        </p>
      )}
    </section>
  );
}
