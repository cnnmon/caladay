import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import LeaderboardPage from "../app/leaderboard/page";
import { submitSolution } from "../lib/db";
import { acknowledgeSubmissions, getSubmissionSnapshot } from "../lib/submissions";

const mockInvoke = jest.fn();
const mockOrder = jest.fn();
const mockInsert = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockSearchParams = new URLSearchParams();

jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    functions: { invoke: mockInvoke },
    from: () => ({ select: () => ({ order: mockOrder }), insert: mockInsert }),
  }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const solution = {
  username: "ALU",
  grid: "test-grid",
  day: "2026-09-29",
  startedAt: "2026-09-29T12:00:00.000Z",
  timeElapsed: 60000,
  platform: "web",
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  jest.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  acknowledgeSubmissions(getSubmissionSnapshot().solutions.map((row) => row._id));
  jest.useRealTimers();
});

it.each(["read first", "submit first"])(
  "shows a slow submission immediately and keeps it owned when %s finishes",
  async (order) => {
    const request = deferred<{ data: { id: string }; error: null }>();
    const read = deferred<{ data: object[]; error: null }>();
    mockInvoke.mockReturnValueOnce(request.promise);
    mockOrder.mockReturnValueOnce(read.promise);
    const submit = submitSolution(solution);
    render(<LeaderboardPage />);

    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Saving your solution"));
    expect(mockRouter.push).not.toHaveBeenCalled();
    // Exceed both the old 3s submission wait and the 4s read timeout.
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(screen.getByText("(you)")).toBeInTheDocument();

    const finishRead = async () => {
      await act(async () => { read.resolve({ data: [], error: null }); });
    };
    const id = `saved-${order}`;
    const finishSubmit = async () => {
      await act(async () => {
        request.resolve({ data: { id }, error: null });
        await submit;
      });
    };
    if (order === "read first") {
      await finishRead();
      expect(screen.getByText("Saving…")).toBeInTheDocument();
      await finishSubmit();
    } else {
      await finishSubmit();
      await finishRead();
    }
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    expect(screen.getAllByText("(you)")).toHaveLength(1);
    fireEvent.click(screen.getByTitle("Click to preview solution"));
    expect(mockRouter.push).toHaveBeenCalledWith(`/?solution=${id}`);
  },
);

it("keeps one owned row when the read sees the insert before the submit response", async () => {
  const request = deferred<{ data: { id: string }; error: null }>();
  mockInvoke.mockReturnValueOnce(request.promise);
  mockOrder.mockResolvedValueOnce({
    data: [{
      id: "visible-id", username: solution.username, grid: solution.grid, day: solution.day,
      started_at: "2026-09-29T12:00:00+00:00", time_elapsed: solution.timeElapsed, platform: "web",
    }],
    error: null,
  });
  const submit = submitSolution(solution);
  await act(async () => { render(<LeaderboardPage />); });
  expect(screen.getAllByText("ALU")).toHaveLength(1);
  expect(screen.getAllByText("(you)")).toHaveLength(1);
  await act(async () => {
    request.resolve({ data: { id: "visible-id" }, error: null });
    await submit;
  });
  expect(screen.getAllByText("ALU")).toHaveLength(1);
  expect(screen.getAllByText("(you)")).toHaveLength(1);
  expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
});

it("removes a rejected optimistic row and explains the failure", async () => {
  const request = deferred<{ data: null; error: object }>();
  mockInvoke.mockReturnValueOnce(request.promise);
  mockOrder.mockResolvedValueOnce({ data: [], error: null });
  const submit = submitSolution(solution).catch(() => undefined);
  await act(async () => { render(<LeaderboardPage />); });
  expect(screen.getByText("(you)")).toBeInTheDocument();
  await act(async () => {
    request.resolve({ data: null, error: new Error("Offline") });
    await submit;
  });
  expect(screen.queryByText("ALU")).not.toBeInTheDocument();
  expect(screen.queryByText("(you)")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Your solution wasn't saved to the leaderboard");
});

it.each([true, false])("updates the you label after a solve in another tab (page open: %s)", async (mounted) => {
  const id = mounted ? "other-tab-open" : "other-tab-closed";
  mockOrder.mockResolvedValue({
    data: [{ id, username: "XYZ", grid: solution.grid, day: solution.day,
      started_at: solution.startedAt, time_elapsed: 10000, platform: "web" }],
    error: null,
  });
  await act(async () => { render(<LeaderboardPage />); });
  expect(screen.queryByText("(you)")).not.toBeInTheDocument();
  if (!mounted) cleanup();
  await act(async () => {
    localStorage.setItem("CALADAY_SUBMISSIONS", JSON.stringify([{ id, grid: solution.grid }]));
    window.dispatchEvent(new StorageEvent("storage", { key: "CALADAY_SUBMISSIONS" }));
  });
  if (!mounted) await act(async () => { render(<LeaderboardPage />); });
  expect(screen.getByText("(you)")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle("Click to preview solution"));
  expect(mockRouter.push).toHaveBeenCalledWith(`/?solution=${id}`);
});

it("keeps failed reports retryable and persists the marker only after success", async () => {
  const request = deferred<{ error: { message: string } }>();
  mockInsert.mockReturnValueOnce(request.promise).mockResolvedValueOnce({ error: null });
  mockOrder.mockResolvedValue({
    data: [{ id: "report-id", username: "XYZ", grid: solution.grid, day: solution.day,
      started_at: solution.startedAt, time_elapsed: 10000, platform: "web" }],
    error: null,
  });
  await act(async () => { render(<LeaderboardPage />); });
  fireEvent.click(screen.getByTitle("Report inappropriate name"));
  fireEvent.click(screen.getByTitle("Report inappropriate name"));
  expect(screen.getByTitle("Report inappropriate name")).toBeDisabled();
  expect(screen.getByText("Sending…")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle("Report inappropriate name"));
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("CALADAY_REPORTED")).toBeNull();
  await act(async () => { request.resolve({ error: { message: "Offline" } }); });
  expect(screen.getByText("Couldn't send your report. Please try again.")).toBeInTheDocument();
  expect(screen.queryByTitle("Reported")).not.toBeInTheDocument();
  expect(localStorage.getItem("CALADAY_REPORTED")).toBeNull();

  cleanup();
  await act(async () => { render(<LeaderboardPage />); });
  fireEvent.click(screen.getByTitle("Report inappropriate name"));
  await act(async () => { fireEvent.click(screen.getByTitle("Report inappropriate name")); });
  expect(screen.getByTitle("Reported")).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("CALADAY_REPORTED")!)).toEqual(["report-id"]);
  cleanup();
  await act(async () => { render(<LeaderboardPage />); });
  expect(screen.getByTitle("Reported")).toBeInTheDocument();
  expect(screen.queryByTitle("Report inappropriate name")).not.toBeInTheDocument();
  expect(mockInsert).toHaveBeenCalledTimes(2);
});
