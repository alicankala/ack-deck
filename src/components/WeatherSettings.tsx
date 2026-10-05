import { useState } from "react";
import { loadWeatherCity, saveWeatherCity } from "../footerInfo";
export function WeatherSettings() {
  const [city, setCity] = useState(loadWeatherCity);
  const [message, setMessage] = useState("");
  return <section className="settings-card surface"><h2>Hava durumu</h2><form onSubmit={event => { event.preventDefault(); setMessage(saveWeatherCity(city) ? "Şehir kaydedildi. Hava durumu yenileniyor." : "Şehir kaydedilemedi. Geçerli bir şehir girin; mevcut kayıt korunuyor."); }}><label className="archive-field" htmlFor="weather-city">Şehir<input id="weather-city" value={city} maxLength={80} required placeholder="Örn. Ankara" onChange={event => setCity(event.target.value)} /></label><p>Hava durumu Open-Meteo’dan, günlük alış/satış kurları TCMB’den alınır. Alt şerit uygulama görünürken 30 dakikada bir yenilenir. Seçilen şehir hava durumu hizmetine gönderilir.</p><button className="button button-primary" type="submit">Şehri kaydet</button></form>{message && <p className="feedback" role="status">{message}</p>}</section>;
}
