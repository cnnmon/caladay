// Shape types are defined in the shared puzzle module (used by both the
// client and the Supabase edge function); re-exported for convenience.
import type { Shape } from "../supabase/functions/_shared/puzzle";

export type { Shape, ShapeMatrix } from "../supabase/functions/_shared/puzzle";

export interface PlacedShape extends Shape {
  gridRow: number;
  gridCol: number;
}

export interface GridCell {
  row: number;
  col: number;
  label: string;
  isBlocked: boolean; // cells that can't be placed on (corners)
  isTarget: boolean; // current date cells that must stay uncovered
}

export type Solution = {
  username: string;
} & SavedPuzzleState;

// Saved state for a single solve
export interface SavedPuzzleState {
  grid: string; // String representation of the grid (7x8, 56 chars)
  day: string; // Date key (YYYY-MM-DD)
  startedAt?: string; // ISO timestamp when timer started
  timeElapsed?: number; // Elapsed time in ms, frozen when solved or page closed
}

// History of all solves keyed by date string (YYYY-MM-DD)
export type SolveHistory = Record<string, SavedPuzzleState>;
