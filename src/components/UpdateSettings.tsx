import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "./Icon";
import {
  checkUpdates,
  formatUpdateBytes,
  formatUpdateCheckTime,
  formatUpdateVersion,
  installUpdate,
  subscribeUpdates,
  updateSnapshot,
  type UpdateStatus,
} from "../updateClient";

type Tone = "ok" | "neutral" | "busy" | "progress" | "ready" | "error";

type UpdatePresentation = {
  tone: Tone;
  pillText: string;
  icon: IconName;
  spinning?: boolean;
  title: string;
  meta: string;
  telemetryText?: string;
  telemetryPercent?: string;
  showProgressBar: boolean;
  progressPercent: number | null;
  actionLabel?: string;
  actionKind: "primary" | "secondary" | "none";
  actionDisabled?: boolean;
  actionType?: "check" | "install";
};

function resolveUpdatePresentation(status: UpdateStatus, version?: string): UpdatePresentation {
  const installedLabel = formatUpdateVersion(version);
  const checkedLabel = formatUpdateCheckTime(status.checkedAt);
  const checkedMeta = checkedLabel
    ? `Son denetim: ${checkedLabel} · Kurulum öncesi otomatik yedek alınır`
    : "Açılışta otomatik kontrol edilir · Kurulum öncesi yedek alınır";

  switch (status.phase) {
    case "checking":
      return {
        tone: "busy",
        pillText: "Denetleniyor",
        icon: "refresh",
        spinning: true,
        title: "GitHub üzerinden yeni sürüm denetleniyor...",
        meta: "Yeni bir sürüm varsa otomatik indirilip imzası doğrulanır",
        showProgressBar: false,
        progressPercent: null,
        actionLabel: "Denetleniyor...",
        actionKind: "secondary",
        actionDisabled: true,
        actionType: "check",
      };

    case "downloading": {
      const targetVersion = formatUpdateVersion(status.progress?.version ?? status.version);
      const downloaded = status.progress?.downloadedBytes ?? 0;
      const total = status.progress?.totalBytes ?? null;
      const percent = status.progress?.percent ?? null;
      const bytesText =
        total && total > 0
          ? `${formatUpdateBytes(downloaded)} / ${formatUpdateBytes(total)}`
          : downloaded > 0
            ? `${formatUpdateBytes(downloaded)} indirildi`
            : "Bağlantı kuruluyor...";
      const percentText = percent !== null ? `%${percent}` : undefined;

      return {
        tone: "progress",
        pillText: percentText ? `İndiriliyor · ${percentText}` : "İndiriliyor",
        icon: "arrowDown",
        title: `ACKDeck ${targetVersion} indiriliyor`,
        meta: "İndirme tamamlanınca yayıncı imzası doğrulanacak",
        telemetryText: bytesText,
        telemetryPercent: percentText,
        showProgressBar: true,
        progressPercent: percent,
        actionKind: "none",
      };
    }

    case "verifying": {
      const targetVersion = formatUpdateVersion(status.progress?.version ?? status.version);
      return {
        tone: "progress",
        pillText: "Doğrulanıyor",
        icon: "refresh",
        spinning: true,
        title: `ACKDeck ${targetVersion} imza doğrulaması yapılıyor...`,
        meta: "Paket bütünlüğü ve güncelleme imzası kontrol ediliyor",
        telemetryText: "Doğrulanıyor",
        telemetryPercent: "%100",
        showProgressBar: true,
        progressPercent: 100,
        actionKind: "none",
      };
    }

    case "ready": {
      const targetVersion = formatUpdateVersion(status.version);
      return {
        tone: "ready",
        pillText: `${targetVersion} Hazır`,
        icon: "arrowDown",
        title: `ACKDeck ${targetVersion} indirildi ve kurulum için hazır`,
        meta: status.message || "Başlatmadan önce tüm kayıtlarının tam yedeği otomatik alınır",
        showProgressBar: false,
        progressPercent: null,
        actionLabel: "Kur ve Yeniden Başlat",
        actionKind: "primary",
        actionDisabled: false,
        actionType: "install",
      };
    }

    case "installing":
      return {
        tone: "busy",
        pillText: "Kuruluyor",
        icon: "refresh",
        spinning: true,
        title: "Kurulum öncesi tam yedek alınıyor ve yeniden başlatılıyor...",
        meta: "Kayıtların güvenli yedek klasörüne kaydediliyor; lütfen uygulamayı kapatma",
        showProgressBar: true,
        progressPercent: null,
        actionLabel: "Yedekleniyor...",
        actionKind: "primary",
        actionDisabled: true,
        actionType: "install",
      };

    case "error":
      return {
        tone: "error",
        pillText: "Hata",
        icon: "info",
        title: status.message || "GitHub güncellemesi denetlenemedi veya indirilemedi.",
        meta: checkedLabel
          ? `Son başarılı denetim: ${checkedLabel} · İnternet bağlantısını kontrol edip tekrar dene`
          : "İnternet bağlantısını kontrol edip tekrar deneyebilirsiniz",
        showProgressBar: false,
        progressPercent: null,
        actionLabel: "Tekrar Dene",
        actionKind: "secondary",
        actionDisabled: false,
        actionType: "check",
      };

    case "idle":
    default:
      if (status.upToDate) {
        return {
          tone: "ok",
          pillText: "Güncel",
          icon: "checkCircle",
          title: `ACKDeck güncel (${installedLabel})`,
          meta: checkedMeta,
          showProgressBar: false,
          progressPercent: null,
          actionLabel: "Güncellemeleri Denetle",
          actionKind: "secondary",
          actionDisabled: false,
          actionType: "check",
        };
      }
      return {
        tone: "neutral",
        pillText: "Hazır",
        icon: "info",
        title: status.message || "Güncelleme durumu henüz denetlenmedi",
        meta: checkedMeta,
        showProgressBar: false,
        progressPercent: null,
        actionLabel: "Güncellemeleri Denetle",
        actionKind: "secondary",
        actionDisabled: false,
        actionType: "check",
      };
  }
}

export function UpdateSettings({ version }: { version?: string }) {
  const status = useSyncExternalStore(subscribeUpdates, updateSnapshot);
  const view = resolveUpdatePresentation(status, version);
  const installedLabel = formatUpdateVersion(version);

  return (
    <section
      className="settings-card surface local-settings update-settings-card"
      aria-labelledby="update-settings-title"
    >
      <div className="settings-card-heading update-settings-heading">
        <div>
          <h2 id="update-settings-title">Uygulama Güncellemeleri</h2>
          <p className="update-settings-subtitle">
            Kurulu sürüm: <strong>{installedLabel}</strong> · Açılışta GitHub üzerinden denetlenir
          </p>
        </div>
        <span className={`update-status-pill is-${view.tone}`} aria-live="polite">
          <span className="update-status-dot" aria-hidden="true" />
          <span>{view.pillText}</span>
        </span>
      </div>

      <div className={`update-status-strip is-${view.tone}`}>
        <div className="update-strip-row">
          <div
            className={`update-strip-icon is-${view.tone}${view.spinning ? " is-spinning" : ""}`}
            aria-hidden="true"
          >
            <Icon name={view.icon} size={18} />
          </div>

          <div className="update-strip-copy" role="status" aria-live="polite">
            <p className="update-strip-title">{view.title}</p>
            <p className="update-strip-meta">{view.meta}</p>
          </div>

          <div className="update-strip-action">
            {view.telemetryText && (
              <div className="update-progress-readout">
                <span>{view.telemetryText}</span>
                {view.telemetryPercent && (
                  <span className="update-progress-percent">{view.telemetryPercent}</span>
                )}
              </div>
            )}

            {view.actionKind !== "none" && view.actionLabel && (
              <button
                type="button"
                className={view.actionKind === "primary" ? "button button-primary" : "button button-secondary"}
                disabled={view.actionDisabled}
                onClick={() => {
                  if (view.actionType === "install") {
                    void installUpdate();
                  } else {
                    void checkUpdates();
                  }
                }}
              >
                {view.actionLabel}
              </button>
            )}
          </div>
        </div>

        {view.showProgressBar && (
          <div
            className="update-progress-track"
            role="progressbar"
            aria-label="Güncelleme ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.progressPercent ?? undefined}
          >
            <div
              className={`update-progress-fill${view.progressPercent === null ? " is-indeterminate" : ""}`}
              style={view.progressPercent !== null ? { width: `${view.progressPercent}%` } : undefined}
            />
          </div>
        )}
      </div>
    </section>
  );
}
