"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { SHAPES, flipShape, normalizeShape, rotateShape } from "./shapes";
import {
  GridCell,
  PlacedShape,
  SavedPuzzleState,
  ShapeMatrix,
  SolveHistory,
} from "./types";

const STORAGE_KEY = "caesar-puzzle-history";
const PROGRESS_KEY = "caesar-puzzle-progress";
const SHAPES_VERSION = "v2"; // Increment when shapes change to clear cached rotations

function getDateKey(date: Date = new Date()): string {
  // Use local date to match grid targets (which also use local time)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadHistory(): SolveHistory {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return {};
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveHistory(history: SolveHistory): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

interface ProgressState {
  dateKey: string;
  version?: string;
  placedShapes: Array<{
    id: string;
    gridRow: number;
    gridCol: number;
    cells: ShapeMatrix;
  }>;
  shapeRotations: Record<string, ShapeMatrix>;
  elapsedTime?: number;
}

function loadProgress(): ProgressState | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(PROGRESS_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    // Clear if shapes version changed
    if (parsed.version !== SHAPES_VERSION) {
      localStorage.removeItem(PROGRESS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveProgress(state: ProgressState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({ ...state, version: SHAPES_VERSION })
  );
}

function clearProgress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PROGRESS_KEY);
}

// Build the grid structure
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildGrid(): GridCell[][] {
  const grid: GridCell[][] = [];

  // Row 0: Jan-Jun + blocked
  grid.push([
    ...MONTHS.slice(0, 6).map((m, i) => ({
      row: 0,
      col: i,
      label: m,
      isBlocked: false,
      isTarget: false,
    })),
    { row: 0, col: 6, label: "", isBlocked: true, isTarget: false },
  ]);

  // Row 1: Jul-Dec + blocked
  grid.push([
    ...MONTHS.slice(6, 12).map((m, i) => ({
      row: 1,
      col: i,
      label: m,
      isBlocked: false,
      isTarget: false,
    })),
    { row: 1, col: 6, label: "", isBlocked: true, isTarget: false },
  ]);

  // Rows 2-6: Days 1-31
  for (let rowIdx = 2; rowIdx <= 6; rowIdx++) {
    const row: GridCell[] = [];
    for (let col = 0; col < 7; col++) {
      const dayNum = (rowIdx - 2) * 7 + col + 1;
      if (rowIdx === 6 && col >= 3) {
        // Row 6, cols 3-6: Sun, Mon, Tue, Wed
        const dayWord = DAYS[col - 3];
        row.push({
          row: rowIdx,
          col,
          label: dayWord,
          isBlocked: false,
          isTarget: false,
        });
      } else if (dayNum <= 31) {
        row.push({
          row: rowIdx,
          col,
          label: String(dayNum),
          isBlocked: false,
          isTarget: false,
        });
      } else {
        row.push({
          row: rowIdx,
          col,
          label: "",
          isBlocked: true,
          isTarget: false,
        });
      }
    }
    grid.push(row);
  }

  // Row 7: blocked, blocked, blocked, blocked, Thu, Fri, Sat
  grid.push([
    { row: 7, col: 0, label: "", isBlocked: true, isTarget: false },
    { row: 7, col: 1, label: "", isBlocked: true, isTarget: false },
    { row: 7, col: 2, label: "", isBlocked: true, isTarget: false },
    { row: 7, col: 3, label: "", isBlocked: true, isTarget: false },
    { row: 7, col: 4, label: "Thu", isBlocked: false, isTarget: false },
    { row: 7, col: 5, label: "Fri", isBlocked: false, isTarget: false },
    { row: 7, col: 6, label: "Sat", isBlocked: false, isTarget: false },
  ]);

  return grid;
}

function getTargetsForDate(date: Date = new Date()): {
  month: string;
  dayNum: string;
  dayWord: string;
} {
  const month = MONTHS[date.getMonth()];
  const dayNum = String(date.getDate());
  const dayWord = DAYS[date.getDay()];
  return { month, dayNum, dayWord };
}

function markTargets(
  grid: GridCell[][],
  date: Date = new Date()
): GridCell[][] {
  const { month, dayNum, dayWord } = getTargetsForDate(date);
  return grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      isTarget:
        cell.label === month || cell.label === dayNum || cell.label === dayWord,
    }))
  );
}

const MAX_CELL_SIZE = 48;
const PALETTE_CELL_SIZE = 18;

// Format seconds as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function Puzzle() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewingDate, setViewingDate] = useState<string | null>(null); // null = playing today
  const [history, setHistory] = useState<SolveHistory>({});
  const [isSolved, setIsSolved] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  const [grid, setGrid] = useState(() => markTargets(buildGrid(), currentDate));
  const [placedShapes, setPlacedShapes] = useState<PlacedShape[]>([]);
  const [shapeRotations, setShapeRotations] = useState<
    Record<string, ShapeMatrix>
  >(() => Object.fromEntries(SHAPES.map((s) => [s.id, s.cells])));
  const [dragState, setDragState] = useState<{
    shapeId: string;
    offsetX: number;
    offsetY: number;
    currentX: number;
    currentY: number;
    startX: number;
    startY: number;
    isFromGrid: boolean;
    hasMoved: boolean;
  } | null>(null);
  const DRAG_THRESHOLD = 5;
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [invalidShake, setInvalidShake] = useState<string | null>(null);
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const shapeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const cellSize = MAX_CELL_SIZE;

  // Load history after mount to avoid hydration mismatch
  useEffect(() => {
    const loadedHistory = loadHistory();
    setHistory(loadedHistory);

    // Check if today was already solved and restore that state
    const todayKey = getDateKey(currentDate);
    const todayState = loadedHistory[todayKey];
    if (todayState) {
      const restored = todayState.placedShapes.map((s) => {
        const shape = SHAPES.find((sh) => sh.id === s.id)!;
        return {
          ...shape,
          gridRow: s.gridRow,
          gridCol: s.gridCol,
          cells: s.cells,
        };
      });
      setPlacedShapes(restored);
      setShapeRotations(todayState.shapeRotations);
      setIsSolved(true);
      setFinalTime(todayState.solveTime ?? null);
    }

    setHasMounted(true);
  }, [currentDate]);

  // Timer state
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalTime, setFinalTime] = useState<number | null>(null);

  // Timer effect
  useEffect(() => {
    if (!isPlaying || isSolved || viewingDate) return;

    const interval = setInterval(() => {
      setElapsedTime((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, isSolved, viewingDate]);

  // Load saved progress on mount (only if not already solved)
  useEffect(() => {
    // Wait for history to be checked first
    if (!hasMounted) return;

    // Skip if today was already solved (already restored from history)
    if (isSolved) {
      setHasLoadedProgress(true);
      return;
    }

    const progress = loadProgress();
    const todayKey = getDateKey();

    if (progress && progress.dateKey === todayKey) {
      // Restore today's progress
      const restored = progress.placedShapes.map((s) => {
        const shape = SHAPES.find((sh) => sh.id === s.id)!;
        return {
          ...shape,
          gridRow: s.gridRow,
          gridCol: s.gridCol,
          cells: s.cells,
        };
      });
      setPlacedShapes(restored);
      setShapeRotations(progress.shapeRotations);
      if (progress.elapsedTime !== undefined) {
        setElapsedTime(progress.elapsedTime);
      }
    } else if (progress && progress.dateKey !== todayKey) {
      // Old progress from different day, clear it
      clearProgress();
    }
    setHasLoadedProgress(true);
  }, [hasMounted, isSolved]);

  // Save progress whenever state changes (debounced to avoid excessive writes)
  useEffect(() => {
    if (!hasLoadedProgress) return; // Don't save until we've loaded
    if (viewingDate) return; // Don't save when viewing history
    if (isSolved) return; // Don't save after solved (progress is cleared)

    const todayKey = getDateKey(currentDate);
    const state: ProgressState = {
      dateKey: todayKey,
      placedShapes: placedShapes.map((p) => ({
        id: p.id,
        gridRow: p.gridRow,
        gridCol: p.gridCol,
        cells: shapeRotations[p.id],
      })),
      shapeRotations: { ...shapeRotations },
      elapsedTime,
    };
    saveProgress(state);
  }, [
    placedShapes,
    shapeRotations,
    currentDate,
    hasLoadedProgress,
    viewingDate,
    elapsedTime,
    isSolved,
  ]);

  // Check if puzzle is solved (all placeable cells are covered)
  const checkSolved = useCallback(() => {
    for (const row of grid) {
      for (const cell of row) {
        if (cell.isBlocked || cell.isTarget) continue;
        // Check if this cell is covered by a shape
        let covered = false;
        for (const placed of placedShapes) {
          const cells = shapeRotations[placed.id];
          for (const [r, c] of cells) {
            if (
              placed.gridRow + r === cell.row &&
              placed.gridCol + c === cell.col
            ) {
              covered = true;
              break;
            }
          }
          if (covered) break;
        }
        if (!covered) return false;
      }
    }
    return placedShapes.length > 0;
  }, [grid, placedShapes, shapeRotations]);

  // Check for day change
  useEffect(() => {
    const checkDate = () => {
      const now = new Date();
      const todayKey = getDateKey(now);
      const currentKey = getDateKey(currentDate);

      if (todayKey !== currentKey) {
        // Day changed - reset for new day
        setCurrentDate(now);
        setGrid(markTargets(buildGrid(), now));
        setPlacedShapes([]);
        setShapeRotations(
          Object.fromEntries(SHAPES.map((s) => [s.id, s.cells]))
        );
        setIsSolved(false);
        setViewingDate(null);
        clearProgress();
      }
    };

    // Check immediately and every minute
    checkDate();
    const interval = setInterval(checkDate, 60000);
    return () => clearInterval(interval);
  }, [currentDate]);

  // Check for win after each move
  useEffect(() => {
    if (viewingDate) return; // Don't check when viewing history

    const solved = checkSolved();
    if (solved && !isSolved) {
      setIsSolved(true);
      setFinalTime(elapsedTime);
      // Save to history using the grid's date (currentDate determines grid targets)
      const dateKey = getDateKey(currentDate);
      const { month, dayNum, dayWord } = getTargetsForDate(currentDate);
      const state: SavedPuzzleState = {
        placedShapes: placedShapes.map((p) => ({
          id: p.id,
          gridRow: p.gridRow,
          gridCol: p.gridCol,
          cells: shapeRotations[p.id],
        })),
        shapeRotations: { ...shapeRotations },
        solvedAt: new Date().toISOString(),
        solveTime: elapsedTime,
        gridTargets: { month, dayNum, dayWord }, // Store what the grid was showing
      };
      const newHistory = { ...history, [dateKey]: state };
      setHistory(newHistory);
      saveHistory(newHistory);
      clearProgress();
    }
  }, [
    placedShapes,
    shapeRotations,
    checkSolved,
    isSolved,
    currentDate,
    history,
    viewingDate,
    elapsedTime,
  ]);

  // View a previous solve
  const viewSolve = (dateKey: string) => {
    const state = history[dateKey];
    if (!state) return;

    const date = new Date(dateKey + "T12:00:00");
    setViewingDate(dateKey);
    setGrid(markTargets(buildGrid(), date));
    setFinalTime(state.solveTime ?? null);

    // Restore placed shapes
    const restored = state.placedShapes.map((s) => {
      const shape = SHAPES.find((sh) => sh.id === s.id)!;
      return {
        ...shape,
        gridRow: s.gridRow,
        gridCol: s.gridCol,
        cells: s.cells,
      };
    });
    setPlacedShapes(restored);
    setShapeRotations(state.shapeRotations);
  };

  // Return to today's puzzle
  const backToToday = () => {
    setViewingDate(null);
    setGrid(markTargets(buildGrid(), currentDate));
    setPlacedShapes([]);
    setShapeRotations(Object.fromEntries(SHAPES.map((s) => [s.id, s.cells])));

    // Restore today's progress if solved
    const todayKey = getDateKey(currentDate);
    const todayState = history[todayKey];
    if (todayState) {
      const restored = todayState.placedShapes.map((s) => {
        const shape = SHAPES.find((sh) => sh.id === s.id)!;
        return {
          ...shape,
          gridRow: s.gridRow,
          gridCol: s.gridCol,
          cells: s.cells,
        };
      });
      setPlacedShapes(restored);
      setShapeRotations(todayState.shapeRotations);
      setIsSolved(true);
    } else {
      setIsSolved(false);
    }
  };

  // Reset today's puzzle (keeps timer running)
  const resetToday = () => {
    setPlacedShapes([]);
    setShapeRotations(Object.fromEntries(SHAPES.map((s) => [s.id, s.cells])));
    setIsSolved(false);
    setFinalTime(null);
    setSelectedShapeId(null);
    clearProgress();
  };

  // Get sorted list of solved dates
  const solvedDates = Object.keys(history).sort().reverse();

  // Check if a shape is placed on the grid
  const isShapePlaced = useCallback(
    (shapeId: string) => placedShapes.some((p) => p.id === shapeId),
    [placedShapes]
  );

  // Scroll to selected shape in drawer
  useEffect(() => {
    if (selectedShapeId && shapeRefs.current[selectedShapeId]) {
      shapeRefs.current[selectedShapeId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedShapeId]);

  // Get cell info based on placed shapes
  const getCellInfo = useCallback(
    (row: number, col: number): { color: string; shapeId: string } | null => {
      for (const placed of placedShapes) {
        const cells = shapeRotations[placed.id];
        for (const [r, c] of cells) {
          if (placed.gridRow + r === row && placed.gridCol + c === col) {
            return { color: placed.color, shapeId: placed.id };
          }
        }
      }
      return null;
    },
    [placedShapes, shapeRotations]
  );

  // Check if placement is valid
  const isValidPlacement = useCallback(
    (shapeId: string, gridRow: number, gridCol: number): boolean => {
      const cells = shapeRotations[shapeId];
      for (const [r, c] of cells) {
        const row = gridRow + r;
        const col = gridCol + c;
        // Out of bounds
        if (row < 0 || row >= 8 || col < 0 || col >= 7) return false;
        const cell = grid[row][col];
        // Can't place on blocked or target cells
        if (cell.isBlocked || cell.isTarget) return false;
        // Can't overlap with other shapes (except self if moving)
        const cellInfo = getCellInfo(row, col);
        if (cellInfo && cellInfo.shapeId !== shapeId) {
          return false;
        }
      }
      return true;
    },
    [grid, shapeRotations, placedShapes, getCellInfo]
  );

  // Calculate hover preview when dragging (only after movement threshold)
  const hoverPreview = (() => {
    if (!dragState || !dragState.hasMoved || !gridRef.current) return null;

    const gridRect = gridRef.current.getBoundingClientRect();
    const x =
      dragState.currentX - gridRect.left - dragState.offsetX + cellSize / 2;
    const y =
      dragState.currentY - gridRect.top - dragState.offsetY + cellSize / 2;
    const gridCol = Math.floor(x / cellSize);
    const gridRow = Math.floor(y / cellSize);

    const cells = shapeRotations[dragState.shapeId];
    const shape = SHAPES.find((s) => s.id === dragState.shapeId)!;
    const isValid = isValidPlacement(dragState.shapeId, gridRow, gridCol);

    return { gridRow, gridCol, cells, color: shape.color, isValid };
  })();

  // Compare if two shape matrices are identical
  const shapesEqual = (a: ShapeMatrix, b: ShapeMatrix): boolean => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const sortedB = [...b].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return sortedA.every(
      (cell, i) => cell[0] === sortedB[i][0] && cell[1] === sortedB[i][1]
    );
  };

  // Check if a placed shape can be transformed (rotated/flipped) in its current position
  const canTransformPlacedShape = useCallback(
    (shapeId: string, newCells: ShapeMatrix): boolean => {
      const placed = placedShapes.find((p) => p.id === shapeId);
      if (!placed) return true; // Not placed, always allowed

      for (const [r, c] of newCells) {
        const row = placed.gridRow + r;
        const col = placed.gridCol + c;
        if (row < 0 || row >= 8 || col < 0 || col >= 7) return false;
        const cell = grid[row]?.[col];
        if (!cell || cell.isBlocked || cell.isTarget) return false;
        // Check overlap with other shapes (not self)
        for (const other of placedShapes) {
          if (other.id === shapeId) continue;
          const otherCells = shapeRotations[other.id];
          for (const [or, oc] of otherCells) {
            if (other.gridRow + or === row && other.gridCol + oc === col) {
              return false;
            }
          }
        }
      }
      return true;
    },
    [placedShapes, shapeRotations, grid]
  );

  // Rotate a shape (works for both palette and placed shapes)
  const handleRotate = useCallback(
    (shapeId: string) => {
      const currentCells = shapeRotations[shapeId];
      const newCells = normalizeShape(rotateShape(currentCells));

      // Check if transformation is valid for placed shapes
      if (!canTransformPlacedShape(shapeId, newCells)) return;

      setShapeRotations((prev) => ({ ...prev, [shapeId]: newCells }));
    },
    [shapeRotations, canTransformPlacedShape]
  );

  // Flip a shape (works for both palette and placed shapes)
  const handleFlip = useCallback(
    (shapeId: string) => {
      const currentCells = shapeRotations[shapeId];
      const newCells = normalizeShape(flipShape(currentCells));

      // Check if transformation is valid for placed shapes
      if (!canTransformPlacedShape(shapeId, newCells)) return;

      setShapeRotations((prev) => ({ ...prev, [shapeId]: newCells }));
    },
    [shapeRotations, canTransformPlacedShape]
  );

  // Check if rotate/flip would do anything for the selected shape
  const canRotateSelected = selectedShapeId
    ? (() => {
        const currentCells = shapeRotations[selectedShapeId];
        const rotatedCells = normalizeShape(rotateShape(currentCells));
        // Check if rotation changes the shape AND is valid for placed shapes
        if (shapesEqual(currentCells, rotatedCells)) return false;
        return canTransformPlacedShape(selectedShapeId, rotatedCells);
      })()
    : false;

  const canFlipSelected = selectedShapeId
    ? (() => {
        const currentCells = shapeRotations[selectedShapeId];
        const flippedCells = normalizeShape(flipShape(currentCells));
        // Check if flip changes the shape AND is valid for placed shapes
        if (shapesEqual(currentCells, flippedCells)) return false;
        return canTransformPlacedShape(selectedShapeId, flippedCells);
      })()
    : false;

  // Keyboard hotkeys for rotate (R), flip (F), and remove (Backspace/Delete/X)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedShapeId || !isPlaying || isSolved) return;
      const key = e.key.toLowerCase();
      if (key === "r" && canRotateSelected) {
        handleRotate(selectedShapeId);
      } else if (key === "f" && canFlipSelected) {
        handleFlip(selectedShapeId);
      } else if (
        (key === "backspace" || key === "delete" || key === "x") &&
        isShapePlaced(selectedShapeId)
      ) {
        e.preventDefault();
        setPlacedShapes((prev) => prev.filter((p) => p.id !== selectedShapeId));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedShapeId,
    isPlaying,
    isSolved,
    canRotateSelected,
    canFlipSelected,
    handleRotate,
    handleFlip,
    isShapePlaced,
  ]);

  // Pointer event handlers (unified mouse + touch)
  const handlePointerDown = useCallback(
    (
      shapeId: string,
      e: React.PointerEvent,
      isFromGrid: boolean,
      cellOffset?: { row: number; col: number }
    ) => {
      e.preventDefault();
      e.stopPropagation();

      // Capture pointer for reliable tracking
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();

      // Calculate offset relative to clicked element
      let offsetX = e.clientX - rect.left;
      let offsetY = e.clientY - rect.top;

      // For placed shapes with cell-based hitboxes, add the cell's position within the shape
      if (cellOffset) {
        offsetX += cellOffset.col * cellSize;
        offsetY += cellOffset.row * cellSize;
      }

      // Don't remove from grid yet - wait until actual movement
      setDragState({
        shapeId,
        offsetX,
        offsetY,
        currentX: e.clientX,
        currentY: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        isFromGrid,
        hasMoved: false,
      });
    },
    [cellSize]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      e.preventDefault();

      const dx = Math.abs(e.clientX - dragState.startX);
      const dy = Math.abs(e.clientY - dragState.startY);
      const shouldStartDrag = dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD;

      // If this is the first real movement and shape is from grid, remove it now
      if (shouldStartDrag && !dragState.hasMoved && dragState.isFromGrid) {
        setPlacedShapes((prev) =>
          prev.filter((p) => p.id !== dragState.shapeId)
        );
      }

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              hasMoved: prev.hasMoved || shouldStartDrag,
            }
          : null
      );
    },
    [dragState]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState || !gridRef.current) {
        setDragState(null);
        return;
      }

      // If no movement occurred, this was just a click to select
      if (!dragState.hasMoved) {
        setSelectedShapeId(dragState.shapeId);
        setDragState(null);
        return;
      }

      const gridRect = gridRef.current.getBoundingClientRect();
      const x = e.clientX - gridRect.left - dragState.offsetX + cellSize / 2;
      const y = e.clientY - gridRect.top - dragState.offsetY + cellSize / 2;
      const gridCol = Math.floor(x / cellSize);
      const gridRow = Math.floor(y / cellSize);

      const shape = SHAPES.find((s) => s.id === dragState.shapeId)!;
      if (isValidPlacement(dragState.shapeId, gridRow, gridCol)) {
        setPlacedShapes((prev) => [
          ...prev,
          { ...shape, cells: shapeRotations[shape.id], gridRow, gridCol },
        ]);
      }

      setDragState(null);
    },
    [dragState, cellSize, isValidPlacement, shapeRotations]
  );

  // Render shape as positioned div
  const renderShape = (
    shapeId: string,
    cells: ShapeMatrix,
    color: string,
    onPointerDown: (e: React.PointerEvent) => void,
    style?: React.CSSProperties,
    size: number = cellSize
  ) => {
    const maxRow = Math.max(...cells.map(([r]) => r)) + 1;
    const maxCol = Math.max(...cells.map(([, c]) => c)) + 1;

    return (
      <div
        key={shapeId}
        className="relative cursor-grab active:cursor-grabbing"
        style={{
          width: maxCol * size,
          height: maxRow * size,
          touchAction: "none",
          ...style,
        }}
        onPointerDown={onPointerDown}
      >
        {cells.map(([r, c], i) => (
          <div
            key={i}
            className="absolute rounded-sm border border-white/30 pointer-events-none"
            style={{
              width: size - 2,
              height: size - 2,
              top: r * size + 1,
              left: c * size + 1,
              backgroundColor: color,
            }}
          />
        ))}
      </div>
    );
  };

  const displayDate = viewingDate
    ? new Date(viewingDate + "T12:00:00")
    : currentDate;
  const { month, dayNum, dayWord } = getTargetsForDate(displayDate);
  const isViewingHistory = viewingDate !== null;

  return (
    <motion.div
      className="flex flex-col items-center gap-4 p-4 select-none max-h-dvh overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragState(null)}
    >
      {hasMounted && (
        <motion.div
          className="absolute top-0 left-0 p-2 flex flex-wrap gap-2 items-center bg-[#f2ede7] w-full justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex flex-col gap-2 px-2 p-1">
            {solvedDates.length > 0 && (
              <div className="flex gap-2 items-center flex-1">
                <span className="text-xs text-stone-400">Previous solves:</span>
                <div className="flex gap-2 overflow-x-scroll flex-1">
                  {solvedDates.map((dateKey, i) => {
                    const isActive = viewingDate === dateKey;
                    const isToday = dateKey === getDateKey(currentDate);
                    return (
                      <motion.button
                        key={dateKey}
                        onClick={() =>
                          isToday ? backToToday() : viewSolve(dateKey)
                        }
                        className={`text-xs px-2 py-1 rounded shrink-0 hover:text-stone-200 ${
                          isActive
                            ? "bg-stone-700 text-white"
                            : "bg-stone-300 hover:bg-stone-400 text-stone-600"
                        }`}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        {isToday ? "Today" : dateKey.slice(5)}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-xs text-stone-400 hidden sm:block">
              <b>Hotkeys:</b>
              <br />R = rotate
              <br />F = flip
              <br />
              Backspace/Delete/X = remove
            </p>
          </div>
          {!isViewingHistory && (
            <div className="flex gap-2 sm:hidden">
              {(placedShapes.length > 0 || isSolved || elapsedTime > 0) && (
                <motion.button
                  onClick={resetToday}
                  className="text-xs px-2 py-1 rounded-md bg-stone-300 hover:bg-stone-400 text-stone-500 hover:text-stone-200"
                >
                  Reset
                </motion.button>
              )}
              {isPlaying && (
                <motion.button
                  onClick={() => setIsPlaying(false)}
                  className="text-xs px-3 py-1 rounded-md bg-stone-300 hover:bg-stone-400 text-stone-500 hover:text-stone-200"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  Pause
                </motion.button>
              )}
              {!isPlaying && (
                <motion.button
                  onClick={() => setIsPlaying(true)}
                  className="text-xs px-3 py-1 rounded-md bg-stone-300 hover:bg-stone-400 text-stone-500 hover:text-stone-200"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  Resume
                </motion.button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h1 className="text-xl font-light tracking-wide text-stone-700">
          {month} {dayNum}, {dayWord} ·{" "}
          {isViewingHistory
            ? formatTime(history[viewingDate!]?.solveTime ?? 0)
            : formatTime(
                isSolved && finalTime !== null ? finalTime : elapsedTime
              )}
          {(isSolved || isViewingHistory) && (
            <motion.div
              key="solved"
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span
                className="text-lg font-medium text-green-600 cursor-pointer"
                onClick={() => {
                  const historyData = loadHistory();
                  const progressData = loadProgress();

                  // Backfill gridTargets for old solves
                  let updated = false;
                  const backfilledHistory = { ...historyData };
                  for (const [dateKey, state] of Object.entries(
                    backfilledHistory
                  )) {
                    if (!state.gridTargets) {
                      // Parse date key (YYYY-MM-DD) and compute targets
                      const date = new Date(dateKey + "T12:00:00");
                      const targets = getTargetsForDate(date);
                      backfilledHistory[dateKey] = {
                        ...state,
                        gridTargets: targets,
                      };
                      updated = true;
                    }
                  }

                  saveHistory(backfilledHistory);
                  setHistory(backfilledHistory);
                  console.log("✅ Backfilled gridTargets for old solves");

                  const recentSolves = Object.entries(backfilledHistory)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 5);
                  console.log("=== Caesar Puzzle Debug ===");
                  console.log("Current date key:", getDateKey(currentDate));
                  console.log("Recent solves:", recentSolves);
                  console.log("Full history:", backfilledHistory);
                  console.log("Current progress:", progressData);
                }}
              >
                {isViewingHistory ? "✓ Solved" : "🎉 Congratulations!"}
              </span>
            </motion.div>
          )}
        </h1>

        <AnimatePresence>
          {isViewingHistory && (
            <motion.button
              key="back"
              onClick={backToToday}
              className="text-sm px-3 py-1 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-600"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              ← Back to today
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Grid */}
      <motion.div
        className="border-4 border-[#2B2B23] bg-[#2B2B23] rounded-lg"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div
          ref={gridRef}
          className="relative rounded"
          style={{
            width: 7 * cellSize,
            height: 8 * cellSize,
            touchAction: "none",
          }}
        >
          {grid.map((row, rowIdx) =>
            row.map((cell, colIdx) => {
              const cellInfo = getCellInfo(rowIdx, colIdx);
              const isShaking = cellInfo && invalidShake === cellInfo.shapeId;
              const isSelected =
                cellInfo && cellInfo.shapeId === selectedShapeId;
              return (
                <motion.div
                  key={`${rowIdx}-${colIdx}`}
                  className={`absolute flex items-center justify-center text-xs font-medium pointer-events-none
                  ${
                    cell.isBlocked
                      ? "bg-background"
                      : cell.isTarget
                      ? "bg-[#2B2B23]! font-bold! text-[#F1C7A2]!"
                      : "bg-background border border-[#2B2B23]"
                  }
                  ${cell.isTarget ? "text-foreground" : "text-background"}
                `}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    top: rowIdx * cellSize,
                    left: colIdx * cellSize,
                  }}
                  animate={{
                    backgroundColor: isShaking
                      ? "#ef4444"
                      : cellInfo?.color ||
                        (cell.isBlocked
                          ? "#2B2B23"
                          : cell.isTarget
                          ? "#f2ede7"
                          : "white"),
                    color: cellInfo
                      ? "#ffffff"
                      : cell.isTarget
                      ? "#27272a"
                      : "#71717a",
                    x: isShaking ? [0, -4, 4, -4, 4, 0] : 0,
                  }}
                  transition={{
                    backgroundColor: { duration: 0.2 },
                    x: { duration: 0.3 },
                  }}
                >
                  <span>{cell.label}</span>
                </motion.div>
              );
            })
          )}

          {/* Hover preview when dragging */}
          <AnimatePresence>
            {hoverPreview &&
              hoverPreview.cells.map(([r, c], i) => {
                const row = hoverPreview.gridRow + r;
                const col = hoverPreview.gridCol + c;
                if (row < 0 || row >= 8 || col < 0 || col >= 7) return null;
                return (
                  <motion.div
                    key={`preview-${i}`}
                    className="absolute pointer-events-none rounded-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    style={{
                      width: cellSize - 2,
                      height: cellSize - 2,
                      top: row * cellSize + 1,
                      left: col * cellSize + 1,
                      backgroundColor: hoverPreview.isValid
                        ? hoverPreview.color
                        : "rgba(239, 68, 68, 0.5)",
                      border: hoverPreview.isValid
                        ? "2px solid rgba(255,255,255,0.8)"
                        : "2px solid rgba(239, 68, 68, 0.8)",
                    }}
                  />
                );
              })}
          </AnimatePresence>

          {/* Placed shapes - individual cell hitboxes for accurate clicking */}
          {!isViewingHistory &&
            isPlaying &&
            !isSolved &&
            placedShapes.flatMap((placed) => {
              const cells = shapeRotations[placed.id];
              return cells.map(([r, c], i) => (
                <div
                  key={`${placed.id}-${i}`}
                  className="absolute cursor-grab z-10"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    top: (placed.gridRow + r) * cellSize,
                    left: (placed.gridCol + c) * cellSize,
                    touchAction: "none",
                  }}
                  onClick={() => setSelectedShapeId(placed.id)}
                  onPointerDown={(e) => {
                    setSelectedShapeId(placed.id);
                    handlePointerDown(placed.id, e, true, { row: r, col: c });
                  }}
                />
              ));
            })}

          {/* Blur overlay when paused or not started */}
          <AnimatePresence>
            {!isSolved && !isViewingHistory && !isPlaying && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <div className="absolute inset-0 bg-white/60 rounded-lg" />
                {!isSolved && (
                  <motion.button
                    onClick={() => setIsPlaying(true)}
                    className="relative z-10 px-6 py-3 rounded-full bg-stone-800 text-white font-medium shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                  >
                    {elapsedTime > 0 ? "Resume" : "Start"}
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Shape palette - horizontal scrollable drawer with controls */}
      {!isViewingHistory && isPlaying && !isSolved && (
        <motion.div
          className="w-full max-w-lg flex items-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {/* Scrollable shapes */}
          <div
            className="flex-1 overflow-x-auto pb-2"
            style={{ touchAction: "pan-x" }}
          >
            <div className="flex gap-3 px-2 min-w-max">
              {SHAPES.map((shape) => {
                const cells = shapeRotations[shape.id];
                const isDraggingThis = dragState?.shapeId === shape.id;
                const isSelected = selectedShapeId === shape.id;
                const isPlaced = isShapePlaced(shape.id);

                return (
                  <motion.div
                    key={shape.id}
                    ref={(el) => {
                      shapeRefs.current[shape.id] = el;
                    }}
                    className={`flex items-center justify-center p-1.5 rounded-md cursor-pointer transition-all ${
                      isSelected ? "bg-stone-300/60" : "hover:bg-stone-300/40"
                    }`}
                    animate={{
                      opacity: isDraggingThis ? 0.3 : 1,
                    }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setSelectedShapeId(shape.id)}
                    onPointerDown={(e) => {
                      setSelectedShapeId(shape.id);
                      // Only start drag if not already placed
                      if (!isPlaced) {
                        handlePointerDown(shape.id, e, false);
                      }
                    }}
                  >
                    {renderShape(
                      shape.id,
                      cells,
                      shape.color,
                      () => {}, // Handler is on parent
                      {
                        opacity: isPlaced && !isSelected ? 0.35 : 1,
                        // If placed, make grayscale if not selected
                        filter: isPlaced ? "grayscale(1)" : "none",
                      },
                      PALETTE_CELL_SIZE
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Rotate/Flip controls */}
          <div className="flex flex-col gap-1 shrink-0 pr-2">
            <button
              onClick={() =>
                selectedShapeId &&
                canRotateSelected &&
                handleRotate(selectedShapeId)
              }
              disabled={!canRotateSelected}
              className={`w-8 h-8 flex items-center justify-center rounded text-sm transition-colors bg-stone-300 hover:bg-stone-400 active:bg-stone-400 text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed`}
              title="Rotate selected shape (R)"
            >
              ↻
            </button>
            <button
              onClick={() =>
                selectedShapeId &&
                canFlipSelected &&
                handleFlip(selectedShapeId)
              }
              disabled={!canFlipSelected}
              className={`w-8 h-8 flex items-center justify-center rounded text-sm transition-colors bg-stone-300 hover:bg-stone-400 active:bg-stone-400 text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed`}
              title="Flip selected shape (F)"
            >
              ⇆
            </button>
          </div>
        </motion.div>
      )}

      {/* Dragging preview - only show after movement threshold */}
      <AnimatePresence>
        {dragState && dragState.hasMoved && (
          <motion.div
            className="fixed pointer-events-none z-50"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.8, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1 }}
            style={{
              left: dragState.currentX - dragState.offsetX,
              top: dragState.currentY - dragState.offsetY,
            }}
          >
            {renderShape(
              dragState.shapeId,
              shapeRotations[dragState.shapeId],
              hoverPreview && !hoverPreview.isValid
                ? "#ef4444"
                : SHAPES.find((s) => s.id === dragState.shapeId)!.color,
              () => {}
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col gap-2 items-center"
      >
        <p className="text-sm text-stone-400 text-center">
          {isViewingHistory
            ? "Viewing previous solve"
            : isSolved
            ? "Play again tomorrow!"
            : isPlaying
            ? `Use all shapes (${placedShapes.length}/${SHAPES.length}) without touching the current day`
            : elapsedTime > 0
            ? "Press Resume to continue"
            : "Press Start to begin"}
        </p>
        <div className="gap-2 items-center sm:flex hidden">
          {(placedShapes.length > 0 || isSolved || elapsedTime > 0) && (
            <motion.button
              onClick={resetToday}
              className="text-xs px-2 py-1 rounded-md bg-stone-300 hover:bg-stone-400 text-stone-500 hover:text-stone-200"
            >
              Reset
            </motion.button>
          )}
          {isPlaying && (
            <motion.button
              onClick={() => setIsPlaying(false)}
              className="text-xs px-3 py-1 rounded-md bg-stone-300 hover:bg-stone-400 text-stone-500 hover:text-stone-200"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              Pause
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
