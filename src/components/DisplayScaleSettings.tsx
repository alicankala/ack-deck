import { useState } from "react";
import { useDisplayScale } from "../DisplayScale";
import { DISPLAY_SCALES, isDisplayScale } from "../displayScaleStore";
export function DisplayScaleSettings() {
  const display = useDisplayScale();
  const [feedback, setFeedback] = useState("");
  return <section className="surface settings-card local-settings display-settings" aria-labelledby="display-scale-title">
    <h2 id="display-scale-title">Arayüz ölçeği</h2>
    <p>Geçerli ekran: <strong>{display.label}</strong></p>
    <p>Ölçek her ekran için ayrı saklanır ve pencereyi taşıdığınızda uygulanır. Windows ölçeği değişmez.</p>
    <div className="display-scale-controls">
      <label htmlFor="display-scale">Bu ekranın ölçeği</label>
      <select id="display-scale" value={display.scale} disabled={!display.key} onChange={event => {
        const value = Number(event.target.value);
        if (isDisplayScale(value)) setFeedback(display.change(value) ? "Ekran ölçeği kaydedildi." : "Ekran ölçeği kaydedilemedi. Mevcut ayarlar korundu.");
      }}>{DISPLAY_SCALES.map(scale => <option key={scale} value={scale}>%{scale}</option>)}</select>
      <button className="button" type="button" disabled={!display.key} onClick={() => setFeedback(display.change(null) ? "Bu ekran varsayılan ölçeğe döndü." : "Ekran ölçeği kaydedilemedi. Mevcut ayarlar korundu.")}>Bu ekran için varsayılana dön</button>
    </div>
    <p role="status" aria-live="polite">{feedback}</p>
  </section>;
}
