import { SHAPES, flipShape, normalizeShape, rotateShape } from "../lib/shapes";
import { ShapeMatrix } from "../lib/types";

const BOARD_HEIGHT = 8;
const BOARD_WIDTH = 7;

// Use numbers for cell states (more memory efficient)
const EMPTY = 0;
const BLOCKED = 1;
const FILLED = 2;

// Generate all unique orientations of a shape (rotations + flips)
function getAllOrientations(cells: ShapeMatrix): ShapeMatrix[] {
  const orientations: ShapeMatrix[] = [];
  const seen = new Set<string>();

  const addIfUnique = (shape: ShapeMatrix) => {
    const normalized = normalizeShape(shape);
    const key = normalized
      .map(([r, c]) => `${r},${c}`)
      .sort()
      .join("|");
    if (!seen.has(key)) {
      seen.add(key);
      orientations.push(normalized);
    }
  };

  let current = cells;
  for (let rot = 0; rot < 4; rot++) {
    addIfUnique(current);
    addIfUnique(flipShape(current));
    current = rotateShape(current);
  }

  return orientations;
}

// Create a board from blocked positions using a flat Uint8Array (more memory efficient)
function createBoard(blockedPositions: Array<[number, number]>): Uint8Array {
  const cells = new Uint8Array(BOARD_HEIGHT * BOARD_WIDTH);

  // Mark permanently blocked cells (corners that can never be placed on)
  // Top-right corners
  cells[0 * BOARD_WIDTH + 6] = BLOCKED;
  cells[1 * BOARD_WIDTH + 6] = BLOCKED;
  // Bottom-left corners
  cells[7 * BOARD_WIDTH + 0] = BLOCKED;
  cells[7 * BOARD_WIDTH + 1] = BLOCKED;
  cells[7 * BOARD_WIDTH + 2] = BLOCKED;
  cells[7 * BOARD_WIDTH + 3] = BLOCKED;

  // Mark target cells as blocked (month, day, weekday)
  for (const [r, c] of blockedPositions) {
    cells[r * BOARD_WIDTH + c] = BLOCKED;
  }

  return cells;
}

// Check if we can place a shape at a given position
function canPlace(
  board: Uint8Array,
  shape: ShapeMatrix,
  row: number,
  col: number
): boolean {
  for (let i = 0; i < shape.length; i++) {
    const r = row + shape[i][0];
    const c = col + shape[i][1];
    if (r < 0 || r >= BOARD_HEIGHT || c < 0 || c >= BOARD_WIDTH) {
      return false;
    }
    if (board[r * BOARD_WIDTH + c] !== EMPTY) {
      return false;
    }
  }
  return true;
}

// Place a shape on the board
function placeShape(
  board: Uint8Array,
  shape: ShapeMatrix,
  row: number,
  col: number
): void {
  for (let i = 0; i < shape.length; i++) {
    board[(row + shape[i][0]) * BOARD_WIDTH + (col + shape[i][1])] = FILLED;
  }
}

// Remove a shape from the board
function removeShape(
  board: Uint8Array,
  shape: ShapeMatrix,
  row: number,
  col: number
): void {
  for (let i = 0; i < shape.length; i++) {
    board[(row + shape[i][0]) * BOARD_WIDTH + (col + shape[i][1])] = EMPTY;
  }
}

// Find the first empty cell (scanning top-to-bottom, left-to-right)
function findFirstEmpty(board: Uint8Array): number {
  for (let i = 0; i < board.length; i++) {
    if (board[i] === EMPTY) {
      return i;
    }
  }
  return -1;
}

// DFS solver - returns the count of solutions found
function dfs(
  board: Uint8Array,
  shapeOrientations: ShapeMatrix[][],
  available: boolean[],
  remainingCount: number,
  oneSolution: boolean
): number {
  // If we only need one solution and found it, stop
  if (oneSolution && remainingCount === 0) {
    return 1;
  }

  // If no shapes left, we found a solution
  if (remainingCount === 0) {
    return 1;
  }

  // Find the first empty cell
  const emptyIdx = findFirstEmpty(board);
  if (emptyIdx === -1) {
    // No empty cells but shapes remain - shouldn't happen with valid puzzle
    return 0;
  }

  const row = Math.floor(emptyIdx / BOARD_WIDTH);
  const col = emptyIdx % BOARD_WIDTH;

  let solutionCount = 0;

  // Try each available shape
  for (let shapeIdx = 0; shapeIdx < available.length; shapeIdx++) {
    if (!available[shapeIdx]) continue;

    available[shapeIdx] = false;

    // Try each orientation of the shape
    const orientations = shapeOrientations[shapeIdx];
    for (let oi = 0; oi < orientations.length; oi++) {
      const orientation = orientations[oi];

      // Try placing so that any cell of the shape covers the empty cell
      for (let ci = 0; ci < orientation.length; ci++) {
        const placeRow = row - orientation[ci][0];
        const placeCol = col - orientation[ci][1];

        if (canPlace(board, orientation, placeRow, placeCol)) {
          placeShape(board, orientation, placeRow, placeCol);
          solutionCount += dfs(
            board,
            shapeOrientations,
            available,
            remainingCount - 1,
            oneSolution
          );
          removeShape(board, orientation, placeRow, placeCol);

          if (oneSolution && solutionCount > 0) {
            available[shapeIdx] = true;
            return solutionCount;
          }
        }
      }
    }

    available[shapeIdx] = true;
  }

  return solutionCount;
}

/**
 * Count the number of possible solutions for a given puzzle configuration.
 *
 * @param blockedPositions - Array of [row, col] positions that must stay uncovered (targets)
 * @param oneSolution - If true, stop after finding one solution (faster)
 * @returns The number of valid solutions
 */
export function countSolutions(
  blockedPositions: Array<[number, number]>,
  oneSolution: boolean = false
): number {
  const board = createBoard(blockedPositions);

  // Pre-compute all orientations for each shape
  const shapeOrientations: ShapeMatrix[][] = SHAPES.map((shape) =>
    getAllOrientations(shape.cells)
  );

  // All shapes are available initially (use boolean array instead of Set)
  const available = new Array(SHAPES.length).fill(true);

  return dfs(board, shapeOrientations, available, SHAPES.length, oneSolution);
}

/**
 * Count solutions for a specific date.
 *
 * @param date - The date to solve for
 * @param oneSolution - If true, stop after finding one solution
 * @returns The number of valid solutions
 */
export function countSolutionsForDate(
  date: Date = new Date(),
  oneSolution: boolean = false
): number {
  const month = date.getMonth(); // 0-11
  const dayOfMonth = date.getDate(); // 1-31
  const dayOfWeek = date.getDay(); // 0-6 (Sun-Sat)

  // Calculate month position (row 0-1, col 0-5)
  const monthRow = month < 6 ? 0 : 1;
  const monthCol = month % 6;

  // Calculate day of month position (rows 2-6, cols 0-6)
  // Days 1-31 fill rows 2-6
  const dayIdx = dayOfMonth - 1; // 0-30
  const dayRow = Math.floor(dayIdx / 7) + 2;
  const dayCol = dayIdx % 7;

  // Calculate day of week position
  // Sun-Wed are at row 6, cols 3-6
  // Thu-Sat are at row 7, cols 4-6
  let weekRow: number;
  let weekCol: number;
  if (dayOfWeek <= 3) {
    // Sun(0), Mon(1), Tue(2), Wed(3) -> row 6, cols 3-6
    weekRow = 6;
    weekCol = dayOfWeek + 3;
  } else {
    // Thu(4), Fri(5), Sat(6) -> row 7, cols 4-6
    weekRow = 7;
    weekCol = dayOfWeek;
  }

  const blockedPositions: Array<[number, number]> = [
    [monthRow, monthCol],
    [dayRow, dayCol],
    [weekRow, weekCol],
  ];

  return countSolutions(blockedPositions, oneSolution);
}

/**
 * Check if a puzzle has at least one solution.
 */
export function hasSolution(
  blockedPositions: Array<[number, number]>
): boolean {
  return countSolutions(blockedPositions, true) > 0;
}

/**
 * Check if a specific date's puzzle has at least one solution.
 */
export function dateHasSolution(date: Date = new Date()): boolean {
  return countSolutionsForDate(date, true) > 0;
}
