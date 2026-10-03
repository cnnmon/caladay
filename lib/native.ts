// Native (Capacitor) integrations. Every function is a no-op on the web.
import { InAppReview } from "@capacitor-community/in-app-review";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { NativeSettings, IOSSettings } from "capacitor-native-settings";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Ask iOS to show the in-app rating prompt. The OS decides whether it
// actually appears (capped at ~3 times/year per device) — treat this as
// a hint, never a guarantee.
export function requestAppReview(): void {
  if (!isNative()) return;
  InAppReview.requestReview().catch(() => {});
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

// App-local plugin defined in ios/App/App/GameViewController.swift.
const TextInteraction = registerPlugin<{
  setEnabled(options: { enabled: boolean }): Promise<void>;
}>("TextInteraction");

// The iOS shell keeps WebKit text interaction off so rapid taps on the
// puzzle can't summon the text-selection loupe. Text fields need it back
// on (caret, selection) for as long as they are on screen.
export function setTextInteraction(enabled: boolean): void {
  if (!isNative()) return;
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
