import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Puzzle from "../components/Puzzle";
import { SHAPES } from "../lib/shapes";
import { loadSolveHistory } from "../lib/puzzle-history";

const mockSubmit = jest.fn();
const mockGetSolution = jest.fn();
const mockReview = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockParams,
}));
jest.mock("../lib/db", () => ({
  submitSolution: (...args: unknown[]) => mockSubmit(...args),
  getSolutionById: (...args: unknown[]) => mockGetSolution(...args),
}));
jest.mock("../lib/native", () => ({
  isNative: () => false,
  hapticSolve: jest.fn(), hapticPlace: jest.fn(), hapticInvalid: jest.fn(),
  hideSplash: jest.fn(), openAppSettings: jest.fn(),
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
  Object.defineProperty(document, "fonts", {
    configurable: true, value: { ready: Promise.resolve() },
  });
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it.each([true, false])("restores a completed puzzle and Share without resubmitting (saved name: %s)", async (hasName) => {
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
