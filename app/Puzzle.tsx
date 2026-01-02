"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { GridCell, ShapeMatrix, PlacedShape, SavedPuzzleState, SolveHistory } from "./types";
import { SHAPES, rotateShape, normalizeShape } from "./shapes";

const STORAGE_KEY = "caesar-puzzle-history";
const PROGRESS_KEY = "caesar-puzzle-progress";
const SHAPES_VERSION = "v2"; // Increment when shapes change to clear cached rotations

function getDateKey(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
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
  placedShapes: Array<{ id: string; gridRow: number; gridCol: number; cells: ShapeMatrix }>;
  shapeRotations: Record<string, ShapeMatrix>;
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
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...state, version: SHAPES_VERSION }));
}

function clearProgress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PROGRESS_KEY);
}

// Build the grid structure
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildGrid(): GridCell[][] {
  const grid: GridCell[][] = [];

  // Row 0: Jan-Jun + blocked
  grid.push([
    ...MONTHS.slice(0, 6).map((m, i) => ({ row: 0, col: i, label: m, isBlocked: false, isTarget: false })),
    { row: 0, col: 6, label: "", isBlocked: true, isTarget: false },
  ]);

  // Row 1: Jul-Dec + blocked
  grid.push([
    ...MONTHS.slice(6, 12).map((m, i) => ({ row: 1, col: i, label: m, isBlocked: false, isTarget: false })),
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
        row.push({ row: rowIdx, col, label: dayWord, isBlocked: false, isTarget: false });
      } else if (dayNum <= 31) {
        row.push({ row: rowIdx, col, label: String(dayNum), isBlocked: false, isTarget: false });
      } else {
        row.push({ row: rowIdx, col, label: "", isBlocked: true, isTarget: false });
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

function getTargetsForDate(date: Date = new Date()): { month: string; dayNum: string; dayWord: string } {
  const month = MONTHS[date.getMonth()];
  const dayNum = String(date.getDate());
  const dayWord = DAYS[date.getDay()];
  return { month, dayNum, dayWord };
}

function markTargets(grid: GridCell[][], date: Date = new Date()): GridCell[][] {
  const { month, dayNum, dayWord } = getTargetsForDate(date);
  return grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      isTarget: cell.label === month || cell.label === dayNum || cell.label === dayWord,
    }))
  );
}

const CELL_SIZE = 48;

export default function Puzzle() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewingDate, setViewingDate] = useState<string | null>(null); // null = playing today
  const [history, setHistory] = useState<SolveHistory>(() => loadHistory());
  const [isSolved, setIsSolved] = useState(false);
  
  const [grid, setGrid] = useState(() => markTargets(buildGrid(), currentDate));
  const [placedShapes, setPlacedShapes] = useState<PlacedShape[]>([]);
  const [shapeRotations, setShapeRotations] = useState<Record<string, ShapeMatrix>>(() =>
    Object.fromEntries(SHAPES.map((s) => [s.id, s.cells]))
  );
  const [dragging, setDragging] = useState<{
    shapeId: string;
    offsetX: number;
    offsetY: number;
    isFromGrid: boolean;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [invalidShake, setInvalidShake] = useState<string | null>(null);
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const DRAG_THRESHOLD = 5;

  // Load saved progress on mount
  useEffect(() => {
    const progress = loadProgress();
    const todayKey = getDateKey();
    
    if (progress && progress.dateKey === todayKey) {
      // Restore today's progress
      const restored = progress.placedShapes.map((s) => {
        const shape = SHAPES.find((sh) => sh.id === s.id)!;
        return { ...shape, gridRow: s.gridRow, gridCol: s.gridCol, cells: s.cells };
      });
      setPlacedShapes(restored);
      setShapeRotations(progress.shapeRotations);
    } else if (progress && progress.dateKey !== todayKey) {
      // Old progress from different day, clear it
      clearProgress();
    }
    setHasLoadedProgress(true);
  }, []);

  // Save progress whenever state changes (debounced to avoid excessive writes)
  useEffect(() => {
    if (!hasLoadedProgress) return; // Don't save until we've loaded
    if (viewingDate) return; // Don't save when viewing history
    
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
    };
    saveProgress(state);
  }, [placedShapes, shapeRotations, currentDate, hasLoadedProgress, viewingDate]);

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
            if (placed.gridRow + r === cell.row && placed.gridCol + c === cell.col) {
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
        setShapeRotations(Object.fromEntries(SHAPES.map((s) => [s.id, s.cells])));
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
      // Save to history and clear progress (no longer in-progress)
      const dateKey = getDateKey(currentDate);
      const state: SavedPuzzleState = {
        placedShapes: placedShapes.map((p) => ({
          id: p.id,
          gridRow: p.gridRow,
          gridCol: p.gridCol,
          cells: shapeRotations[p.id],
        })),
        shapeRotations: { ...shapeRotations },
        solvedAt: new Date().toISOString(),
      };
      const newHistory = { ...history, [dateKey]: state };
      setHistory(newHistory);
      saveHistory(newHistory);
      clearProgress();
    }
  }, [placedShapes, shapeRotations, checkSolved, isSolved, currentDate, history, viewingDate]);

  // View a previous solve
  const viewSolve = (dateKey: string) => {
    const state = history[dateKey];
    if (!state) return;
    
    const date = new Date(dateKey + "T12:00:00");
    setViewingDate(dateKey);
    setGrid(markTargets(buildGrid(), date));
    
    // Restore placed shapes
    const restored = state.placedShapes.map((s) => {
      const shape = SHAPES.find((sh) => sh.id === s.id)!;
      return { ...shape, gridRow: s.gridRow, gridCol: s.gridCol, cells: s.cells };
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
        return { ...shape, gridRow: s.gridRow, gridCol: s.gridCol, cells: s.cells };
      });
      setPlacedShapes(restored);
      setShapeRotations(todayState.shapeRotations);
      setIsSolved(true);
    } else {
      setIsSolved(false);
    }
  };

  // Get sorted list of solved dates
  const solvedDates = Object.keys(history).sort().reverse();

  // Get shapes that are not placed
  const availableShapes = SHAPES.filter((s) => !placedShapes.some((p) => p.id === s.id));

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

  // Calculate hover preview when dragging
  const hoverPreview = (() => {
    if (!dragging || !dragging.hasMoved || !dragPos || !gridRef.current) return null;
    
    const gridRect = gridRef.current.getBoundingClientRect();
    const x = dragPos.x - gridRect.left - dragging.offsetX + CELL_SIZE / 2;
    const y = dragPos.y - gridRect.top - dragging.offsetY + CELL_SIZE / 2;
    const gridCol = Math.floor(x / CELL_SIZE);
    const gridRow = Math.floor(y / CELL_SIZE);
    
    const cells = shapeRotations[dragging.shapeId];
    const shape = SHAPES.find((s) => s.id === dragging.shapeId)!;
    const isValid = isValidPlacement(dragging.shapeId, gridRow, gridCol);
    
    return { gridRow, gridCol, cells, color: shape.color, isValid };
  })();

  // Rotate a shape (checks validity for placed shapes)
  const handleRotate = useCallback((shapeId: string) => {
    const placed = placedShapes.find((p) => p.id === shapeId);
    const currentCells = shapeRotations[shapeId];
    const newCells = normalizeShape(rotateShape(currentCells));
    
    // If shape is placed, validate the new rotation fits
    if (placed) {
      for (const [r, c] of newCells) {
        const row = placed.gridRow + r;
        const col = placed.gridCol + c;
        const isOutOfBounds = row < 0 || row >= 8 || col < 0 || col >= 7;
        const cell = grid[row]?.[col];
        const isInvalid = isOutOfBounds || !cell || cell.isBlocked || cell.isTarget;
        
        if (isInvalid) {
          // Show shake animation, don't rotate
          setInvalidShake(shapeId);
          setTimeout(() => setInvalidShake(null), 300);
          return;
        }
      }
    }
    
    setShapeRotations((prev) => ({ ...prev, [shapeId]: newCells }));
  }, [placedShapes, grid, shapeRotations]);

  // Mouse/touch handlers
  const handleDragStart = (
    shapeId: string,
    e: React.MouseEvent | React.TouchEvent,
    isFromGrid: boolean
  ) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setDragging({
      shapeId,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      isFromGrid,
      startX: clientX,
      startY: clientY,
      hasMoved: false,
    });
    setDragPos({ x: clientX, y: clientY });
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      setDragPos({ x: clientX, y: clientY });

      // Check if we've moved past the threshold
      if (!dragging.hasMoved) {
        const dx = Math.abs(clientX - dragging.startX);
        const dy = Math.abs(clientY - dragging.startY);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          setDragging((prev) => prev ? { ...prev, hasMoved: true } : null);
          // Remove from grid when drag actually starts
          if (dragging.isFromGrid) {
            setPlacedShapes((prev) => prev.filter((p) => p.id !== dragging.shapeId));
          }
        }
      }
    };

    const handleEnd = (e: MouseEvent | TouchEvent) => {
      if (!dragging || !gridRef.current) {
        setDragging(null);
        setDragPos(null);
        return;
      }

      // If no movement, treat as tap to rotate
      if (!dragging.hasMoved) {
        if (dragging.isFromGrid) {
          handleRotate(dragging.shapeId);
        }
        setDragging(null);
        setDragPos(null);
        return;
      }

      const clientX = "changedTouches" in e ? e.changedTouches[0].clientX : e.clientX;
      const clientY = "changedTouches" in e ? e.changedTouches[0].clientY : e.clientY;
      const gridRect = gridRef.current.getBoundingClientRect();

      // Calculate grid position
      const x = clientX - gridRect.left - dragging.offsetX + CELL_SIZE / 2;
      const y = clientY - gridRect.top - dragging.offsetY + CELL_SIZE / 2;
      const gridCol = Math.floor(x / CELL_SIZE);
      const gridRow = Math.floor(y / CELL_SIZE);

      const shape = SHAPES.find((s) => s.id === dragging.shapeId)!;
      if (isValidPlacement(dragging.shapeId, gridRow, gridCol)) {
        setPlacedShapes((prev) => [
          ...prev,
          { ...shape, cells: shapeRotations[shape.id], gridRow, gridCol },
        ]);
      }

      setDragging(null);
      setDragPos(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [dragging, isValidPlacement, shapeRotations, handleRotate]);

  // Render shape as positioned div
  const renderShape = (
    shapeId: string,
    cells: ShapeMatrix,
    color: string,
    onMouseDown: (e: React.MouseEvent) => void,
    onTouchStart: (e: React.TouchEvent) => void,
    onClick?: () => void,
    style?: React.CSSProperties
  ) => {
    const maxRow = Math.max(...cells.map(([r]) => r)) + 1;
    const maxCol = Math.max(...cells.map(([, c]) => c)) + 1;

    return (
      <div
        key={shapeId}
        className="relative cursor-grab active:cursor-grabbing"
        style={{
          width: maxCol * CELL_SIZE,
          height: maxRow * CELL_SIZE,
          ...style,
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={onClick}
      >
        {cells.map(([r, c], i) => (
          <div
            key={i}
            className="absolute rounded-sm border border-white/30"
            style={{
              width: CELL_SIZE - 2,
              height: CELL_SIZE - 2,
              top: r * CELL_SIZE + 1,
              left: c * CELL_SIZE + 1,
              backgroundColor: color,
            }}
          />
        ))}
      </div>
    );
  };

  const displayDate = viewingDate ? new Date(viewingDate + "T12:00:00") : currentDate;
  const { month, dayNum, dayWord } = getTargetsForDate(displayDate);
  const isViewingHistory = viewingDate !== null;

  return (
    <div className="flex flex-col items-center gap-6 p-4 select-none">
      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-light tracking-wide text-zinc-700">
          {month} {dayNum} · {dayWord}
        </h1>
        
        {isViewingHistory && (
          <button
            onClick={backToToday}
            className="text-sm px-3 py-1 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-600 transition-colors"
          >
            ← Back to today
          </button>
        )}
        
        {isSolved && !isViewingHistory && (
          <div className="text-sm text-green-600 font-medium">
            ✓ Solved!
          </div>
        )}
      </div>

      {/* History picker */}
      {solvedDates.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 max-w-md">
          <span className="text-xs text-zinc-400 w-full text-center mb-1">Previous solves:</span>
          {solvedDates.slice(0, 7).map((dateKey) => {
            const isActive = viewingDate === dateKey;
            const isToday = dateKey === getDateKey(currentDate);
            return (
              <button
                key={dateKey}
                onClick={() => isToday ? backToToday() : viewSolve(dateKey)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  isActive 
                    ? "bg-zinc-700 text-white" 
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
                }`}
              >
                {isToday ? "Today" : dateKey.slice(5)}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      <div
        ref={gridRef}
        className="relative rounded-lg border border-zinc-200 bg-zinc-50"
        style={{ width: 7 * CELL_SIZE, height: 8 * CELL_SIZE }}
      >
        {grid.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            const cellInfo = getCellInfo(rowIdx, colIdx);
            const isShaking = cellInfo && invalidShake === cellInfo.shapeId;
            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={`absolute flex items-center justify-center text-xs font-medium transition-colors
                  ${cell.isBlocked ? "bg-zinc-200" : cell.isTarget ? "bg-white border-2 border-zinc-400" : "bg-zinc-100 border border-zinc-200"}
                  ${cell.isTarget ? "text-zinc-800" : "text-zinc-500"}
                  ${isShaking ? "animate-shake" : ""}
                `}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  top: rowIdx * CELL_SIZE,
                  left: colIdx * CELL_SIZE,
                  backgroundColor: isShaking ? "#ef4444" : cellInfo?.color || undefined,
                  color: cellInfo ? "white" : undefined,
                  textShadow: cellInfo ? "0 1px 2px rgba(0,0,0,0.3)" : undefined,
                }}
              >
                {cell.label}
              </div>
            );
          })
        )}

        {/* Hover preview when dragging */}
        {hoverPreview && hoverPreview.cells.map(([r, c], i) => {
          const row = hoverPreview.gridRow + r;
          const col = hoverPreview.gridCol + c;
          if (row < 0 || row >= 8 || col < 0 || col >= 7) return null;
          return (
            <div
              key={`preview-${i}`}
              className="absolute pointer-events-none rounded-sm"
              style={{
                width: CELL_SIZE - 2,
                height: CELL_SIZE - 2,
                top: row * CELL_SIZE + 1,
                left: col * CELL_SIZE + 1,
                backgroundColor: hoverPreview.isValid 
                  ? hoverPreview.color 
                  : "rgba(239, 68, 68, 0.5)",
                opacity: 0.5,
                border: hoverPreview.isValid 
                  ? "2px solid rgba(255,255,255,0.8)" 
                  : "2px solid rgba(239, 68, 68, 0.8)",
              }}
            />
          );
        })}

        {/* Placed shapes (invisible, for drag handling) */}
        {!isViewingHistory && placedShapes.map((placed) => {
          const cells = shapeRotations[placed.id];
          const maxRow = Math.max(...cells.map(([r]) => r)) + 1;
          const maxCol = Math.max(...cells.map(([, c]) => c)) + 1;
          return (
            <div
              key={placed.id}
              className="absolute cursor-grab"
              style={{
                width: maxCol * CELL_SIZE,
                height: maxRow * CELL_SIZE,
                top: placed.gridRow * CELL_SIZE,
                left: placed.gridCol * CELL_SIZE,
              }}
              onMouseDown={(e) => handleDragStart(placed.id, e, true)}
              onTouchStart={(e) => handleDragStart(placed.id, e, true)}
            />
          );
        })}
      </div>

      {/* Shape palette - hidden when viewing history */}
      {!isViewingHistory && (
        <div className="flex flex-wrap justify-center gap-4 max-w-2xl">
          {availableShapes.map((shape) => {
            const cells = shapeRotations[shape.id];
            const isDragging = dragging?.shapeId === shape.id;
            return (
              <div key={shape.id} className={isDragging ? "opacity-30" : ""}>
                {renderShape(
                  shape.id,
                  cells,
                  shape.color,
                  (e) => handleDragStart(shape.id, e, false),
                  (e) => handleDragStart(shape.id, e, false),
                  () => handleRotate(shape.id)
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dragging preview */}
      {dragging && dragPos && (
        <div
          className="fixed pointer-events-none z-50 opacity-80"
          style={{
            left: dragPos.x - dragging.offsetX,
            top: dragPos.y - dragging.offsetY,
          }}
        >
          {renderShape(
            dragging.shapeId,
            shapeRotations[dragging.shapeId],
            hoverPreview && !hoverPreview.isValid ? "#ef4444" : SHAPES.find((s) => s.id === dragging.shapeId)!.color,
            () => {},
            () => {}
          )}
        </div>
      )}

      <p className="text-sm text-zinc-400">
        {isViewingHistory 
          ? "Viewing previous solve" 
          : "Tap shapes to rotate · Drag onto grid to place"}
      </p>
    </div>
  );
}

