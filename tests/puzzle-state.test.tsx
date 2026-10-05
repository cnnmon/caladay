import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Puzzle from "../components/Puzzle";
import { SHAPES } from "../lib/shapes";
import { loadSolveHistory } from "../lib/puzzle-history";

const mockSubmit = jest.fn();
const mockGetSolution = jest.fn();
const mockReview = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockParams = new URLSearchParams();
let mockNative = false;

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockParams,
}));
jest.mock("../lib/db", () => ({
  submitSolution: (...args: unknown[]) => mockSubmit(...args),
  getSolutionById: (...args: unknown[]) => mockGetSolution(...args),
}));
jest.mock("../lib/native", () => ({
  isNative: () => mockNative,
  appPlatform: () => (mockNative ? "ios" : "web"),
  hapticSolve: jest.fn(), hapticPlace: jest.fn(), hapticInvalid: jest.fn(),
  hideSplash: jest.fn(), openAppSettings: jest.fn(), setTextInteraction: jest.fn(),
  requestAppReview: () => mockReview(),
}));
jest.mock("../lib/notifications", () => ({
  isReminderEnabled: () => false, setReminderEnabled: jest.fn(),
}));
jest.mock("../components/DifficultyBar", () => ({ __esModule: true, default: () => null }));
// Exercise component state without animation frames changing the test clock.
jest.mock("framer-motion", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const element = (tag: string) => React.forwardRef<HTMLElement, Record<string, unknown>>(
    function Motion(props, ref) {
      const domProps = Object.fromEntries(Object.entries(props).filter(([key]) =>
        !["initial", "animate", "exit", "transition", "whileHover", "whileTap"].includes(key),
      ));
      return React.createElement(tag, { ...domProps, ref });
    },
  );
  return { motion: { div: element("div"), button: element("button") }, AnimatePresence: React.Fragment };
});

const today = {
  day: "2026-07-22",
  grid: "JJJJOO#.SSJVO#LLSSVOOLPPPVVVLPPIIII.ZZZTUUZZTTTU.####TUU",
  timeElapsed: 100000,
};
const yesterday = {
  day: "2026-07-21",
  grid: "TTTSOO#.TZSSO#ITZZSOOILLZPPPILVZPP.ILVJJJJVVVJU.U####UUU",
  timeElapsed: 50000,
};
const preview = { ...yesterday, _id: "someone-else", username: "XYZ" };

function seedProgress(complete = true) {
  const shapes = SHAPES.map((shape) => {
    const positions: [number, number][] = [];
    [...today.grid].forEach((id, index) => {
      if (id === shape.id) positions.push([Math.floor(index / 7), index % 7]);
    });
    const gridRow = Math.min(...positions.map(([r]) => r));
    const gridCol = Math.min(...positions.map(([, c]) => c));
    return {
      id: shape.id, gridRow, gridCol,
      cells: positions.map(([r, c]) => [r - gridRow, c - gridCol]),
    };
  });
  localStorage.setItem("caesar-progress-v2", JSON.stringify({
    dateKey: today.day, version: "v2",
    placedShapes: complete ? shapes : shapes.slice(0, 1),
    shapeRotations: Object.fromEntries(shapes.map((shape) => [shape.id, shape.cells])),
    elapsedTime: today.timeElapsed / 1000,
  }));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 6, 22, 12));
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("CALADAY_SEEN_HELP", "true");
  localStorage.setItem("CALADAY_USERNAME", "ALU");
  mockSubmit.mockResolvedValue("id");
  mockGetSolution.mockResolvedValue(preview);
  mockParams = new URLSearchParams();
  mockNative = false;
  Object.defineProperty(document, "fonts", {
    configurable: true, value: { ready: Promise.resolve() },
  });
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it.each([
  { hasName: true, native: false },
  { hasName: false, native: false },
  { hasName: true, native: true },
])("restores a completed puzzle with Copy and Share without resubmitting (saved name: $hasName, native: $native)", async ({ hasName, native }) => {
  mockNative = native;
  if (!hasName) localStorage.removeItem("CALADAY_USERNAME");
  seedProgress();
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByText("🎉 Congratulations!")).toBeInTheDocument();
  expect(loadSolveHistory()[today.day]).toMatchObject(today);
  expect(localStorage.getItem("caesar-progress-v2")).toBeNull();
  expect(mockSubmit).toHaveBeenCalledTimes(hasName ? 1 : 0);

  cleanup();
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByText("🎉 Congratulations!")).toBeInTheDocument();
  expect(screen.getByTitle("Share your solve")).toBeInTheDocument();
  expect(screen.getByTitle("Copy your solve")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("1:40");
  expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  expect(mockSubmit).toHaveBeenCalledTimes(hasName ? 1 : 0);
});

it("keeps an unfinished replay ahead of the saved solve when reopening", async () => {
  localStorage.setItem("caesar-puzzle-history", JSON.stringify({ [today.day]: today }));
  seedProgress(false);
  const progress = JSON.parse(localStorage.getItem("caesar-progress-v2")!);
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  expect(screen.queryByText("🎉 Congratulations!")).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("caesar-progress-v2")!)).toEqual(progress);
  expect(mockSubmit).not.toHaveBeenCalled();
});

it("lets a saved solve be submitted after skipping or failing without replaying the puzzle", async () => {
  localStorage.setItem("caesar-puzzle-history", JSON.stringify({ [today.day]: today }));
  await act(async () => { render(<Puzzle />); });
  expect(mockSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTitle("Submit to leaderboard"));
  await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Submit", exact: true })); });
  expect(mockSubmit).toHaveBeenCalledWith({ ...today, startedAt: undefined, username: "ALU", platform: "web" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("does not offer to resubmit a saved solve that is already on the leaderboard", async () => {
  localStorage.setItem("caesar-puzzle-history", JSON.stringify({ [today.day]: today }));
  localStorage.setItem("CALADAY_SUBMISSIONS", JSON.stringify([{ id: "saved-id", grid: today.grid }]));
  await act(async () => { render(<Puzzle />); });
  expect(screen.queryByTitle("Submit to leaderboard")).not.toBeInTheDocument();
  expect(mockSubmit).not.toHaveBeenCalled();
});

it("counts persisted distinct days toward the review prompt", async () => {
  const earlier = {
    day: "2026-07-20",
    grid: "UUOOPP#.ULOPP#UULOOPTZZLLTTTJZZZS.TJJJJSSVIIII.SV####VVV",
  };
  localStorage.setItem("caesar-puzzle-history", JSON.stringify({
    [earlier.day]: earlier, [yesterday.day]: yesterday,
  }));
  seedProgress();
  await act(async () => { render(<Puzzle />); });
  await act(async () => { jest.advanceTimersByTime(2500); });
  expect(mockReview).toHaveBeenCalledTimes(1);
  expect(Object.keys(loadSolveHistory())).toHaveLength(3);
});

it("preserves today's progress and hides Reset while previewing another solve", async () => {
  seedProgress(false);
  const progress = JSON.parse(localStorage.getItem("caesar-progress-v2")!);
  mockParams = new URLSearchParams("solution=someone-else");
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByText("XYZ's solution")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("caesar-progress-v2")!)).toEqual(progress);

  cleanup();
  mockParams = new URLSearchParams();
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("caesar-progress-v2")!)).toEqual(progress);
});

it.each([false, true])("clears preview state at midnight (late preview response: %s)", async (late) => {
  jest.setSystemTime(new Date(2026, 6, 22, 23, 59, 30));
  let finish!: (value: typeof preview) => void;
  if (late) mockGetSolution.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  mockParams = new URLSearchParams("solution=someone-else");
  await act(async () => { render(<Puzzle />); });
  if (!late) expect(screen.getByText("XYZ's solution")).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(60000); });
  if (late) await act(async () => { finish(preview); });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Jul 23, Thu");
  expect(screen.queryByText("XYZ's solution")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
});

it("ignores malformed history without blocking a new puzzle", async () => {
  localStorage.setItem("caesar-puzzle-history", JSON.stringify({
    [today.day]: { ...today, grid: "invalid" }, [yesterday.day]: yesterday,
  }));
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  expect(loadSolveHistory()).toEqual({ [yesterday.day]: yesterday });
});

it("keeps the puzzle playable when browser storage cannot be read or written", async () => {
  for (const method of ["getItem", "setItem", "removeItem"] as const) {
    jest.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("Storage unavailable"); });
  }
  await act(async () => { render(<Puzzle />); });
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("0:02");
});

it("still submits a solve when storage writes fail on the review-prompt path", async () => {
  const earlier = { day: "2026-07-20", grid: "UUOOPP#.ULOPP#UULOOPTZZLLTTTJZZZS.TJJJJSSVIIII.SV####VVV" };
  localStorage.setItem("caesar-puzzle-history", JSON.stringify({ [earlier.day]: earlier, [yesterday.day]: yesterday }));
  seedProgress();
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByText("🎉 Congratulations!")).toBeInTheDocument();
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

it.each([false, true])("shows the mobile app link only on web in initial and reopened Help (native: %s)", async (native) => {
  mockNative = native;
  localStorage.removeItem("CALADAY_SEEN_HELP");
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByRole("dialog", { name: "How to Play" })).toBeInTheDocument();
  expect(screen.queryAllByText(/We also have a mobile app!/)).toHaveLength(native ? 0 : 1);
  if (!native) {
    expect(screen.getByRole("link", { name: "Download" }))
      .toHaveAttribute("href", "https://apps.apple.com/app/id6798105948");
  }

  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  fireEvent.click(screen.getByRole("button", { name: "Help", exact: true }));
  expect(screen.queryAllByText(/We also have a mobile app!/)).toHaveLength(native ? 0 : 1);
  expect(screen.queryAllByRole("link", { name: "Download" })).toHaveLength(native ? 0 : 1);
});

it("offers no app to Android visitors on the website before the Play listing is public", async () => {
  jest.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 16; Pixel 8) Chrome/141.0.0.0 Mobile");
  localStorage.removeItem("CALADAY_SEEN_HELP");
  await act(async () => { render(<Puzzle />); });
  expect(screen.getByRole("dialog", { name: "How to Play" })).toBeInTheDocument();
  expect(screen.queryByText(/We also have a mobile app!/)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
});
