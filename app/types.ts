// Shape represented as array of [row, col] offsets from origin
export type ShapeMatrix = [number, number][];

export interface Shape {
  id: string;
  name: string;
  color: string;
  cells: ShapeMatrix;
}

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
