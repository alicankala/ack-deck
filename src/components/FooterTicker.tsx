import { useEffect, useState } from "react";
import { fetchRates, FOOTER_REFRESH_MS, type Rates } from "../footerInfo";
import { PcStatus } from "./PcStatus";
import {
  MODE_LABELS,
  clearPomodoroTargetAndReset,
  confirmPomodoroTargetDone,
  dismissPomodoroConfirm,
  extendPomodoro,
  togglePomodoroPause,
  usePomodoroStore,
} from "../pomodoroStore";

let rateCache: { data: Rates; at: number } | undefined;
const number = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PomodoroFooterPill() {
  const { mode, timeLeft, totalSeconds, isRunning, target, pendingConfirm } = usePomodoroStore();

  if (!isRunning && timeLeft >= totalSeconds && !pendingConfirm) {
    return null;
  }

  if (pendingConfirm) {
    return (
      <div className="footer-pomodoro-pill is-confirm" role="status">
        <span className="footer-pomodoro-label" title={pendingConfirm.label}>
          🍅 {pendingConfirm.label}
        </span>
        <button
          type="button"
          className="footer-pomodoro-btn is-done"
          onClick={confirmPomodoroTargetDone}
          title={pendingConfirm.kind === "study" ? "Çalıştım olarak işaretle" : "Tamamlandı olarak işaretle"}
        >
          ✓ {pendingConfirm.kind === "study" ? "Çalıştım" : "Tamamlandı"}
        </button>
        <button
          type="button"
          className="footer-pomodoro-btn"
          onClick={() => extendPomodoro(15)}
          title="15 dakika uzat"
        >
          +15 dk
        </button>
        <button
          type="button"
          className="footer-pomodoro-btn"
          onClick={dismissPomodoroConfirm}
          aria-label="Bildirimi kapat"
        >
          ✕
        </button>
      </div>
    );
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className={`footer-pomodoro-pill ${isRunning ? "is-running" : "is-paused"}`} role="status">
      <span className="footer-pomodoro-time">
        {MODE_LABELS[mode].icon} {formatted}
      </span>
      {target && (
        <span className="footer-pomodoro-label" title={target.label}>
          · {target.label}
        </span>
      )}
      <button
        type="button"
        className="footer-pomodoro-btn"
        onClick={togglePomodoroPause}
        title={isRunning ? "Duraklat" : "Devam et"}
        aria-label={isRunning ? "Sayacı duraklat" : "Sayacı devam ettir"}
      >
        {isRunning ? "⏸" : "▶"}
      </button>
      {target && (
        <button
          type="button"
          className="footer-pomodoro-btn is-done"
          onClick={confirmPomodoroTargetDone}
          title={target.kind === "study" ? "Erken bitir ve Çalıştım işaretle" : "Erken bitir ve Tamamlandı işaretle"}
          aria-label="Tamamlandı işaretle"
        >
          ✓
        </button>
      )}
      <button
        type="button"
        className="footer-pomodoro-btn"
        onClick={clearPomodoroTargetAndReset}
        title="Sayacı iptal et"
        aria-label="Sayacı iptal et"
      >
        ✕
      </button>
    </div>
  );
}

export function FooterTicker({ refreshMs = 2500, hidePomodoro = false }: { refreshMs?: number; hidePomodoro?: boolean } = {}) {
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
    <footer className="app-footer" aria-label="Sistem durumu ve döviz bilgileri">
      <PcStatus refreshMs={refreshMs} footer />
      {!hidePomodoro && <PomodoroFooterPill />}
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
