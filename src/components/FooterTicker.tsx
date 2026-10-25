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
    { code: "USD", label: "Dolar (Alış / Satış)", symbol: "$", type: "fiat" },
    { code: "EUR", label: "Euro (Alış / Satış)", symbol: "€", type: "fiat" },
    { code: "GBP", label: "Sterlin (Alış / Satış)", symbol: "£", type: "fiat" },
    { code: "GRA", label: "Gram Altın (Alış / Satış)", symbol: "🪙", type: "gold" },
    { code: "BTC", label: "Bitcoin (USD)", symbol: "₿", type: "crypto" },
    { code: "ETH", label: "Ethereum (USD)", symbol: "Ξ", type: "crypto" },
    { code: "XU100", label: "BIST 100 Endeksi", symbol: "📈", type: "stock" },
  ]
    .map(def => {
      const rate = rates?.rates.find(value => value.code === def.code);
      if (!rate && rates) {
        return null;
      }
      let sourceTitle = "TCMB · Günlük kur";
      let formattedValue = "Yükleniyor…";

      if (rate) {
        if (def.type === "crypto") {
          sourceTitle = "Binance / Global Piyasa · Canlı (USD)";
          formattedValue = `$${rate.selling.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else if (def.type === "stock") {
          sourceTitle = "Borsa İstanbul (BIST) · Canlı Endeks";
          formattedValue = `${rate.selling.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} P`;
        } else if (def.type === "gold") {
          sourceTitle = "Serbest Piyasa · Canlı Altın";
          formattedValue = `${number(rate.buying)} / ${number(rate.selling)} ₺`;
        } else {
          sourceTitle = "TCMB · Günlük kur";
          formattedValue = `${number(rate.buying)} / ${number(rate.selling)} ₺`;
        }
        if (rateError) formattedValue += " · Son veri";
      } else if (rateError) {
        formattedValue = "Alınamadı";
      }

      return {
        label: def.label,
        symbol: def.symbol,
        value: formattedValue,
        title: `${sourceTitle}${rates?.date ? ` · ${rates.date}` : ""}${rateError ? " · Yenileme başarısız" : ""}`,
      };
    })
    .filter(Boolean) as { label: string; symbol: string; value: string; title: string }[];

  useEffect(() => {
    if (hovered || focused || items.length === 0) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [hovered, focused, items.length]);

  const item = items[index % items.length];
  return (
    <footer className="app-footer" aria-label="Döviz ve altın bilgileri">
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
