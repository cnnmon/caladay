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

// Saved state for a single solve
export interface SavedPuzzleState {
  placedShapes: Array<{
    id: string;
    gridRow: number;
    gridCol: number;
    cells: ShapeMatrix;
  }>;
  shapeRotations: Record<string, ShapeMatrix>;
  solvedAt?: string; // ISO timestamp when solved
  solveTime?: number; // Time in seconds to solve
  gridTargets?: { month: string; dayNum: string; dayWord: string }; // What the grid was showing
}

// History of all solves keyed by date string (YYYY-MM-DD)
export type SolveHistory = Record<string, SavedPuzzleState>;

