import { isNative } from "./native";

export type Platform = "native" | "standalone" | "browser";

// Where the app is running: the Capacitor iOS app, an installed home-screen
// web app, or a plain browser tab. SSR-safe — returns "browser" during
// prerender, so call it from effects/handlers (like the existing
// setNativeUI-after-mount pattern) to avoid hydration mismatches.
export function getPlatform(): Platform {
  if (isNative()) return "native";
  if (typeof window === "undefined") return "browser";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "standalone" : "browser";
}

// iPhone/iPad Safari (including iPadOS masquerading as macOS).
export function isIOSBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Chromium fires beforeinstallprompt when the app is installable; iOS never
// does. Capture it so the Settings "Install app" row can trigger a real
// install prompt on Android/desktop Chrome.
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let deferredInstallPrompt: InstallPromptEvent | null = null;

export function watchInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as InstallPromptEvent;
  });
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return deferredInstallPrompt;
}

export function clearInstallPrompt(): void {
  deferredInstallPrompt = null;
}
