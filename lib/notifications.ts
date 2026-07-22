// Daily puzzle reminder via local notifications (native only).
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./native";

const REMINDER_ID = 1;
const REMINDER_ENABLED_KEY = "CALADAY_REMINDER_ENABLED";
const REMINDER_HOUR = 9; // 9:00 AM local time

export function isReminderEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(REMINDER_ENABLED_KEY) === "true";
}

// Toggle the daily reminder. Returns the new enabled state
// (false if the user denied the notification permission).
export async function setReminderEnabled(enabled: boolean): Promise<boolean> {
  if (!isNative()) return false;

  if (!enabled) {
    await LocalNotifications.cancel({
      notifications: [{ id: REMINDER_ID }],
    }).catch(() => {});
    localStorage.setItem(REMINDER_ENABLED_KEY, "false");
    return false;
  }

  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") {
    localStorage.setItem(REMINDER_ENABLED_KEY, "false");
    return false;
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: "Caladay",
        body: "A new calendar puzzle is waiting for you.",
        schedule: {
          on: { hour: REMINDER_HOUR, minute: 0 },
          allowWhileIdle: true,
        },
      },
    ],
  });
  localStorage.setItem(REMINDER_ENABLED_KEY, "true");
  return true;
}
