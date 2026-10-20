import { useEffect, useState } from "react";
import { fetchRates, fetchWeather, FOOTER_REFRESH_MS, loadWeatherCity, weatherDescription, type Rates, type Weather } from "../footerInfo";
import { loadPrayerConfig, getTodayPrayerInfo } from "../prayerStore";
import { formatRemainingTime } from "../../shared/prayerTimes";

let rateCache: { data: Rates; at: number } | undefined;
let weatherCache: { data: Weather; city: string; at: number } | undefined;
const number = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FooterTicker() {
  const [city, setCity] = useState(loadWeatherCity);
  const [weather, setWeather] = useState(weatherCache?.city === city ? weatherCache.data : undefined);
  const [rates, setRates] = useState(rateCache?.data);
  const [prayerInfo, setPrayerInfo] = useState(() => getTodayPrayerInfo(loadPrayerConfig()));
  const [weatherError, setWeatherError] = useState("");
  const [rateError, setRateError] = useState(false);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const changed = () => { setCity(loadWeatherCity()); setIndex(0); };
    window.addEventListener("ack-weather-city-changed", changed);
    return () => window.removeEventListener("ack-weather-city-changed", changed);
  }, []);
  useEffect(() => {
    const handlePrayerChanged = () => {
      setPrayerInfo(getTodayPrayerInfo(loadPrayerConfig()));
    };
    window.addEventListener("ack-prayer-config-changed", handlePrayerChanged);
    const prayerTimer = window.setInterval(handlePrayerChanged, 60000);
    return () => {
      window.removeEventListener("ack-prayer-config-changed", handlePrayerChanged);
      window.clearInterval(prayerTimer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setWeather(weatherCache?.city === city ? weatherCache.data : undefined); setWeatherError("");
    async function refresh() {
      await Promise.allSettled([
        (async () => {
          if (rateCache && Date.now() - rateCache.at < FOOTER_REFRESH_MS) { if (active) setRates(rateCache.data); return; }
          try { const data = await fetchRates(); if (active) { rateCache = { data, at: Date.now() }; setRates(data); setRateError(false); } } catch { if (active) setRateError(true); }
        })(),
        (async () => {
          if (weatherCache?.city === city && Date.now() - weatherCache.at < FOOTER_REFRESH_MS) { if (active) setWeather(weatherCache.data); return; }
          try { const data = await fetchWeather(city); if (active) { weatherCache = { data, city, at: Date.now() }; setWeather(data); setWeatherError(""); } } catch (error) { if (active) setWeatherError(typeof error === "string" && error.startsWith("Şehir bulunamadı") ? "Şehir bulunamadı" : "Alınamadı"); }
        })(),
      ]);
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), FOOTER_REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [city]);
  useEffect(() => {
    if (hovered || focused) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % 4), 5000);
    return () => window.clearInterval(timer);
  }, [hovered, focused]);
  const prayerNext = prayerInfo.nextPrayer;
  const prayerKerahat = prayerInfo.kerahat;
  const prayerSummary = prayerKerahat.inKerahat
    ? `⚠️ ${prayerKerahat.label} (${formatRemainingTime(prayerKerahat.remainingMs ?? 0)} kaldı)`
    : prayerNext
    ? `${prayerNext.label} ${prayerNext.time} (${formatRemainingTime(prayerInfo.timeToNextMs)} kaldı)`
    : "Vakitler güncel";

  const items = [
    { label: `Hava — ${weather?.city ?? city}`, symbol: weather && weather.code <= 1 ? "☀" : "☁", value: weather ? `${Math.round(weather.temperature)}°C · ${weatherDescription(weather.code)}${weatherError ? " · Son veri" : ""}` : weatherError || "Yükleniyor…", title: `Open-Meteo${weatherError ? ` · ${weatherError}` : ""}` },
    { label: `Namaz — ${prayerInfo.city}`, symbol: "🕌", value: prayerSummary, title: `Diyanet vakitleri · ${prayerInfo.city}` },
    ...[ ["USD", "Dolar", "$"], ["EUR", "Euro", "€"], ["GBP", "Sterlin", "£"] ].map(([code, label, symbol]) => {
      const rate = rates?.rates.find(value => value.code === code);
      return { label: `${label} (Alış / Satış)`, symbol, value: rate ? `${number(rate.buying)} / ${number(rate.selling)} ₺${rateError ? " · Son veri" : ""}` : rateError ? "Alınamadı" : "Yükleniyor…", title: `TCMB · Günlük kur${rates ? ` · ${rates.date}` : ""}${rateError ? " · Yenileme başarısız" : ""}` };
    }),
  ];
  const item = items[index % items.length];
  return <footer className="app-footer" aria-label="Hava durumu ve döviz bilgileri"><button type="button" className="footer-ticker" title={`${item.title} · Sonraki bilgi için tıkla`} aria-label={`${item.label}: ${item.value}. Sonraki bilgiyi göster`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={() => setIndex(value => (value + 1) % items.length)}><span key={index} className="footer-ticker-content"><span className="footer-symbol" aria-hidden="true">{item.symbol}</span><span>{item.label}:</span><strong>{item.value}</strong></span></button></footer>;
}
