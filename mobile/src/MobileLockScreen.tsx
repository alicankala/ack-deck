import { useState, useEffect, useCallback, useId, useRef } from "react";
import { emptyState, saveState } from "./store";
import {
  loadSecurityConfig,
  isSecurityLocked,
  verifySecurityPasscode,
  authenticateBiometrics,
  unlockSecurity,
  disableSecurity,
  getLockoutRemainingSeconds,
  recordFailedAttempt,
  resetFailedAttempts,
  type MobileSecurityConfig,
} from "./mobileSecurity";

let globalBiometricsPrompted = false;

if (typeof window !== "undefined") {
  window.addEventListener("ack-mobile-lock-state-changed", () => {
    if (isSecurityLocked()) {
      globalBiometricsPrompted = false;
    }
  });
}

export function MobileLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [config, setConfig] = useState<MobileSecurityConfig>(loadSecurityConfig);
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isAuthenticatingBio, setIsAuthenticatingBio] = useState(false);
  const [lockoutSec, setLockoutSec] = useState(() => getLockoutRemainingSeconds());
  const titleId = useId();

  useEffect(() => {
    const handleSecChange = () => setConfig(loadSecurityConfig());
    window.addEventListener("ack-mobile-security-changed", handleSecChange);
    return () => window.removeEventListener("ack-mobile-security-changed", handleSecChange);
  }, []);

  useEffect(() => {
    if (lockoutSec <= 0) return;
    const timer = setInterval(() => {
      setLockoutSec(s => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSec]);

  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const bioInFlightRef = useRef(false);
  const autoPromptedRef = useRef(false);

  const performBioAuth = useCallback(async (credentialId?: string): Promise<boolean> => {
    if (bioInFlightRef.current || getLockoutRemainingSeconds() > 0) return false;
    bioInFlightRef.current = true;
    setIsAuthenticatingBio(true);
    setErrorMsg("");
    try {
      const ok = await authenticateBiometrics(credentialId);
      if (ok) {
        resetFailedAttempts();
        unlockSecurity();
        onUnlockRef.current();
        return true;
      }
      return false;
    } catch (e) {
      console.warn("Face ID failed:", e);
      return false;
    } finally {
      bioInFlightRef.current = false;
      setIsAuthenticatingBio(false);
    }
  }, []);

  const triggerFaceId = useCallback(() => {
    if (!config.biometricsEnabled || lockoutSec > 0) return;
    void performBioAuth(config.biometricsCredentialId);
  }, [config.biometricsEnabled, config.biometricsCredentialId, lockoutSec, performBioAuth]);

  // Attempt Face ID automatically once on mount if biometrics is enabled (strictly once, no double-prompting)
  useEffect(() => {
    if (autoPromptedRef.current || globalBiometricsPrompted) return;
    const cfg = loadSecurityConfig();
    if (!cfg.enabled || !cfg.biometricsEnabled || getLockoutRemainingSeconds() > 0) return;

    autoPromptedRef.current = true;
    let cancelled = false;

    // Prompt once on initial mount after view transition
    const timer = setTimeout(async () => {
      if (cancelled) return;
      await performBioAuth(cfg.biometricsCredentialId);
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [performBioAuth]);

  const handleNumberPress = async (digit: string) => {
    if (lockoutSec > 0 || pin.length >= 8) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg("");

    // If it reaches standard PIN length (4 or 6), try verifying
    if (nextPin.length >= 4) {
      const ok = await verifySecurityPasscode(nextPin);
      if (ok) {
        resetFailedAttempts();
        unlockSecurity();
        onUnlock();
        return;
      }
      // If it reached max 6 digits and still not valid
      if (nextPin.length >= 6) {
        const { remainingLockout } = recordFailedAttempt();
        setIsShaking(true);
        if (remainingLockout > 0) {
          setLockoutSec(remainingLockout);
          setErrorMsg(`Çok fazla hatalı deneme. ${remainingLockout} saniye sonra tekrar deneyin.`);
        } else {
          setErrorMsg("Hatalı şifre. Tekrar deneyin.");
        }
        setTimeout(() => {
          setPin("");
          setIsShaking(false);
        }, 500);
      }
    }
  };

  const handleDelete = () => {
    if (lockoutSec > 0) return;
    setPin(p => p.slice(0, -1));
    setErrorMsg("");
  };

  const handleReset = async () => {
    if (
      confirm(
        "Şifrenizi unuttuysanız kilidi kaldırmak için cihaz eşleşmesi sonlandırılacak ve yerel veriler temizlenecektir. Bilgisayarınızdan yeniden eşleştirmeniz gerekecektir.\n\nOnaylıyor musunuz?"
      )
    ) {
      disableSecurity();
      resetFailedAttempts();
      try {
        await saveState(emptyState());
      } catch {}
      window.location.reload();
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
            {lockoutSec > 0
              ? `Kilit geçici olarak devre dışı (${lockoutSec} sn)`
              : config.biometricsEnabled
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

        {(errorMsg || lockoutSec > 0) && (
          <p className="lock-error-text" role="alert">
            {lockoutSec > 0 ? `Çok fazla hatalı deneme. ${lockoutSec} saniye bekleyin.` : errorMsg}
          </p>
        )}

        {/* Face ID Quick Action */}
        {config.biometricsEnabled && (
          <button
            type="button"
            className="lock-faceid-btn"
            disabled={isAuthenticatingBio || lockoutSec > 0}
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
              disabled={lockoutSec > 0}
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
              disabled={lockoutSec > 0}
              onClick={() => void triggerFaceId()}
              aria-label="Face ID ile aç"
              title="Face ID ile Aç"
            >
              <span className="key-action-icon">👤</span>
            </button>
          ) : (
            <div className="lock-key-spacer" />
          )}

          <button
            type="button"
            className="lock-key"
            disabled={lockoutSec > 0}
            onClick={() => void handleNumberPress("0")}
          >
            <strong>0</strong>
          </button>

          <button
            type="button"
            className="lock-key lock-key-action"
            disabled={lockoutSec > 0}
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
