"use client";

import { useEffect } from "react";
import { isNative } from "../lib/native";
import { watchInstallPrompt } from "../lib/platform";

// Registers the offline service worker on the production web build.
// Skipped in dev (caching fights the dev server) and in the Capacitor app
// (capacitor://localhost serves assets from disk already).
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Capture Chromium's beforeinstallprompt (fires shortly after load) so
    // Settings → "Install app" can trigger a real prompt. No-op on iOS.
    watchInstallPrompt();
    if (process.env.NODE_ENV !== "production") return;
    if (isNative()) return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is progressive enhancement; never surface failures.
      });
    };

    // Wait for load so registration never competes with first paint.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
