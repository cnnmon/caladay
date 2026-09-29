const mockInvoke = jest.fn();
const mockOrder = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    functions: { invoke: mockInvoke },
    from: () => ({ select: () => ({ order: mockOrder }) }),
  }),
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

let db: typeof import("../lib/db");
let submissions: typeof import("../lib/submissions");

beforeEach(async () => {
  jest.resetModules();
  jest.resetAllMocks();
  localStorage.clear();
  db = await import("../lib/db");
  submissions = await import("../lib/submissions");
});

afterEach(() => jest.restoreAllMocks());

it("refreshes ownership from other tabs and after a period with no subscribers", () => {
  expect(submissions.getSubmissionSnapshot().solutionIds).toEqual([]);
  const changed = jest.fn();
  const unsubscribe = submissions.subscribeSubmissions(changed);
  localStorage.setItem("CALADAY_SUBMISSIONS", JSON.stringify([{ id: "first-tab-id", grid: solution.grid }]));
  window.dispatchEvent(new StorageEvent("storage", { key: "CALADAY_SUBMISSIONS" }));
  expect(submissions.getSubmissionSnapshot().solutionIds).toEqual(["first-tab-id"]);
  expect(changed).toHaveBeenCalledTimes(1);
  unsubscribe();

  localStorage.setItem("CALADAY_SUBMISSIONS", JSON.stringify([
    { id: "first-tab-id", grid: solution.grid }, { id: "second-tab-id", grid: "another-grid" },
  ]));
  const stop = submissions.subscribeSubmissions(changed);
  expect(submissions.getSubmissionSnapshot().solutionIds).toEqual(["first-tab-id", "second-tab-id"]);
  stop();
});

it("publishes immediately and saves ownership before notifying confirmation listeners", async () => {
  const request = deferred<{ data: { id: string }; error: null }>();
  mockInvoke.mockReturnValue(request.promise);
  mockOrder.mockResolvedValue({ data: [], error: null });
  const submit = db.submitSolution(solution);

  expect(submissions.getSubmissionSnapshot().solutions).toEqual([
    expect.objectContaining({ ...solution, pending: true }),
  ]);
  // Reading the leaderboard no longer waits for the submission at all.
  await expect(db.listSolutions()).resolves.toEqual([]);
  const unsubscribe = submissions.subscribeSubmissions(() => {
    const state = submissions.getSubmissionSnapshot();
    for (const row of state.solutions.filter((row) => !row.pending)) {
      expect(state.solutionIds).toContain(row._id);
      expect(JSON.parse(localStorage.getItem("CALADAY_SUBMISSIONS")!))
        .toContainEqual({ id: row._id, grid: row.grid });
    }
  });
  request.resolve({ data: { id: "saved-id" }, error: null });
  await expect(submit).resolves.toBe("saved-id");
  expect(submissions.getSubmissionSnapshot().solutions).toEqual([
    { ...solution, _id: "saved-id", pending: false },
  ]);
  unsubscribe();
});

it("keeps concurrent submissions independent when one succeeds and one fails", async () => {
  const first = deferred<{ data: { id: string }; error: null }>();
  const second = deferred<{ data: null; error: object }>();
  mockInvoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const one = db.submitSolution(solution);
  const two = db.submitSolution({ ...solution, grid: "second-grid" });
  const failed = expect(two).rejects.toThrow("That name is not allowed");
  first.resolve({ data: { id: "first-id" }, error: null });
  await one;
  expect(submissions.getSubmissionSnapshot().solutions).toHaveLength(2);
  second.resolve({
    data: null,
    error: { context: { json: async () => ({ error: "That name is not allowed" }) } },
  });
  await failed;
  expect(submissions.getSubmissionSnapshot().solutions).toEqual([
    expect.objectContaining({ _id: "first-id", pending: false }),
  ]);
  expect(submissions.getSubmissionSnapshot().error).toBe("That name is not allowed");
  expect(submissions.isGridAlreadySubmitted("second-grid")).toBe(false);
});

it("rolls back a network failure and allows a retry", async () => {
  mockInvoke.mockRejectedValueOnce(new Error("Offline"));
  await expect(db.submitSolution(solution)).rejects.toThrow("Offline");
  expect(submissions.getSubmissionSnapshot().solutions).toEqual([]);
  expect(submissions.isGridAlreadySubmitted(solution.grid)).toBe(false);
  mockInvoke.mockResolvedValueOnce({ data: { id: "retry-id" }, error: null });
  await db.submitSolution(solution);
  expect(submissions.getSubmissionSnapshot().error).toBeNull();
  expect(submissions.getSubmissionSnapshot().solutionIds).toContain("retry-id");
});

it("preserves legacy ownership and records each confirmed ID, even for the same grid", async () => {
  localStorage.setItem("CALADAY_SUBMISSIONS", JSON.stringify([
    { id: "legacy-id", grid: solution.grid },
  ]));
  expect(submissions.getSubmissionSnapshot().solutionIds).toEqual(["legacy-id"]);
  mockInvoke.mockResolvedValue({ data: { id: "new-id" }, error: null });
  await db.submitSolution(solution);
  expect(submissions.getSubmissionSnapshot().solutionIds).toEqual(
    expect.arrayContaining(["legacy-id", "new-id"]),
  );
});

it("keeps a successful solve owned when localStorage cannot be written", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
  mockInvoke.mockResolvedValue({ data: { id: "saved-id" }, error: null });
  await expect(db.submitSolution(solution)).resolves.toBe("saved-id");
  submissions.acknowledgeSubmissions(["saved-id"]);
  expect(submissions.getSubmissionSnapshot().solutionIds).toContain("saved-id");
  expect(submissions.isGridAlreadySubmitted(solution.grid)).toBe(true);
  expect(submissions.getSubmissionSnapshot().error).toBeNull();
});

it("deduplicates a server insert visible before its response, including Postgres timestamps", () => {
  const remote = [{ ...solution, _id: "server-id", startedAt: "2026-09-29T12:00:00+00:00" }];
  const local = [{ ...solution, _id: "pending:1", pending: true }];
  expect(submissions.mergeSubmissions(remote, local)).toEqual(local);
  expect(submissions.mergeSubmissions([
    { ...remote[0], startedAt: "2026-09-29T11:00:00+00:00" },
  ], local)).toHaveLength(2);
});

it("retains confirmations across stale reads, then accepts authoritative moderation", async () => {
  const confirmedBeforeRead = submissions.getSubmissionSnapshot().solutions
    .filter((row) => !row.pending).map((row) => row._id);
  mockInvoke.mockResolvedValue({ data: { id: "saved-id" }, error: null });
  await db.submitSolution(solution);
  submissions.acknowledgeSubmissions(confirmedBeforeRead);
  expect(submissions.mergeSubmissions([], submissions.getSubmissionSnapshot().solutions))
    .toHaveLength(1);
  const masked = { ...solution, _id: "saved-id", username: "???" };
  expect(submissions.mergeSubmissions([masked], submissions.getSubmissionSnapshot().solutions))
    .toEqual([masked]);
  // A subsequent fetch started after confirmation is authoritative, even
  // when moderation has hidden the row entirely.
  submissions.acknowledgeSubmissions(["saved-id"]);
  expect(submissions.mergeSubmissions([], submissions.getSubmissionSnapshot().solutions))
    .toEqual([]);
});
