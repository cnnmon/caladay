import type { SavedPuzzleState, SolveHistory } from "./types";
import { validateSolution } from "../supabase/functions/_shared/puzzle";

const HISTORY_KEY = "caesar-puzzle-history";

export function loadSolveHistory(): SolveHistory {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const history: SolveHistory = {};
    for (const [day, value] of Object.entries(data)) {
      const state = value as Partial<SavedPuzzleState> | null;
      if (
        state && state.day === day && typeof state.grid === "string" &&
        validateSolution(state.grid, day) === null
      ) {
        history[day] = {
          day,
          grid: state.grid,
          startedAt: typeof state.startedAt === "string" ? state.startedAt : undefined,
          timeElapsed: typeof state.timeElapsed === "number" &&
            Number.isFinite(state.timeElapsed) && state.timeElapsed >= 0
            ? state.timeElapsed : undefined,
        };
      }
    }
    return history;
  } catch {
    return {};
  }
}

// Merge the latest persisted history so solving in another tab is preserved.
// On storage failure, keep the completed progress as a recovery copy.
export function saveSolveHistory(history: SolveHistory): boolean {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ ...loadSolveHistory(), ...history }));
    return true;
  } catch {
    return false;
  }
}
