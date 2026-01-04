import { Shape, ShapeMatrix } from "./types";

// Rotate shape 90 degrees clockwise (in screen coords where row increases down)
export function rotateShape(cells: ShapeMatrix): ShapeMatrix {
  return cells.map(([r, c]) => [-c, r] as [number, number]);
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
