import { useState, useEffect, useCallback, useId } from "react";
import {
  loadSecurityConfig,
  verifySecurityPasscode,
  authenticateBiometrics,
  unlockSecurity,
  disableSecurity,
  type MobileSecurityConfig,
} from "./mobileSecurity";

export function MobileLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [config, setConfig] = useState<MobileSecurityConfig>(loadSecurityConfig);
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isAuthenticatingBio, setIsAuthenticatingBio] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setConfig(loadSecurityConfig());
  }, []);

  const triggerFaceId = useCallback(async () => {
    if (!config.biometricsEnabled) return;
    setIsAuthenticatingBio(true);
    setErrorMsg("");
    try {
      const ok = await authenticateBiometrics(config.biometricsCredentialId);
      if (ok) {
        unlockSecurity();
        onUnlock();
      }
    } catch (e) {
      console.warn("Face ID failed:", e);
    } finally {
      setIsAuthenticatingBio(false);
    }
  }, [config, onUnlock]);

  // Attempt Face ID automatically once on mount
  useEffect(() => {
    if (config.biometricsEnabled) {
      const timer = setTimeout(() => {
        void triggerFaceId();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [config.biometricsEnabled, triggerFaceId]);

  const handleNumberPress = async (digit: string) => {
    if (pin.length >= 8) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg("");

    // If it reaches standard PIN length (4 or 6), try verifying
    if (nextPin.length >= 4) {
      const ok = await verifySecurityPasscode(nextPin);
      if (ok) {
        unlockSecurity();
        onUnlock();
        return;
      }
      // If it reached max 6 digits and still not valid
      if (nextPin.length >= 6) {
        setIsShaking(true);
        setErrorMsg("Hatalı şifre. Tekrar deneyin.");
        setTimeout(() => {
          setPin("");
          setIsShaking(false);
        }, 500);
      }
    }
  };

  const handleDelete = () => {
    setPin(p => p.slice(0, -1));
    setErrorMsg("");
  };

  const handleReset = () => {
    if (
      confirm(
        "Uygulama kilidini sıfırlamak istediğinize emin misiniz? Şifre ve Face ID kaldırılacaktır."
      )
    ) {
      disableSecurity();
      onUnlock();
    }
  };

  const pinLength = Math.max(4, pin.length);
  const dots = Array.from({ length: Math.min(6, Math.max(4, pinLength)) });

  return (
    <div
      className="mobile-lock-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="mobile-lock-container">
        {/* Brand & Icon */}
        <div className="mobile-lock-header">
          <div className="lock-icon-badge" aria-hidden="true">
            {config.biometricsEnabled ? "👤" : "🔒"}
          </div>
          <h2 id={titleId} className="mobile-lock-title">
            ACKDeck Kilitli
          </h2>
          <p className="mobile-lock-desc">
            {config.biometricsEnabled
              ? "Face ID ile doğrulayın veya şifrenizi girin"
              : "Devam etmek için şifrenizi girin"}
          </p>
        </div>

        {/* PIN Dots Display */}
        <div className={`lock-dots-display ${isShaking ? "is-shaking" : ""}`}>
          {dots.map((_, i) => (
            <span
              key={i}
              className={`lock-dot ${i < pin.length ? "is-filled" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        {errorMsg && <p className="lock-error-text" role="alert">{errorMsg}</p>}

        {/* Face ID Quick Action */}
        {config.biometricsEnabled && (
          <button
            type="button"
            className="lock-faceid-btn"
            disabled={isAuthenticatingBio}
            onClick={() => void triggerFaceId()}
          >
            <span aria-hidden="true">👤</span>
            <span>{isAuthenticatingBio ? "Doğrulanıyor..." : "Face ID ile Aç"}</span>
          </button>
        )}

        {/* Numeric Keypad */}
        <div className="lock-keypad" role="group" aria-label="Sayısal şifre tuşları">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(n => (
            <button
              key={n}
              type="button"
              className="lock-key"
              onClick={() => void handleNumberPress(n)}
            >
              <strong>{n}</strong>
            </button>
          ))}

          {/* Bottom Row */}
          {config.biometricsEnabled ? (
            <button
              type="button"
              className="lock-key lock-key-action"
              onClick={() => void triggerFaceId()}
              aria-label="Face ID ile aç"
            >
              <span className="key-action-icon">👤</span>
            </button>
          ) : (
            <div className="lock-key-spacer" />
          )}

          <button
            type="button"
            className="lock-key"
            onClick={() => void handleNumberPress("0")}
          >
            <strong>0</strong>
          </button>

          <button
            type="button"
            className="lock-key lock-key-action"
            onClick={handleDelete}
            aria-label="Sil"
          >
            <span className="key-action-icon">⌫</span>
          </button>
        </div>

        {/* Reset / Forgot PIN */}
        <div className="lock-footer">
          <button type="button" className="lock-reset-btn" onClick={handleReset}>
            Şifremi Unuttum / Kilidi Sıfırla
          </button>
        </div>
      </div>
    </div>
  );
}
