// Native (Capacitor) integrations. Every function is a no-op on the web.
import { InAppReview } from "@capacitor-community/in-app-review";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { NativeSettings, IOSSettings, AndroidSettings } from "capacitor-native-settings";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Which app this is running in; "web" for any browser.
export function appPlatform(): "ios" | "android" | "web" {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
}

// Ask the OS to show the in-app rating prompt. It decides whether it
// actually appears (iOS caps it at ~3 times/year per device; Google Play
// has its own quota) — treat this as a hint, never a guarantee.
export function requestAppReview(): void {
  if (!isNative()) return;
  InAppReview.requestReview().catch(() => {});
}

// Open this app's settings (for re-enabling a previously denied
// notification permission — the OS stops showing its own prompt once
// the user has declined).
export function openAppSettings(): void {
  if (appPlatform() === "android") {
    NativeSettings.openAndroid({ option: AndroidSettings.AppNotification }).catch(() => {});
  } else if (appPlatform() === "ios") {
    NativeSettings.openIOS({ option: IOSSettings.App }).catch(() => {});
  }
}

// Dismiss the launch splash (launchAutoHide is off so the splash covers
// the whole load-hydrate-paint window; see capacitor.config.ts).
export function hideSplash(): void {
  if (!isNative()) return;
  SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
}

// App-local plugin defined in ios/App/App/GameViewController.swift.
const TextInteraction = registerPlugin<{
  setEnabled(options: { enabled: boolean }): Promise<void>;
}>("TextInteraction");

// The iOS shell keeps WebKit text interaction off so rapid taps on the
// puzzle can't summon the text-selection loupe. Text fields need it back
// on (caret, selection) for as long as they are on screen.
export function setTextInteraction(enabled: boolean): void {
  if (appPlatform() !== "ios") return;
  TextInteraction.setEnabled({ enabled }).catch(() => {});
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
