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

const MAX_PIN_DIGITS = 12;

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
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAuthenticatingBio, setIsAuthenticatingBio] = useState(false);
  const [lockoutSec, setLockoutSec] = useState(() => getLockoutRemainingSeconds());
  const titleId = useId();

  const pinRef = useRef("");
  const verifySeqRef = useRef(0);
  const verifyingRef = useRef(false);
  const unlockedRef = useRef(false);
  const mountedRef = useRef(true);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPinSync = useCallback((next: string) => {
    pinRef.current = next;
    setPin(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (shakeTimerRef.current) {
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleSecChange = () => setConfig(loadSecurityConfig());
    window.addEventListener("ack-mobile-security-changed", handleSecChange);
    return () => window.removeEventListener("ack-mobile-security-changed", handleSecChange);
  }, []);

  useEffect(() => {
    if (lockoutSec <= 0) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      if (lockoutSec <= 1) {
        setLockoutSec(0);
        setErrorMsg("");
      } else {
        setLockoutSec(s => Math.max(0, s - 1));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [lockoutSec]);

  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const bioInFlightRef = useRef(false);
  const autoPromptedRef = useRef(false);

  const performBioAuth = useCallback(async (credentialId?: string): Promise<boolean> => {
    if (bioInFlightRef.current || unlockedRef.current || getLockoutRemainingSeconds() > 0) return false;
    bioInFlightRef.current = true;
    setIsAuthenticatingBio(true);
    setErrorMsg("");
    try {
      const ok = await authenticateBiometrics(credentialId);
      if (ok && !unlockedRef.current) {
        unlockedRef.current = true;
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
      if (mountedRef.current) {
        setIsAuthenticatingBio(false);
      }
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
    globalBiometricsPrompted = true;
    let cancelled = false;
    let promptStarted = false;

    // Prompt once on initial mount after view transition
    const timer = setTimeout(async () => {
      if (cancelled) return;
      promptStarted = true;
      await performBioAuth(cfg.biometricsCredentialId);
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (!promptStarted) {
        globalBiometricsPrompted = false;
      }
    };
  }, [performBioAuth]);

  const expectedLength =
    config.pinLength && config.pinLength >= 4 && config.pinLength <= MAX_PIN_DIGITS
      ? config.pinLength
      : null;
  const maxDigits = expectedLength ?? MAX_PIN_DIGITS;
  const busy = isVerifying || verifyingRef.current || isShaking || shakeTimerRef.current !== null;
  const isBusyNow = () =>
    isVerifying || verifyingRef.current || isShaking || shakeTimerRef.current !== null;

  const verifyAttempt = useCallback(
    async (candidate: string, triggerErrorOnMismatch: boolean): Promise<boolean> => {
      if (
        unlockedRef.current ||
        candidate.length < 4 ||
        getLockoutRemainingSeconds() > 0 ||
        (triggerErrorOnMismatch && verifyingRef.current)
      ) {
        return false;
      }

      const seq = ++verifySeqRef.current;
      if (triggerErrorOnMismatch) {
        verifyingRef.current = true;
        setIsVerifying(true);
      }

      try {
        const ok = await verifySecurityPasscode(candidate);
        if (!mountedRef.current || unlockedRef.current) return false;

        if (ok) {
          unlockedRef.current = true;
          resetFailedAttempts();
          unlockSecurity();
          onUnlockRef.current();
          return true;
        }

        if (!triggerErrorOnMismatch || seq !== verifySeqRef.current) {
          return false;
        }

        const { remainingLockout } = recordFailedAttempt();
        setIsShaking(true);
        if (remainingLockout > 0) {
          setLockoutSec(remainingLockout);
          setErrorMsg(`Çok fazla hatalı deneme. ${remainingLockout} saniye sonra tekrar deneyin.`);
        } else {
          setErrorMsg("Hatalı şifre. Tekrar deneyin.");
        }
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = setTimeout(() => {
          shakeTimerRef.current = null;
          if (!mountedRef.current) return;
          setPinSync("");
          setIsShaking(false);
        }, 500);
        return false;
      } finally {
        if (triggerErrorOnMismatch) {
          verifyingRef.current = false;
          if (mountedRef.current) {
            setIsVerifying(false);
          }
        }
      }
    },
    [setPinSync]
  );

  const handleNumberPress = (digit: string) => {
    const currentPin = pinRef.current;
    if (lockoutSec > 0 || isBusyNow() || currentPin.length >= maxDigits) return;
    const nextPin = currentPin + digit;
    verifySeqRef.current += 1;
    setPinSync(nextPin);
    setErrorMsg("");

    if (expectedLength !== null) {
      if (nextPin.length === expectedLength) {
        void verifyAttempt(nextPin, true);
      }
      return;
    }

    if (nextPin.length >= 4) {
      void verifyAttempt(nextPin, nextPin.length >= MAX_PIN_DIGITS);
    }
  };

  const handleDelete = () => {
    if (lockoutSec > 0 || isBusyNow()) return;
    verifySeqRef.current += 1;
    setPinSync(pinRef.current.slice(0, -1));
    setErrorMsg("");
  };

  const handleConfirm = () => {
    const currentPin = pinRef.current;
    if (currentPin.length < 4 || isBusyNow() || lockoutSec > 0 || getLockoutRemainingSeconds() > 0) return;
    void verifyAttempt(currentPin, true);
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

  const dotCount = expectedLength ?? Math.max(4, Math.min(MAX_PIN_DIGITS, pin.length));
  const dots = Array.from({ length: dotCount });

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
        <div
          className={`lock-dots-display ${dotCount > 6 ? "is-compact" : ""} ${isShaking ? "is-shaking" : ""}`.trim()}
          aria-label={`Girilen basamak: ${pin.length}${expectedLength ? ` / ${expectedLength}` : ""}`}
        >
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

        {/* Explicit PIN Confirm */}
        <button
          type="button"
          className="lock-confirm-btn"
          disabled={pin.length < 4 || busy || lockoutSec > 0}
          onClick={handleConfirm}
        >
          <span aria-hidden="true">✓</span>
          <span>{isVerifying ? "PIN doğrulanıyor..." : "Onayla"}</span>
        </button>

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
