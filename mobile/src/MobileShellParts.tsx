import type { FormEvent } from "react";
import type { WeatherData } from "../../shared/weather";
import type { CloudRecord, Mutation } from "../../shared/phone";
import type { MobileState } from "./store";
import { Icon } from "./Icon";

export function MobilePairingScreen(props: {
  name: string;
  setName: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  busy: boolean;
  ready: boolean;
  error: string;
  onSubmit: (e: FormEvent) => void;
}) {
  const { name, setName, code, setCode, busy, ready, error, onSubmit } = props;
  return (
    <main className="pairing-page">
      <header>
        <img src="/icon-192.png" alt="ACK" />
        <h1>ACKDeck</h1>
      </header>
      <div className="pairing-intro">
        <span className="mobile-eyebrow">TELEFON VE BİLGİSAYAR</span>
        <h2>Her şey yanında.</h2>
        <p>Görevlerin, notların, derslerin ve namaz vakitlerin tek yerde.</p>
      </div>
      <h3>Telefonunu eşleştir</h3>
      <p>
        Safari paylaşım menüsünden Ana Ekrana Ekle'yi seçin. Uygulamayı Ana Ekranınızdan açıp bilgisayardaki Telefon
        bölümünün kodunu girin.
      </p>
      <form onSubmit={onSubmit}>
        <label>
          Cihaz adı
          <input value={name} onChange={e => setName(e.target.value)} required maxLength={80} />
        </label>
        <label>
          Eşleştirme kodu
          <input autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required />
        </label>
        <button disabled={busy || !ready}>Eşleştir</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  );
}

export function MobileAppHeader(props: {
  online: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  const { online, busy, onRefresh } = props;
  return (
    <header className="mobile-header">
      <div className="mobile-brand">
        <img src="/icon-192.png" alt="ACK" className="mobile-brand-icon" />
        <div>
          <strong>ACKDeck</strong>
          <span>{new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" })}</span>
        </div>
      </div>
      <div className="mobile-header-tools">
        <div className={`mobile-connection-pill ${online ? "online" : ""}`}>
          <span className="pill-dot" />
          <span>{online ? "PC Açık" : "Çevrimdışı"}</span>
        </div>
        <button
          type="button"
          className={`refresh-button ${busy ? "is-busy" : ""}`}
          aria-label="Kayıtları yenile"
          disabled={busy}
          onClick={onRefresh}
        >
          <Icon name="refresh" size={19} />
        </button>
      </div>
    </header>
  );
}

export function MobileTodayHero(props: {
  mobileGreeting: string;
  weather: WeatherData | null;
  unfinishedCount: number;
  todayStudyCount: number;
  notesCount: number;
  onOpenWeatherModal: () => void;
  onOpenPlanCalendar: () => void;
  onOpenNotes: () => void;
}) {
  const {
    mobileGreeting,
    weather,
    unfinishedCount,
    todayStudyCount,
    notesCount,
    onOpenWeatherModal,
    onOpenPlanCalendar,
    onOpenNotes,
  } = props;

  return (
    <>
      <div className="mobile-greeting-strip">
        <span className="mobile-greeting-title">{mobileGreeting}</span>
        {weather ? (
          <button
            type="button"
            className="mobile-greeting-weather"
            onClick={onOpenWeatherModal}
            title={`${weather.city} Hava Durumu: ${weather.temperature}°C, ${weather.desc} — Detaylar için tıkla`}
          >
            <span className="weather-symbol">{weather.symbol}</span>
            <span className="weather-text">
              {weather.city} {weather.temperature}°C · {weather.desc}
            </span>
          </button>
        ) : (
          <div className="mobile-greeting-weather" title="Hava durumu yükleniyor">
            <span className="weather-symbol">🌤️</span>
            <span className="weather-text">Yükleniyor…</span>
          </div>
        )}
      </div>

      <div className="mobile-metrics-bar">
        <button type="button" className="metric-chip" onClick={onOpenPlanCalendar}>
          <strong>{unfinishedCount}</strong>
          <span>Görev</span>
        </button>
        <button type="button" className="metric-chip" onClick={onOpenPlanCalendar}>
          <strong>{todayStudyCount}</strong>
          <span>Ders</span>
        </button>
        <button type="button" className="metric-chip" onClick={onOpenNotes}>
          <strong>{notesCount}</strong>
          <span>Not</span>
        </button>
      </div>
    </>
  );
}

export function MobileConflictCards(props: {
  state: MobileState;
  busy: boolean;
  commit: (next: MobileState) => Promise<void>;
  refresh: (next: MobileState) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const { state, busy, commit, refresh, onError } = props;
  return (
    <>
      {state.conflicts.map((conflict, index) => (
        <article key={index} className="mobile-conflict-card">
          <h3>Eşitleme çakışması</h3>
          <p>Bu kayıt başka cihazda değişti. İki sürüm korundu.</p>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() => {
                void commit({
                  ...state,
                  conflicts: state.conflicts.filter((_, i) => i !== index),
                  records: conflict.server
                    ? [
                        ...state.records.filter(
                          r => r.id !== conflict.server!.id || r.kind !== conflict.server!.kind
                        ),
                        conflict.server,
                      ]
                    : state.records,
                }).catch(e => onError(e.message));
              }}
            >
              Bulut sürümünü kullan
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const mutation = {
                  ...conflict.mutation,
                  mutationId: crypto.randomUUID(),
                  baseVersion: conflict.server?.version ?? 0,
                };
                const next = {
                  ...state,
                  conflicts: state.conflicts.filter((_, i) => i !== index),
                  queue: [...state.queue, mutation],
                };
                void commit(next)
                  .then(() => refresh(next))
                  .catch(e => onError(e.message));
              }}
            >
              Yerel sürümü gönder
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

export function MobileToasts(props: {
  undo: { row: CloudRecord; expires: number } | null;
  notice: string;
  busy: boolean;
  records: CloudRecord[];
  saveMutation: (m: Mutation) => Promise<void>;
  onClearUndo: () => void;
  onError: (msg: string) => void;
}) {
  const { undo, notice, busy, records, saveMutation, onClearUndo, onError } = props;
  return (
    <>
      {undo && undo.expires > Date.now() && (
        <div className="undo-toast" role="status">
          Kayıt silindi
          <button
            disabled={busy}
            onClick={() => {
              const row = records.find(r => r.kind === undo.row.kind && r.id === undo.row.id);
              void saveMutation({
                mutationId: crypto.randomUUID(),
                kind: undo.row.kind,
                id: undo.row.id,
                baseVersion: row?.version ?? undo.row.version + 1,
                data: undo.row.data,
                deleted: false,
              })
                .then(onClearUndo)
                .catch(e => onError(e.message));
            }}
          >
            Geri al
          </button>
        </div>
      )}

      {notice && (
        <div className="mobile-toast" role="status">
          <span>{notice}</span>
        </div>
      )}
    </>
  );
}
