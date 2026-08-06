// Daily puzzle reminder via local notifications (native only).
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./native";

const REMINDER_ID = 1;
const REMINDER_ENABLED_KEY = "CALADAY_REMINDER_ENABLED";
const REMINDER_HOUR = 9; // 9:00 AM local time

// "denied" = iOS-level permission is off; the app can't prompt again and
// the user has to enable notifications in the Settings app.
export type ReminderStatus = "on" | "off" | "denied" | "error";

export function isReminderEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(REMINDER_ENABLED_KEY) === "true";
}

// Toggle the daily reminder, reporting what actually happened.
export async function setReminderEnabled(
  enabled: boolean
): Promise<ReminderStatus> {
  if (!isNative()) return "off";

  try {
    if (!enabled) {
      await LocalNotifications.cancel({
        notifications: [{ id: REMINDER_ID }],
      }).catch(() => {});
      localStorage.setItem(REMINDER_ENABLED_KEY, "false");
      return "off";
    }

    // requestPermissions shows the system prompt if undecided, and
    // resolves with the standing answer if already decided.
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") {
      localStorage.setItem(REMINDER_ENABLED_KEY, "false");
      return "denied";
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: "Caladay",
          body: "A new calendar puzzle is waiting for you.",
          schedule: {
            on: { hour: REMINDER_HOUR, minute: 0 },
            repeats: true,
            allowWhileIdle: true,
          },
        },
      ],
    });
    localStorage.setItem(REMINDER_ENABLED_KEY, "true");
    return "on";
  } catch (err) {
    console.warn("Reminder toggle failed:", err);
    localStorage.setItem(REMINDER_ENABLED_KEY, "false");
    return "error";
  }
}
