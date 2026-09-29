import type { SolutionRow } from "./db";

const SUBMISSIONS_KEY = "CALADAY_SUBMISSIONS";

interface SavedSubmission {
  id: string;
  grid: string;
}

export interface LocalSolution extends SolutionRow {
  pending: boolean;
}

interface SubmissionSnapshot {
  solutions: LocalSolution[];
  solutionIds: string[];
  error: string | null;
}

const EMPTY_SNAPSHOT: SubmissionSnapshot = {
  solutions: [],
  solutionIds: [],
  error: null,
};
let snapshot: SubmissionSnapshot | null = null;
let nextPendingId = 0;
const listeners = new Set<() => void>();
// Preserve ownership for this session even if localStorage is unavailable.
const savedThisSession = new Map<string, SavedSubmission>();

function getSavedSubmissions(): SavedSubmission[] {
  const saved = new Map(savedThisSession);
  try {
    const data = localStorage.getItem(SUBMISSIONS_KEY);
    const parsed: unknown = data ? JSON.parse(data) : [];
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item?.id === "string" && typeof item?.grid === "string") {
          saved.set(item.id, item);
        }
      }
    }
  } catch {
    // Storage can be unavailable or contain an older, invalid value.
  }
  return [...saved.values()];
}

export function getSubmissionSnapshot(): SubmissionSnapshot {
  if (!snapshot) {
    snapshot = {
      ...EMPTY_SNAPSHOT,
      solutionIds: getSavedSubmissions().map((submission) => submission.id),
    };
  }
  return snapshot;
}

export function getServerSubmissionSnapshot(): SubmissionSnapshot {
  return EMPTY_SNAPSHOT;
}

function refreshOwnership(): void {
  const solutionIds = getSavedSubmissions().map((submission) => submission.id);
  const previous = getSubmissionSnapshot().solutionIds;
  if (solutionIds.length !== previous.length ||
      solutionIds.some((id, index) => id !== previous[index])) {
    publish({ solutionIds });
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key === SUBMISSIONS_KEY || event.key === null) refreshOwnership();
}

export function subscribeSubmissions(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }
  // Changes may have happened in another tab while this page was unmounted.
  refreshOwnership();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

function publish(changes: Partial<SubmissionSnapshot>): void {
  snapshot = { ...getSubmissionSnapshot(), ...changes };
  listeners.forEach((listener) => listener());
}

export function beginSubmission(solution: Omit<SolutionRow, "_id">): string {
  const id = `pending:${++nextPendingId}`;
  publish({
    solutions: [
      ...getSubmissionSnapshot().solutions,
      { ...solution, _id: id, pending: true },
    ],
    error: null,
  });
  return id;
}

export function completeSubmission(pendingId: string, solutionId: string): void {
  const state = getSubmissionSnapshot();
  const solution = state.solutions.find((row) => row._id === pendingId);
  if (!solution) return;

  savedThisSession.set(solutionId, { id: solutionId, grid: solution.grid });
  const saved = getSavedSubmissions();
  try {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(saved));
  } catch {
    // A storage failure must not turn a successful server insert into a retry.
  }
  // Publish the real ID and its ownership together, before resolving the
  // submission promise. Neither depends on the puzzle/modal staying mounted.
  publish({
    solutions: state.solutions.map((row) =>
      row._id === pendingId
        ? { ...row, _id: solutionId, pending: false }
        : row,
    ),
    solutionIds: saved.map((submission) => submission.id),
  });
}

export function failSubmission(pendingId: string, error: string): void {
  publish({
    solutions: getSubmissionSnapshot().solutions.filter(
      (row) => row._id !== pendingId,
    ),
    error,
  });
}

// Only retire confirmations that predate a fetch. An older response must
// never erase a solve that was confirmed while the fetch was in flight.
export function acknowledgeSubmissions(ids: string[]): void {
  const state = getSubmissionSnapshot();
  const solutions = state.solutions.filter(
    (row) => row.pending || !ids.includes(row._id),
  );
  if (solutions.length !== state.solutions.length) publish({ solutions });
}

export function isGridAlreadySubmitted(grid: string): boolean {
  return (
    getSavedSubmissions().some((submission) => submission.grid === grid) ||
    getSubmissionSnapshot().solutions.some((row) => row.grid === grid)
  );
}

export function mergeSubmissions(
  remote: SolutionRow[] | undefined,
  local: LocalSolution[],
): Array<SolutionRow & { pending?: boolean }> | undefined {
  if (!remote && local.length === 0) return undefined;
  const rows = [...(remote ?? [])];
  const additions: LocalSolution[] = [];
  for (const solution of local) {
    // The read can see an insert before the submit response arrives. Match
    // its full payload (including start time), never just the name or grid.
    const index = rows.findIndex((row) =>
      row._id === solution._id || (
        solution.pending && !!solution.startedAt && !!row.startedAt &&
        row.username === solution.username && row.grid === solution.grid &&
        row.day === solution.day &&
        Date.parse(row.startedAt) === Date.parse(solution.startedAt) &&
        row.timeElapsed === solution.timeElapsed && row.platform === solution.platform
      ),
    );
    if (index === -1) additions.push(solution);
    else if (solution.pending) rows[index] = solution;
    // Once confirmed, prefer the server's row (including any name masking).
  }
  return [...additions, ...rows];
}
