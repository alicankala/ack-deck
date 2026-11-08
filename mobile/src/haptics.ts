/**
 * Lightweight native haptics utility for ACKDeck Mobile (iOS & Android PWA).
 * Provides tactile feedback for taps, completions, and selections.
 */

// Safe vibration trigger (works on Android PWA and supported iOS WebKit versions)
function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported environments
  }
}

/**
 * Light tap feedback - for tab switches, filter toggles, subtle button presses.
 */
export function hapticLight(): void {
  vibrate(10);
}

/**
 * Medium feedback - for modal opens, major button clicks.
 */
export function hapticMedium(): void {
  vibrate(18);
}

/**
 * Success feedback - satisfying double-tap for completing a task, checking a prayer, or saving.
 */
export function hapticSuccess(): void {
  vibrate([15, 40, 20]);
}

/**
 * Warning / Delete feedback - for deletions or destructive confirmations.
 */
export function hapticWarning(): void {
  vibrate([25, 50, 35]);
}
