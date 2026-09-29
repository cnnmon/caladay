import { isReminderEnabled, setReminderEnabled } from "../lib/notifications";

const mockCancel = jest.fn();
const mockSchedule = jest.fn();
const mockPermission = jest.fn();
jest.mock("../lib/native", () => ({ isNative: () => true }));
jest.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    cancel: (...args: unknown[]) => mockCancel(...args),
    schedule: (...args: unknown[]) => mockSchedule(...args),
    requestPermissions: () => mockPermission(),
  },
}));
beforeEach(() => {
  jest.resetAllMocks();
  localStorage.clear();
  mockPermission.mockResolvedValue({ display: "granted" });
  mockSchedule.mockResolvedValue(undefined);
  mockCancel.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

it("does not claim reminders are off when native cancellation failed", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  localStorage.setItem("CALADAY_REMINDER_ENABLED", "true");
  mockCancel.mockRejectedValueOnce(new Error("Native failure"));
  expect(await setReminderEnabled(false)).toBe("error");
  expect(isReminderEnabled()).toBe(true);
  expect(await setReminderEnabled(false)).toBe("off");
  expect(isReminderEnabled()).toBe(false);
});

it("keeps native scheduling usable when storage is unavailable", async () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage disabled"); });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled"); });
  expect(isReminderEnabled()).toBe(false);
  expect(await setReminderEnabled(true)).toBe("on");
  expect(await setReminderEnabled(false)).toBe("off");
  mockSchedule.mockRejectedValueOnce(new Error("Native failure"));
  jest.spyOn(console, "warn").mockImplementation(() => {});
  expect(await setReminderEnabled(true)).toBe("error");
});
