// Native (Capacitor) integrations. Every function is a no-op on the web
// so the Vercel deployment behaves exactly as before.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { NativeSettings, IOSSettings } from "capacitor-native-settings";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Open this app's page in the iOS Settings app (for re-enabling a
// previously denied notification permission — iOS only shows its own
// permission prompt once per install).
export function openAppSettings(): void {
  if (!isNative()) return;
  NativeSettings.openIOS({ option: IOSSettings.App }).catch(() => {});
}

// Dismiss the launch splash (launchAutoHide is off so the splash covers
// the whole load-hydrate-paint window; see capacitor.config.ts).
export function hideSplash(): void {
  if (!isNative()) return;
  SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
}

// Light tap when a piece snaps onto the board
export function hapticPlace(): void {
  if (!isNative()) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

// Error buzz when a placement is invalid
export function hapticInvalid(): void {
  if (!isNative()) return;
  Haptics.notification({ type: NotificationType.Error }).catch(() => {});
}

// Success pattern when the puzzle is solved
export function hapticSolve(): void {
  if (!isNative()) return;
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}
