import { useState } from "react";
import { useDisplayScale } from "../DisplayScale";
import { DISPLAY_SCALES, isDisplayScale } from "../displayScaleStore";

export function DisplayScaleControls() {
  const display = useDisplayScale();
  const [feedback, setFeedback] = useState("");

  return (
    <div className="display-scale-embedded" style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--app-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div>
          <strong style={{ fontSize: "0.95rem", display: "block", color: "var(--app-text)" }}>Arayüz Ölçeği</strong>
          <small style={{ color: "var(--app-muted)", fontSize: "0.78rem" }}>
            Geçerli ekran: {display.label || "Birincil Ekran"} (Ölçek pencereyi taşıdığında otomatik uygulanır)
          </small>
        </div>
      </div>
      <div className="display-scale-controls" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <select
          id="display-scale"
          value={display.scale}
          disabled={!display.key}
          style={{ fontSize: "14px", padding: "6px 12px", borderRadius: "6px" }}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (isDisplayScale(value)) {
              setFeedback(display.change(value) ? "Ekran ölçeği kaydedildi." : "Ekran ölçeği kaydedilemedi.");
              setTimeout(() => setFeedback(""), 3000);
            }
          }}
        >
          {DISPLAY_SCALES.map((scale) => (
            <option key={scale} value={scale}>
              %{scale}
            </option>
          ))}
        </select>
        <button
          className="button button-secondary"
          type="button"
          style={{ fontSize: "0.8rem", padding: "6px 12px" }}
          disabled={!display.key}
          onClick={() => {
            setFeedback(display.change(null) ? "Varsayılan ölçeğe dönüldü." : "Ölçek sıfırlanamadı.");
            setTimeout(() => setFeedback(""), 3000);
          }}
        >
          Varsayılana Dön
        </button>
      </div>
      {feedback && <p role="status" className="feedback" style={{ marginTop: "0.4rem", fontSize: "0.78rem" }}>{feedback}</p>}
    </div>
  );
}
