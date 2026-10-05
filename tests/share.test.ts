import { copySolve, shareSolve } from "../lib/share";

let mockPlatform: "ios" | "android" | "web" = "web";
const mockNativeWrite = jest.fn();
const mockNativeShare = jest.fn();
const mockBrowserWrite = jest.fn();
const mockBrowserShare = jest.fn();

jest.mock("../lib/native", () => ({
  isNative: () => mockPlatform !== "web",
  appPlatform: () => mockPlatform,
}));
jest.mock("@capacitor/clipboard", () => ({
  Clipboard: { write: (...args: unknown[]) => mockNativeWrite(...args) },
}));
jest.mock("@capacitor/share", () => ({
  Share: { share: (...args: unknown[]) => mockNativeShare(...args) },
}));

beforeEach(() => {
  jest.resetAllMocks();
  mockPlatform = "web";
  mockNativeWrite.mockResolvedValue(undefined);
  mockNativeShare.mockResolvedValue({});
  mockBrowserWrite.mockResolvedValue(undefined);
  mockBrowserShare.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: mockBrowserWrite },
  });
  Object.defineProperty(navigator, "share", {
    configurable: true, value: mockBrowserShare,
  });
});

it("copies directly on mobile web even when a share sheet is available", async () => {
  const text = "caladay 2026-09-29 — solved in 0:39\n\nCan you beat it? https://cala.day";
  expect(await copySolve("2026-09-29", 39000)).toBe("copied");
  expect(mockBrowserWrite).toHaveBeenCalledWith(text);
  expect(mockBrowserShare).not.toHaveBeenCalled();
  expect(mockNativeWrite).not.toHaveBeenCalled();
  await shareSolve("2026-09-29", 39000);
  expect(mockBrowserShare).toHaveBeenCalledWith({ text });
});

it("copies the unchanged native share message without the browser clipboard", async () => {
  mockPlatform = "ios";
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  const text = "caladay 2026-09-29 — solved in 0:39\n\nCan you beat it? https://apps.apple.com/app/id6798105948";
  expect(await copySolve("2026-09-29", 39000)).toBe("copied");
  expect(mockNativeWrite).toHaveBeenCalledWith({ string: text });
  expect(mockNativeShare).not.toHaveBeenCalled();
  await shareSolve("2026-09-29", 39000);
  expect(mockNativeShare).toHaveBeenCalledWith({ text });
});

it("links Android shares to the website until the Play listing is public", async () => {
  mockPlatform = "android";
  await shareSolve("2026-09-29", 39000);
  expect(mockNativeShare).toHaveBeenCalledWith({
    text: "caladay 2026-09-29 — solved in 0:39\n\nCan you beat it? https://cala.day",
  });
});

it.each([false, true])("reports clipboard failure without opening Share (native: %s)", async (native) => {
  mockPlatform = native ? "ios" : "web";
  (native ? mockNativeWrite : mockBrowserWrite).mockRejectedValueOnce(new Error("denied"));
  expect(await copySolve("2026-09-29", 39000)).toBe("failed");
  expect(mockBrowserShare).not.toHaveBeenCalled();
  expect(mockNativeShare).not.toHaveBeenCalled();
});

it("does not overwrite the clipboard when the native share sheet is cancelled", async () => {
  mockPlatform = "ios";
  mockNativeShare.mockRejectedValueOnce(new Error("Share canceled"));
  expect(await shareSolve("2026-09-29", 39000)).toBe("shared");
  expect(mockNativeWrite).not.toHaveBeenCalled();
  expect(mockBrowserWrite).not.toHaveBeenCalled();
});

it("uses the native clipboard if the native share sheet fails", async () => {
  mockPlatform = "ios";
  mockNativeShare.mockRejectedValueOnce(new Error("Error sharing item"));
  expect(await shareSolve("2026-09-29", 39000)).toBe("copied");
  expect(mockNativeWrite).toHaveBeenCalledTimes(1);
  expect(mockBrowserWrite).not.toHaveBeenCalled();
});
