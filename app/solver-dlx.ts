/**
 * Dancing Links (DLX) solver for the calendar puzzle.
 *
 * This implements Donald Knuth's Algorithm X using the Dancing Links technique
 * for solving exact cover problems efficiently.
 */

import { SHAPES, flipShape, normalizeShape, rotateShape } from "../lib/shapes";
import { ShapeMatrix } from "../lib/types";

const BOARD_HEIGHT = 8;
const BOARD_WIDTH = 7;

// ============================================================================
// Dancing Links Data Structure
// ============================================================================

interface DLXNode {
  left: DLXNode;
  right: DLXNode;
  up: DLXNode;
  down: DLXNode;
  column: ColumnNode;
  rowId: number;
}

interface ColumnNode extends DLXNode {
  size: number;
  id: number;
  name: string;
}

class DLX {
  header: ColumnNode;
  columns: ColumnNode[];
  solutionCount: number;
  oneSolution: boolean;

  constructor(numColumns: number, columnNames: string[]) {
    // Create header node
    this.header = this.createColumnNode(-1, "header");
    this.columns = [];
    this.solutionCount = 0;
    this.oneSolution = false;

    // Create column headers
    let prev: DLXNode = this.header;
    for (let i = 0; i < numColumns; i++) {
      const col = this.createColumnNode(i, columnNames[i]);
      this.columns.push(col);

      // Link horizontally
      col.left = prev;
      col.right = this.header;
      prev.right = col;
      this.header.left = col;

      prev = col;
    }
  }

  private createColumnNode(id: number, name: string): ColumnNode {
    const node = {
      id,
      name,
      size: 0,
    } as ColumnNode;
    node.left = node;
    node.right = node;
    node.up = node;
    node.down = node;
    node.column = node;
    node.rowId = -1;
    return node;
  }

  private createNode(column: ColumnNode, rowId: number): DLXNode {
    const node = {
      column,
      rowId,
    } as DLXNode;
    node.left = node;
    node.right = node;
    node.up = node;
    node.down = node;
    return node;
  }

  // Add a row to the matrix (representing one possible placement)
  addRow(rowId: number, columnIndices: number[]): void {
    if (columnIndices.length === 0) return;

    let firstNode: DLXNode | null = null;
    let prevNode: DLXNode | null = null;

    for (const colIdx of columnIndices) {
      const column = this.columns[colIdx];
      const node = this.createNode(column, rowId);

      // Link vertically (add to bottom of column)
      node.up = column.up;
      node.down = column;
      column.up.down = node;
      column.up = node;
      column.size++;

      // Link horizontally
      if (firstNode === null) {
        firstNode = node;
        node.left = node;
        node.right = node;
      } else {
        node.left = prevNode!;
        node.right = firstNode;
        prevNode!.right = node;
        firstNode.left = node;
      }

      prevNode = node;
    }
  }

  // Cover a column (remove it and all rows that use it)
  private cover(column: ColumnNode): void {
    // Remove column from header list
    column.right.left = column.left;
    column.left.right = column.right;

    // Remove all rows that have a 1 in this column
    for (let row = column.down; row !== column; row = row.down) {
      for (let node = row.right; node !== row; node = node.right) {
        node.down.up = node.up;
        node.up.down = node.down;
        node.column.size--;
      }
    }
  }

  // Uncover a column (restore it and all its rows)
  private uncover(column: ColumnNode): void {
    // Restore all rows (in reverse order)
    for (let row = column.up; row !== column; row = row.up) {
      for (let node = row.left; node !== row; node = node.left) {
        node.column.size++;
        node.down.up = node;
        node.up.down = node;
      }
    }

    // Restore column to header list
    column.right.left = column;
    column.left.right = column;
  }

  // Choose column with minimum size (MRV heuristic)
  private chooseColumn(): ColumnNode | null {
    let minSize = Infinity;
    let minColumn: ColumnNode | null = null;

    for (
      let col = this.header.right as ColumnNode;
      col !== this.header;
      col = col.right as ColumnNode
    ) {
      if (col.size < minSize) {
        minSize = col.size;
        minColumn = col;
        if (minSize === 0) break; // Can't do better than 0
      }
    }

    return minColumn;
  }

  // Main search algorithm
  solve(oneSolution: boolean = false): number {
    this.solutionCount = 0;
    this.oneSolution = oneSolution;
    this.search();
    return this.solutionCount;
  }

  private search(): void {
    // If we only need one solution and found it, stop
    if (this.oneSolution && this.solutionCount > 0) {
      return;
    }

    // If no columns left, we found a solution
    if (this.header.right === this.header) {
      this.solutionCount++;
      return;
    }

    // Choose column with minimum remaining values (MRV heuristic)
    const column = this.chooseColumn();
    if (!column || column.size === 0) {
      return; // Dead end
    }

    // Cover this column
    this.cover(column);

    // Try each row that has a 1 in this column
    for (let row = column.down; row !== column; row = row.down) {
      // Cover all other columns in this row
      for (let node = row.right; node !== row; node = node.right) {
        this.cover(node.column);
      }

      // Recurse
      this.search();

      // Uncover all other columns in this row (in reverse order)
      for (let node = row.left; node !== row; node = node.left) {
        this.uncover(node.column);
      }

      if (this.oneSolution && this.solutionCount > 0) {
        break;
      }
    }

    // Uncover this column
    this.uncover(column);
  }
}

// ============================================================================
// Puzzle-specific code
// ============================================================================

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

// Get all valid placements for a shape on the board
function getValidPlacements(
  shapeIdx: number,
  orientation: ShapeMatrix,
  blockedCells: Set<number>
): Array<{ shapeIdx: number; cells: number[] }> {
  const placements: Array<{ shapeIdx: number; cells: number[] }> = [];

  // Try every position on the board
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const cells: number[] = [];
      let valid = true;

      for (const [dr, dc] of orientation) {
        const r = row + dr;
        const c = col + dc;
        const cellIdx = r * BOARD_WIDTH + c;

        if (r < 0 || r >= BOARD_HEIGHT || c < 0 || c >= BOARD_WIDTH) {
          valid = false;
          break;
        }
        if (blockedCells.has(cellIdx)) {
          valid = false;
          break;
        }
        cells.push(cellIdx);
      }

      if (valid) {
        placements.push({ shapeIdx, cells });
      }
    }
  }

  return placements;
}

/**
 * Count solutions using Dancing Links algorithm.
 *
 * @param blockedPositions - Array of [row, col] positions that must stay uncovered
 * @param oneSolution - If true, stop after finding one solution
 * @returns The number of valid solutions
 */
export function countSolutionsDLX(
  blockedPositions: Array<[number, number]>,
  oneSolution: boolean = false
): number {
  // Determine blocked cells
  const blockedCells = new Set<number>();

  // Corner blocks
  blockedCells.add(0 * BOARD_WIDTH + 6);
  blockedCells.add(1 * BOARD_WIDTH + 6);
  blockedCells.add(7 * BOARD_WIDTH + 0);
  blockedCells.add(7 * BOARD_WIDTH + 1);
  blockedCells.add(7 * BOARD_WIDTH + 2);
  blockedCells.add(7 * BOARD_WIDTH + 3);

  // Target cells
  for (const [r, c] of blockedPositions) {
    blockedCells.add(r * BOARD_WIDTH + c);
  }

  // Build list of empty cells (these are the cell constraints)
  const emptyCells: number[] = [];
  for (let i = 0; i < BOARD_HEIGHT * BOARD_WIDTH; i++) {
    if (!blockedCells.has(i)) {
      emptyCells.push(i);
    }
  }

  // Columns: [empty cells...] + [shapes used exactly once...]
  // - First `emptyCells.length` columns: each empty cell must be covered exactly once
  // - Next `SHAPES.length` columns: each shape must be used exactly once
  const numCellColumns = emptyCells.length;
  const numShapeColumns = SHAPES.length;
  const numColumns = numCellColumns + numShapeColumns;

  // Create column names for debugging
  const columnNames: string[] = [];
  for (const cellIdx of emptyCells) {
    const r = Math.floor(cellIdx / BOARD_WIDTH);
    const c = cellIdx % BOARD_WIDTH;
    columnNames.push(`cell(${r},${c})`);
  }
  for (const shape of SHAPES) {
    columnNames.push(`shape_${shape.id}`);
  }

  // Create DLX matrix
  const dlx = new DLX(numColumns, columnNames);

  // Map from cell index to column index
  const cellToColumn = new Map<number, number>();
  for (let i = 0; i < emptyCells.length; i++) {
    cellToColumn.set(emptyCells[i], i);
  }

  // Pre-compute all orientations
  const shapeOrientations = SHAPES.map((shape) =>
    getAllOrientations(shape.cells)
  );

  // Add rows for each valid placement of each shape
  let rowId = 0;
  for (let shapeIdx = 0; shapeIdx < SHAPES.length; shapeIdx++) {
    for (const orientation of shapeOrientations[shapeIdx]) {
      const placements = getValidPlacements(
        shapeIdx,
        orientation,
        blockedCells
      );

      for (const placement of placements) {
        // This row covers: the cells it occupies + the "shape used" constraint
        const columnIndices: number[] = [];

        // Add cell columns
        for (const cellIdx of placement.cells) {
          const colIdx = cellToColumn.get(cellIdx);
          if (colIdx !== undefined) {
            columnIndices.push(colIdx);
          }
        }

        // Add shape column
        columnIndices.push(numCellColumns + shapeIdx);

        dlx.addRow(rowId++, columnIndices);
      }
    }
  }

  // Solve
  return dlx.solve(oneSolution);
}

/**
 * Count solutions for a specific date using DLX.
 */
export function countSolutionsForDateDLX(
  date: Date = new Date(),
  oneSolution: boolean = false
): number {
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  const dayOfWeek = date.getDay();

  const monthRow = month < 6 ? 0 : 1;
  const monthCol = month % 6;

  const dayIdx = dayOfMonth - 1;
  const dayRow = Math.floor(dayIdx / 7) + 2;
  const dayCol = dayIdx % 7;

  let weekRow: number;
  let weekCol: number;
  if (dayOfWeek <= 3) {
    weekRow = 6;
    weekCol = dayOfWeek + 3;
  } else {
    weekRow = 7;
    weekCol = dayOfWeek;
  }

  const blockedPositions: Array<[number, number]> = [
    [monthRow, monthCol],
    [dayRow, dayCol],
    [weekRow, weekCol],
  ];

  return countSolutionsDLX(blockedPositions, oneSolution);
}

/**
 * Check if a puzzle has at least one solution using DLX.
 */
export function hasSolutionDLX(
  blockedPositions: Array<[number, number]>
): boolean {
  return countSolutionsDLX(blockedPositions, true) > 0;
}
