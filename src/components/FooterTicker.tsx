import { useEffect, useState } from "react";
import { fetchRates, FOOTER_REFRESH_MS, type Rates } from "../footerInfo";

let rateCache: { data: Rates; at: number } | undefined;
const number = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FooterTicker() {
  const [rates, setRates] = useState(rateCache?.data);
  const [rateError, setRateError] = useState(false);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (rateCache && Date.now() - rateCache.at < FOOTER_REFRESH_MS) {
        if (active) setRates(rateCache.data);
        return;
      }
      try {
        const data = await fetchRates();
        if (active) {
          rateCache = { data, at: Date.now() };
          setRates(data);
          setRateError(false);
        }
      } catch {
        if (active) setRateError(true);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), FOOTER_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const items = [
    ["USD", "Dolar", "$"],
    ["EUR", "Euro", "€"],
    ["GBP", "Sterlin", "£"],
  ].map(([code, label, symbol]) => {
    const rate = rates?.rates.find(value => value.code === code);
    return {
      label: `${label} (Alış / Satış)`,
      symbol,
      value: rate
        ? `${number(rate.buying)} / ${number(rate.selling)} ₺${rateError ? " · Son veri" : ""}`
        : rateError
        ? "Alınamadı"
        : "Yükleniyor…",
      title: `TCMB · Günlük kur${rates ? ` · ${rates.date}` : ""}${rateError ? " · Yenileme başarısız" : ""}`,
    };
  });

  useEffect(() => {
    if (hovered || focused || items.length === 0) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [hovered, focused, items.length]);

  const item = items[index % items.length];
  return (
    <footer className="app-footer" aria-label="Döviz bilgileri">
      <button
        type="button"
        className="footer-ticker"
        title={`${item.title} · Sonraki kur için tıkla`}
        aria-label={`${item.label}: ${item.value}. Sonraki kuru göster`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => setIndex(value => (value + 1) % items.length)}
      >
        <span key={index} className="footer-ticker-content">
          <span className="footer-symbol" aria-hidden="true">
            {item.symbol}
          </span>
          <span>{item.label}:</span>
          <strong>{item.value}</strong>
        </span>
      </button>
    </footer>
  );
}
