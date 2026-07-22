// Native (Capacitor) integrations. Every function is a no-op on the web
// so the Vercel deployment behaves exactly as before.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
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
