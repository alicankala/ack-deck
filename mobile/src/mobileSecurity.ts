export interface MobileSecurityConfig {
  enabled: boolean;
  salt: string;
  passcodeHash: string;
  biometricsEnabled: boolean;
  biometricsCredentialId?: string;
  autoLockTimeoutSeconds: number; // 0 = immediately, 60 = 1 min, 300 = 5 min
}

const STORAGE_KEY = "ack-deck.mobile-security.v1";
const SESSION_UNLOCKED_KEY = "ack-deck.mobile-unlocked.session";
const LAST_ACTIVE_KEY = "ack-deck.mobile-last-active.session";

export function loadSecurityConfig(): MobileSecurityConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        enabled: false,
        salt: "",
        passcodeHash: "",
        biometricsEnabled: false,
        autoLockTimeoutSeconds: 0,
      };
    }
    const parsed = JSON.parse(raw) as Partial<MobileSecurityConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      salt: String(parsed.salt || ""),
      passcodeHash: String(parsed.passcodeHash || ""),
      biometricsEnabled: Boolean(parsed.biometricsEnabled),
      biometricsCredentialId: parsed.biometricsCredentialId,
      autoLockTimeoutSeconds: Number.isFinite(parsed.autoLockTimeoutSeconds)
        ? Number(parsed.autoLockTimeoutSeconds)
        : 0,
    };
  } catch {
    return {
      enabled: false,
      salt: "",
      passcodeHash: "",
      biometricsEnabled: false,
      autoLockTimeoutSeconds: 0,
    };
  }
}

export function saveSecurityConfig(cfg: MobileSecurityConfig): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent("ack-mobile-security-changed", { detail: cfg }));
}

function bufferToBase64(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) {
    bin += String.fromCharCode(buf[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBuffer(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const bin = atob(normalized + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

export async function hashPasscode(passcode: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${passcode}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function isBiometricsAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

export async function registerBiometrics(): Promise<string> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error("Bu cihazda Face ID / Biyometri desteği bulunmuyor.");
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "ACKDeck", id: window.location.hostname },
      user: {
        id: userId,
        name: "owner@ackdeck",
        displayName: "ACKDeck Sahibi",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!cred) {
    throw new Error("Biyometrik kayıt oluşturulamadı veya iptal edildi.");
  }

  return bufferToBase64(new Uint8Array(cred.rawId));
}

export async function authenticateBiometrics(credentialId?: string): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const allowCredentials: PublicKeyCredentialDescriptor[] = credentialId
    ? [
        {
          id: base64ToBuffer(credentialId).buffer as ArrayBuffer,
          type: "public-key",
          transports: ["internal"],
        },
      ]
    : [];

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        userVerification: "required",
        allowCredentials: allowCredentials.length ? allowCredentials : undefined,
        timeout: 60000,
      },
    });
    return Boolean(assertion);
  } catch (err) {
    console.warn("[ACKDeck Biometrics Auth]", err);
    return false;
  }
}

export async function setSecurityPasscode(
  passcode: string,
  enableBiometrics = false
): Promise<MobileSecurityConfig> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bufferToBase64(saltBytes);
  const passcodeHash = await hashPasscode(passcode, salt);

  let biometricsCredentialId: string | undefined = undefined;
  if (enableBiometrics) {
    try {
      biometricsCredentialId = await registerBiometrics();
    } catch (e) {
      console.warn("Face ID kaydı başarısız oldu, şifre ile devam ediliyor:", e);
    }
  }

  const existing = loadSecurityConfig();
  const nextConfig: MobileSecurityConfig = {
    enabled: true,
    salt,
    passcodeHash,
    biometricsEnabled: Boolean(biometricsCredentialId),
    biometricsCredentialId,
    autoLockTimeoutSeconds: existing.autoLockTimeoutSeconds,
  };

  saveSecurityConfig(nextConfig);
  unlockSecurity();
  return nextConfig;
}

export async function verifySecurityPasscode(passcode: string): Promise<boolean> {
  const cfg = loadSecurityConfig();
  if (!cfg.enabled) return true;
  const computedHash = await hashPasscode(passcode, cfg.salt);
  return computedHash === cfg.passcodeHash;
}

export function disableSecurity(): void {
  saveSecurityConfig({
    enabled: false,
    salt: "",
    passcodeHash: "",
    biometricsEnabled: false,
    autoLockTimeoutSeconds: 0,
  });
  unlockSecurity();
}

export function isSecurityLocked(): boolean {
  const cfg = loadSecurityConfig();
  if (!cfg.enabled) return false;
  const unlocked = window.sessionStorage.getItem(SESSION_UNLOCKED_KEY);
  if (unlocked !== "true") return true;

  // Check timeout
  const lastActiveStr = window.sessionStorage.getItem(LAST_ACTIVE_KEY);
  if (lastActiveStr && cfg.autoLockTimeoutSeconds > 0) {
    const lastActive = Number(lastActiveStr);
    if (Date.now() - lastActive > cfg.autoLockTimeoutSeconds * 1000) {
      lockSecurity();
      return true;
    }
  }
  return false;
}

export function unlockSecurity(): void {
  window.sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
  window.sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  window.dispatchEvent(new Event("ack-mobile-lock-state-changed"));
}

export function lockSecurity(): void {
  const cfg = loadSecurityConfig();
  if (!cfg.enabled) return;
  window.sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  window.dispatchEvent(new Event("ack-mobile-lock-state-changed"));
}

export function updateLastActive(): void {
  window.sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

export function initAutoLockListener(): () => void {
  let backgroundTimestamp = 0;

  function onVisibilityChange() {
    const cfg = loadSecurityConfig();
    if (!cfg.enabled) return;

    if (document.visibilityState === "hidden") {
      backgroundTimestamp = Date.now();
      updateLastActive();
    } else if (document.visibilityState === "visible") {
      if (backgroundTimestamp > 0) {
        const elapsed = (Date.now() - backgroundTimestamp) / 1000;
        if (cfg.autoLockTimeoutSeconds === 0 || elapsed >= cfg.autoLockTimeoutSeconds) {
          lockSecurity();
        }
      }
      backgroundTimestamp = 0;
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
