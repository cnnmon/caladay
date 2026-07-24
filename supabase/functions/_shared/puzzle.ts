// Single source of truth for the puzzle: shape definitions, transforms,
// username moderation, and server-side solution validation.
//
// This file is intentionally SELF-CONTAINED (no imports) so it can be used
// unchanged by the Deno edge function (supabase/functions/submit-solution),
// the Next.js client (via re-exports in lib/shapes.ts), and jest tests.

// Shape represented as array of [row, col] offsets from origin
export type ShapeMatrix = [number, number][];

export interface Shape {
  id: string;
  name: string;
  color: string;
  cells: ShapeMatrix;
}

// Rotate shape 90 degrees clockwise (in screen coords where row increases down)
export function rotateShape(cells: ShapeMatrix): ShapeMatrix {
  return cells.map(([r, c]) => [c, -r] as [number, number]);
}

// Flip shape horizontally (mirror along vertical axis)
export function flipShape(cells: ShapeMatrix): ShapeMatrix {
  return cells.map(([r, c]) => [r, -c] as [number, number]);
}

// Normalize shape so minimum row/col is 0
export function normalizeShape(cells: ShapeMatrix): ShapeMatrix {
  const minRow = Math.min(...cells.map(([r]) => r));
  const minCol = Math.min(...cells.map(([, c]) => c));
  return cells.map(([r, c]) => [r - minRow, c - minCol] as [number, number]);
}

// 10 polyomino shapes for the puzzle
export const SHAPES: Shape[] = [
  {
    id: "L",
    name: "L",
    color: "#A33366", // red
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
  },
  {
    id: "J",
    name: "J",
    color: "#EF7A43", // orange
    // X X X X
    // X . . .
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
    ],
  },
  {
    id: "T",
    name: "T",
    color: "#E7920A", // yellow
    // . X .
    // . X .
    // X X X
    cells: [
      [0, 1],
      [1, 1],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
  },
  {
    id: "S",
    name: "S",
    color: "#849E16", // green
    cells: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "Z",
    name: "Z",
    color: "#6BA6BA", // teal
    // X . .
    // X X .
    // . X .
    // . X .
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  },
  {
    id: "I",
    name: "I",
    color: "#0F688E", // blue
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  },
  {
    id: "O",
    name: "O",
    color: "#6777B5", // indigo
    // . X X
    // . X .
    // X X .
    cells: [
      [0, 1],
      [0, 2],
      [1, 1],
      [2, 0],
      [2, 1],
    ],
  },
  {
    id: "P",
    name: "P",
    color: "#9E78C7", // purple
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
    ],
  },
  {
    id: "U",
    name: "U",
    color: "#FF88B3", // pink
    cells: [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  {
    id: "V",
    name: "V",
    color: "#D27089", // peach
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
  },
];

// ---------------------------------------------------------------------------
// Username moderation
// ---------------------------------------------------------------------------

// Canonical banned-username list, enforced server-side at submission time and
// used client-side for instant feedback. Usernames are at most 3 characters.
export const BANNED_USERNAMES = new Set([
  "FAG", "SEX", "DIK", "DIE", "KKK", "NIG", "FAT", "GAY", "JEW", "TIT",
  "CUM", "COK", "SHT", "STD", "ASS", "DIC", "FUC", "FUK", "FCK", "HOE",
  "VAG", "PUS", "JIZ", "NGR", "NGA", "XXX", "CNT", "KNT", "FGT", "DYK",
  "KYS", "NAZ", "HIV", "RPE", "PDO",
]);

export function isUsernameBanned(username: string): boolean {
  return BANNED_USERNAMES.has(username.toUpperCase());
}

// Validate a username: 1-3 characters, A-Z only.
// Returns an error message, or null if acceptable.
export function validateUsername(username: string): string | null {
  if (!/^[A-Z]{1,3}$/.test(username)) {
    return "Name must be 1-3 letters";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Solution validation
// ---------------------------------------------------------------------------

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ROWS = 8;
const COLS = 7;

// Mirrors buildGrid() in components/Puzzle/index.tsx:
// label per cell, or null for blocked cells.
function buildLabelGrid(): (string | null)[][] {
  const grid: (string | null)[][] = [];
  grid.push([...MONTHS.slice(0, 6), null]);
  grid.push([...MONTHS.slice(6, 12), null]);
  for (let rowIdx = 2; rowIdx <= 6; rowIdx++) {
    const row: (string | null)[] = [];
    for (let col = 0; col < COLS; col++) {
      const dayNum = (rowIdx - 2) * 7 + col + 1;
      if (rowIdx === 6 && col >= 3) {
        row.push(DAYS[col - 3]); // Sun, Mon, Tue, Wed
      } else if (dayNum <= 31) {
        row.push(String(dayNum));
      } else {
        row.push(null);
      }
    }
    grid.push(row);
  }
  grid.push([null, null, null, null, "Thu", "Fri", "Sat"]);
  return grid;
}

const LABEL_GRID = buildLabelGrid();

// Parse a YYYY-MM-DD day key into target labels, or null if malformed/invalid.
export function targetsForDay(
  day: string
): { month: string; dayNum: string; dayWord: string } | null {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayNum = Number(match[3]);
  // Round-trip through Date to reject impossible dates like 2026-02-30
  const date = new Date(Date.UTC(year, month - 1, dayNum));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== dayNum
  ) {
    return null;
  }
  return {
    month: MONTHS[month - 1],
    dayNum: String(dayNum),
    dayWord: DAYS[date.getUTCDay()],
  };
}

// Canonical key for a set of cells, invariant to ordering.
function cellsKey(cells: ShapeMatrix): string {
  return normalizeShape(cells)
    .map(([r, c]) => `${r},${c}`)
    .sort()
    .join(";");
}

// All 8 orientation keys (4 rotations x optional flip) per shape id.
function buildOrientationKeys(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const shape of SHAPES) {
    const keys = new Set<string>();
    let cells = shape.cells;
    for (let flip = 0; flip < 2; flip++) {
      for (let rot = 0; rot < 4; rot++) {
        keys.add(cellsKey(cells));
        cells = rotateShape(cells);
      }
      cells = flipShape(cells);
    }
    map.set(shape.id, keys);
  }
  return map;
}

const ORIENTATION_KEYS = buildOrientationKeys();

// Validate a submitted 56-char grid string for a given day.
// Returns an error message, or null if the grid is a genuine solution.
export function validateSolution(gridStr: string, day: string): string | null {
  const targets = targetsForDay(day);
  if (!targets) return "Invalid day";
  if (gridStr.length !== ROWS * COLS) return "Invalid grid length";

  const targetLabels = new Set([
    targets.month,
    targets.dayNum,
    targets.dayWord,
  ]);
  const shapeCells = new Map<string, ShapeMatrix>();

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const char = gridStr[row * COLS + col];
      const label = LABEL_GRID[row][col];
      if (label === null) {
        if (char !== "#") return "Blocked cell not marked";
        continue;
      }
      if (char === "#") return "Non-blocked cell marked as blocked";
      if (targetLabels.has(label)) {
        if (char !== ".") return "Target cell is covered";
        continue;
      }
      if (char === ".") return "Uncovered non-target cell";
      if (!ORIENTATION_KEYS.has(char)) return "Unknown shape id";
      const cells = shapeCells.get(char) ?? [];
      cells.push([row, col]);
      shapeCells.set(char, cells);
    }
  }

  if (shapeCells.size !== SHAPES.length) return "Missing shapes";
  for (const [id, cells] of shapeCells) {
    if (!ORIENTATION_KEYS.get(id)!.has(cellsKey(cells))) {
      return "Invalid shape placement";
    }
  }
  return null;
}
