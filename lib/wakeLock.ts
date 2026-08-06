// Screen Wake Lock: keep the display on while actively solving.
// Feature-detected no-op everywhere unsupported (iOS gained it in 18.4).
// The lock auto-releases when the page is hidden; callers re-acquire on
// visibilitychange while play is active.

let sentinel: WakeLockSentinel | null = null;

export async function acquireWakeLock(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  if (sentinel && !sentinel.released) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
  } catch {
    // Denied (e.g. Low Power Mode) — the timer is wall-clock, nothing breaks.
    sentinel = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  const current = sentinel;
  sentinel = null;
  if (current && !current.released) {
    try {
      await current.release();
    } catch {
      // Already released — fine.
    }
  }
}
