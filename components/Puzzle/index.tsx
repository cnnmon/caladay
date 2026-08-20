"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSolutionById, submitSolution, SolutionRow } from "../../lib/db";
import {
  flipShape,
  normalizeShape,
  rotateShape,
  SHAPES,
} from "../../lib/shapes";
import {
  GridCell,
  PlacedShape,
  SavedPuzzleState,
  ShapeMatrix,
  SolveHistory,
} from "../../lib/types";
import {
  hapticInvalid,
  hapticPlace,
  hapticSolve,
  hideSplash,
  isNative,
  openAppSettings,
} from "../../lib/native";
import { isReminderEnabled, setReminderEnabled } from "../../lib/notifications";
import { shareSolve } from "../../lib/share";
import DifficultyBar from "../DifficultyBar";
import SolveModal, {
  addSubmission,
  getSavedUsername,
  isGridAlreadySubmitted,
  ModalMode,
} from "../SolveModal";

const PROGRESS_KEY = "caesar-progress-v2";
const SEEN_HELP_KEY = "CALADAY_SEEN_HELP";
const OLD_STORAGE_KEY = "caesar-puzzle-history";
const OLD_PROGRESS_KEY = "caesar-puzzle-progress";
const SHAPES_VERSION = "v2"; // Increment when shapes change to clear cached rotations

function getDateKey(date: Date = new Date()): string {
  // Use local date to match grid targets (which also use local time)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  startedAt?: string; // ISO timestamp when timer started
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

// Convert placed shapes to a 56-character grid string
function gridToString(
  placedShapes: PlacedShape[],
  shapeRotations: Record<string, ShapeMatrix>,
  grid: GridCell[][]
): string {
  // Build a map of which shape covers each cell
  const cellMap = new Map<string, string>();
  for (const shape of placedShapes) {
    const cells = shapeRotations[shape.id];
    for (const [r, c] of cells) {
      const row = shape.gridRow + r;
      const col = shape.gridCol + c;
      cellMap.set(`${row},${col}`, shape.id);
    }
  }

  let result = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = grid[row]?.[col];
      if (!cell || cell.isBlocked) {
        result += "#";
      } else {
        const shapeId = cellMap.get(`${row},${col}`);
        result += shapeId || ".";
      }
    }
  }
  return result;
}

// Parse a 56-character grid string back to placed shapes and rotations
function stringToPlacedShapes(
  gridStr: string
): { shapes: PlacedShape[]; rotations: Record<string, ShapeMatrix> } | null {
  if (gridStr.length !== 56) return null;

  // Parse positions for each shape
  const shapePositions: Record<string, Array<[number, number]>> = {};
  for (let i = 0; i < 56; i++) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const char = gridStr[i].toUpperCase();
    if (char !== "." && char !== "#") {
      if (!shapePositions[char]) {
        shapePositions[char] = [];
      }
      shapePositions[char].push([row, col]);
    }
  }

  const newPlacedShapes: PlacedShape[] = [];
  const newRotations: Record<string, ShapeMatrix> = Object.fromEntries(
    SHAPES.map((s) => [s.id, s.cells])
  );

  for (const [shapeId, positions] of Object.entries(shapePositions)) {
    const shape = SHAPES.find((s) => s.id === shapeId);
    if (!shape || positions.length !== shape.cells.length) return null;

    // Find the top-left corner
    const minRow = Math.min(...positions.map(([r]) => r));
    const minCol = Math.min(...positions.map(([, c]) => c));

    // Compute relative cells
    const relativeCells: ShapeMatrix = positions.map(([r, c]) => [
      r - minRow,
      c - minCol,
    ]);

    // Find matching rotation
    const normalizeForCompare = (cells: ShapeMatrix): string =>
      [...cells]
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .map(([r, c]) => `${r},${c}`)
        .join("|");

    const normalizedInput = normalizeForCompare(relativeCells);
    let matchedRotation: ShapeMatrix | null = null;
    let testCells = shape.cells;

    for (let rot = 0; rot < 4; rot++) {
      const normalized = normalizeShape(testCells);
      if (normalizeForCompare(normalized) === normalizedInput) {
        matchedRotation = normalized;
        break;
      }
      const flipped = normalizeShape(flipShape(testCells));
      if (normalizeForCompare(flipped) === normalizedInput) {
        matchedRotation = flipped;
        break;
      }
      testCells = rotateShape(testCells);
    }

    if (!matchedRotation) return null;

    newRotations[shapeId] = matchedRotation;
    newPlacedShapes.push({
      ...shape,
      gridRow: minRow,
      gridCol: minCol,
      cells: matchedRotation,
    });
  }

  return { shapes: newPlacedShapes, rotations: newRotations };
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
const MOBILE_CELL_SIZE = 38;
const PALETTE_CELL_SIZE = 15;
const MOBILE_PALETTE_CELL_SIZE = 12;

// Format seconds as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Get solve time in seconds from a saved state
function getSolveTime(state: SavedPuzzleState): number {
  if (state.timeElapsed !== undefined) {
    return Math.floor(state.timeElapsed / 1000);
  }
  return 0;
}

export default function Puzzle() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewingDate, setViewingDate] = useState<string | null>(null); // null = playing today
  const [viewingImported, setViewingImported] = useState(false); // true = previewing imported solution
  const [importedShapes, setImportedShapes] = useState<PlacedShape[]>([]);
  const [importedRotations, setImportedRotations] = useState<
    Record<string, ShapeMatrix>
  >({});
  const [previewSolutionId, setPreviewSolutionId] = useState<string | null>(
    null
  );
  const [previewSolution, setPreviewSolution] = useState<SolutionRow | null>(
    null
  );

  // Fetch preview solution when an id is set (from ?solution= URL param)
  useEffect(() => {
    if (!previewSolutionId) return;
    let cancelled = false;
    getSolutionById(previewSolutionId)
      .then((solution) => {
        if (!cancelled) setPreviewSolution(solution);
      })
      .catch(() => {
        // Offline or bad id; stay on today's puzzle
      });
    return () => {
      cancelled = true;
    };
  }, [previewSolutionId]);
  const [history, setHistory] = useState<SolveHistory>({});
  const [isSolved, setIsSolved] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [showSolveModal, setShowSolveModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // First launch: open the help modal so new players learn the rules.
  // Marked seen on dismiss, so an early exit shows it again next time.
  useEffect(() => {
    if (!localStorage.getItem(SEEN_HELP_KEY)) {
      setShowHelpModal(true);
    }
  }, []);

  const closeHelpModal = () => {
    setShowHelpModal(false);
    try {
      localStorage.setItem(SEEN_HELP_KEY, "true");
    } catch {
      // localStorage unavailable; the modal will show again next launch
    }
  };
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("submit");
  const [pendingSolution, setPendingSolution] =
    useState<SavedPuzzleState | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [nativeUI, setNativeUI] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHint, setReminderHint] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Native-only UI (reminder bell) is decided after mount to avoid
  // hydration mismatches with the prerendered HTML.
  useEffect(() => {
    setNativeUI(isNative());
    setReminderOn(isReminderEnabled());
  }, []);

  // Webfonts (Geist) swap in a few frames after first paint, reflowing the
  // toolbar text — the last source of launch flicker. Hold the reveal until
  // the browser reports fonts loaded (with a cap, in case ready never fires).
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setFontsReady(true);
      }
    };
    document.fonts.ready.then(finish).catch(finish);
    const cap = setTimeout(finish, 1500);
    return () => clearTimeout(cap);
  }, []);

  const revealed = hasMounted && fontsReady;

  // Drop the native splash only after the settled, fully-fonted UI has
  // actually painted (two frames past reveal). Safety timeout in case
  // something above throws — a stuck splash is worse than a flicker.
  useEffect(() => {
    const fallback = setTimeout(hideSplash, 3000);
    if (revealed) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => hideSplash());
      });
    }
    return () => clearTimeout(fallback);
  }, [revealed]);

  // Load username on mount
  useEffect(() => {
    const saved = getSavedUsername();
    if (saved) setCurrentUsername(saved);
  }, []);

  // Handle solution param from URL (leaderboard click)
  useEffect(() => {
    const solutionId = searchParams.get("solution");
    if (solutionId) {
      setPreviewSolutionId(solutionId);
      // Clear the URL param without full navigation
      router.replace("/", { scroll: false });
    }
  }, [searchParams, router]);

  // Load preview solution when fetched from DB
  useEffect(() => {
    if (previewSolution) {
      const parsed = stringToPlacedShapes(previewSolution.grid);
      if (parsed) {
        setViewingImported(true);
        setImportedShapes(parsed.shapes);
        setImportedRotations(parsed.rotations);
        // Update grid to show the correct day's targets
        const solutionDate = new Date(previewSolution.day + "T12:00:00");
        setGrid(markTargets(buildGrid(), solutionDate));
        setViewingDate(previewSolution.day);
      }
    }
  }, [previewSolution]);

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
    // Whether the shape was already selected when the press started
    // (pieces select themselves eagerly on pointerdown, so this must be
    // captured before that to make tap-again-to-rotate work)
    wasSelected: boolean;
  } | null>(null);
  const DRAG_THRESHOLD = 5;
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [invalidShake, setInvalidShake] = useState<string | null>(null);
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
  // Grid cell currently targeted while dragging; only re-renders on cell change
  const [dragCell, setDragCell] = useState<{ row: number; col: number } | null>(
    null
  );
  // Drag ghost follows the pointer via direct DOM writes (no re-render per move)
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostPos = useRef({ x: 0, y: 0 });
  // Long-press (flip) tracking
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const LONG_PRESS_MS = 450;
  const gridRef = useRef<HTMLDivElement>(null);
  const shapeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const cellSize = isMobile ? MOBILE_CELL_SIZE : MAX_CELL_SIZE;
  const paletteCellSize = isMobile ? MOBILE_PALETTE_CELL_SIZE : PALETTE_CELL_SIZE;

  // Load history after mount to avoid hydration mismatch
  useEffect(() => {
    const todayKey = getDateKey(currentDate);
    const todayState = history[todayKey];

    // Check if there's in-progress state - takes priority over solved
    const progress = loadProgress();
    if (progress && progress.dateKey === todayKey) {
      // Have in-progress state for today, don't load solved state
      setHasMounted(true);
      return;
    }

    // No in-progress, check if today was already solved
    if (todayState) {
      const parsed = stringToPlacedShapes(todayState.grid);
      if (parsed) {
        setPlacedShapes(parsed.shapes);
        setShapeRotations(parsed.rotations);
        setIsSolved(true);
        setFinalTime(getSolveTime(todayState));
      }
    }

    setHasMounted(true);
  }, [currentDate]);

  // Timer state
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalTime, setFinalTime] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  // Track when timer starts
  useEffect(() => {
    if (isPlaying && !startedAt && !isSolved) {
      setStartedAt(new Date().toISOString());
    }
  }, [isPlaying, startedAt, isSolved]);

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
      if (progress.startedAt) {
        setStartedAt(progress.startedAt);
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
      startedAt: startedAt ?? undefined, // Save timer start time
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
    startedAt,
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
        setElapsedTime(0);
        setFinalTime(null);
        setStartedAt(null);
        setIsPlaying(false);
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
      hapticSolve();
      setIsSolved(true);
      setFinalTime(elapsedTime);
      // Save to history keyed by day
      const dayKey = getDateKey(currentDate);
      const state: SavedPuzzleState = {
        grid: gridToString(placedShapes, shapeRotations, grid),
        day: dayKey,
        startedAt: startedAt ?? new Date().toISOString(),
        timeElapsed: elapsedTime * 1000, // Convert seconds to ms
      };
      const newHistory = { ...history, [dayKey]: state };
      setHistory(newHistory);
      clearProgress();

      // Check if this solution was already submitted
      if (isGridAlreadySubmitted(state.grid)) {
        setShowDuplicateModal(true);
        return;
      }

      // Check if user has a saved username - auto-submit if so
      const savedUsername = getSavedUsername();
      if (savedUsername) {
        // Auto-submit to leaderboard
        submitSolution({
          username: savedUsername,
          grid: state.grid,
          day: state.day,
          startedAt: state.startedAt,
          timeElapsed: state.timeElapsed,
        })
          .then((solutionId) => {
            addSubmission(solutionId, state.grid);
          })
          .catch((err) => {
            // Offline or rejected by server-side validation; the solve is
            // still saved locally, just not on the leaderboard.
            console.warn("Leaderboard submission failed:", err);
          });
      } else {
        // Show modal to ask for name
        setPendingSolution(state);
        setModalMode("submit");
        setShowSolveModal(true);
      }
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
    startedAt,
    grid,
  ]);

  // View a previous solve
  const viewSolve = (dayKey: string) => {
    const state = history[dayKey];
    if (!state) return;

    // Use day key to determine the date
    const date = new Date(state.day + "T12:00:00");

    setViewingDate(dayKey);
    setGrid(markTargets(buildGrid(), date));
    setFinalTime(getSolveTime(state));

    // Restore placed shapes from grid string
    const parsed = stringToPlacedShapes(state.grid);
    if (parsed) {
      setPlacedShapes(parsed.shapes);
      setShapeRotations(parsed.rotations);
    }
  };

  // Return to today's puzzle
  const backToToday = () => {
    setViewingDate(null);
    setViewingImported(false);
    setImportedShapes([]);
    setImportedRotations({});
    setPreviewSolutionId(null);
    setGrid(markTargets(buildGrid(), currentDate));
    setPlacedShapes([]);
    setShapeRotations(Object.fromEntries(SHAPES.map((s) => [s.id, s.cells])));

    // Restore today's progress if solved
    const todayKey = getDateKey(currentDate);
    const todayState = history[todayKey];
    if (todayState) {
      const parsed = stringToPlacedShapes(todayState.grid);
      if (parsed) {
        setPlacedShapes(parsed.shapes);
        setShapeRotations(parsed.rotations);
        setIsSolved(true);
        setFinalTime(getSolveTime(todayState));
      }
    } else {
      setIsSolved(false);
      setFinalTime(null);
    }
  };

  // Reset today's puzzle (resets timer too)
  const resetToday = () => {
    // If already solved, then reset elapsed time
    if (isSolved) {
      setElapsedTime(0);
    }
    setPlacedShapes([]);
    setShapeRotations(Object.fromEntries(SHAPES.map((s) => [s.id, s.cells])));
    setIsSolved(false);
    setFinalTime(null);
    setSelectedShapeId(null);
    setStartedAt(null);
    clearProgress();
  };

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


  // Get cell info based on placed shapes (or imported shapes when previewing)
  const getCellInfo = useCallback(
    (row: number, col: number): { color: string; shapeId: string } | null => {
      const shapes = viewingImported ? importedShapes : placedShapes;
      const rotations = viewingImported ? importedRotations : shapeRotations;
      for (const placed of shapes) {
        const cells = rotations[placed.id];
        for (const [r, c] of cells) {
          if (placed.gridRow + r === row && placed.gridCol + c === col) {
            return { color: placed.color, shapeId: placed.id };
          }
        }
      }
      return null;
    },
    [
      placedShapes,
      shapeRotations,
      viewingImported,
      importedShapes,
      importedRotations,
    ]
  );

  // Export grid state as a 56-character string (7 cols × 8 rows)
  // Format: Shape letters (L,J,T,S,Z,I,O,P,U,V), '.' for empty, '#' for blocked
  const exportSolution = useCallback((): string => {
    let result = "";
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 7; col++) {
        const cell = grid[row]?.[col];
        if (!cell || cell.isBlocked) {
          result += "#";
        } else {
          const cellInfo = getCellInfo(row, col);
          result += cellInfo ? cellInfo.shapeId : ".";
        }
      }
    }
    return result;
  }, [grid, getCellInfo]);

  // Import solution from a 56-character string
  const importSolution = useCallback(
    (
      solutionStr: string
    ): {
      success: boolean;
      error?: string;
      shapes?: PlacedShape[];
      rotations?: Record<string, ShapeMatrix>;
    } => {
      // Validate length
      if (solutionStr.length !== 56) {
        return {
          success: false,
          error: `Invalid length: ${solutionStr.length} (expected 56)`,
        };
      }

      // Parse the string into a grid map
      const shapePositions: Record<string, Array<[number, number]>> = {};

      for (let i = 0; i < 56; i++) {
        const row = Math.floor(i / 7);
        const col = i % 7;
        const char = solutionStr[i].toUpperCase();

        if (char !== "." && char !== "#") {
          if (!shapePositions[char]) {
            shapePositions[char] = [];
          }
          shapePositions[char].push([row, col]);
        }
      }

      // Validate each shape
      const validShapeIds = SHAPES.map((s) => s.id);
      const newPlacedShapes: PlacedShape[] = [];
      const newRotations: Record<string, ShapeMatrix> = {};

      for (const [shapeId, positions] of Object.entries(shapePositions)) {
        // Check if it's a valid shape ID
        if (!validShapeIds.includes(shapeId)) {
          return { success: false, error: `Unknown shape: ${shapeId}` };
        }

        const shape = SHAPES.find((s) => s.id === shapeId)!;

        // Check cell count matches
        const expectedCells = shape.cells.length;
        if (positions.length !== expectedCells) {
          return {
            success: false,
            error: `Shape ${shapeId} has ${positions.length} cells (expected ${expectedCells})`,
          };
        }

        // Find the top-left corner (overall min row and min col)
        const minRow = Math.min(...positions.map(([r]) => r));
        const minCol = Math.min(...positions.map(([, c]) => c));

        // Compute cells relative to top-left
        const relativeCells: ShapeMatrix = positions.map(([r, c]) => [
          r - minRow,
          c - minCol,
        ]);

        // Normalize the cells (sort for comparison)
        const normalizeForCompare = (cells: ShapeMatrix): string =>
          [...cells]
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
            .map(([r, c]) => `${r},${c}`)
            .join("|");

        const normalizedInput = normalizeForCompare(relativeCells);

        // Try to find a matching rotation
        let foundRotation: ShapeMatrix | null = null;
        let testCells = shape.cells;

        for (let rot = 0; rot < 4; rot++) {
          // Normalize and compare
          const normalized = normalizeShape(testCells);
          if (normalizeForCompare(normalized) === normalizedInput) {
            foundRotation = normalized;
            break;
          }
          // Also try flipped
          const flipped = normalizeShape(flipShape(testCells));
          if (normalizeForCompare(flipped) === normalizedInput) {
            foundRotation = flipped;
            break;
          }
          // Rotate for next iteration
          testCells = rotateShape(testCells);
        }

        if (!foundRotation) {
          return {
            success: false,
            error: `Shape ${shapeId} cells don't match any valid rotation`,
          };
        }

        newPlacedShapes.push({
          ...shape,
          gridRow: minRow,
          gridCol: minCol,
          cells: foundRotation,
        });
        newRotations[shapeId] = foundRotation;
      }

      // Return the parsed solution (don't apply directly)
      return {
        success: true,
        shapes: newPlacedShapes,
        rotations: newRotations,
      };
    },
    []
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
    if (!dragState || !dragState.hasMoved || !dragCell) return null;

    const cells = shapeRotations[dragState.shapeId];
    const shape = SHAPES.find((s) => s.id === dragState.shapeId)!;
    const isValid = isValidPlacement(dragState.shapeId, dragCell.row, dragCell.col);

    return {
      gridRow: dragCell.row,
      gridCol: dragCell.col,
      cells,
      color: shape.color,
      isValid,
    };
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

      // Long-press (no movement) flips the shape
      longPressFired.current = false;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        setSelectedShapeId(shapeId);
        handleFlip(shapeId);
        hapticPlace();
      }, LONG_PRESS_MS);

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
        // selectedShapeId still holds the pre-press value here: the eager
        // select in the piece's own onPointerDown hasn't re-rendered yet
        wasSelected: selectedShapeId === shapeId,
      });
    },
    [cellSize, handleFlip, selectedShapeId]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      e.preventDefault();

      const dx = Math.abs(e.clientX - dragState.startX);
      const dy = Math.abs(e.clientY - dragState.startY);
      const shouldStartDrag = dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD;

      // Real movement cancels the long-press flip
      if (shouldStartDrag && longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      // If this is the first real movement and shape is from grid, remove it now
      if (shouldStartDrag && !dragState.hasMoved && dragState.isFromGrid) {
        setPlacedShapes((prev) =>
          prev.filter((p) => p.id !== dragState.shapeId)
        );
      }

      // Move the drag ghost with direct DOM writes; re-rendering the whole
      // component on every pointer move makes dragging feel laggy.
      ghostPos.current = {
        x: e.clientX - dragState.offsetX,
        y: e.clientY - dragState.offsetY,
      };
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(${ghostPos.current.x}px, ${ghostPos.current.y}px, 0)`;
      }

      // State only changes on the hasMoved transition (once per drag)...
      if (!dragState.hasMoved && shouldStartDrag) {
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                currentX: e.clientX,
                currentY: e.clientY,
                hasMoved: true,
              }
            : null
        );
      }

      // ...and when the targeted grid cell changes (drives the hover preview)
      if ((dragState.hasMoved || shouldStartDrag) && gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const x = e.clientX - gridRect.left - dragState.offsetX + cellSize / 2;
        const y = e.clientY - gridRect.top - dragState.offsetY + cellSize / 2;
        const gridCol = Math.floor(x / cellSize);
        const gridRow = Math.floor(y / cellSize);
        setDragCell((prev) =>
          prev && prev.row === gridRow && prev.col === gridCol
            ? prev
            : { row: gridRow, col: gridCol }
        );
      }
    },
    [dragState, cellSize]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      setDragCell(null);
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (!dragState || !gridRef.current) {
        setDragState(null);
        return;
      }

      // No movement: long-press already flipped; otherwise a tap selects,
      // and tapping a shape that was already selected rotates it
      if (!dragState.hasMoved) {
        if (!longPressFired.current) {
          if (dragState.wasSelected) {
            handleRotate(dragState.shapeId);
          } else {
            setSelectedShapeId(dragState.shapeId);
          }
        }
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
        hapticPlace();
        setPlacedShapes((prev) => [
          ...prev,
          { ...shape, cells: shapeRotations[shape.id], gridRow, gridCol },
        ]);
      } else if (gridRow >= 0 && gridRow < 8 && gridCol >= 0 && gridCol < 7) {
        // Attempted a placement on the board but it was invalid
        // (dropping outside the board is just returning the piece)
        hapticInvalid();
      }

      setDragState(null);
    },
    [dragState, cellSize, isValidPlacement, shapeRotations, handleRotate]
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
        className={`relative cursor-grab active:cursor-grabbing`}
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
  const isViewingHistory = viewingDate !== null || viewingImported;

  return (
    <motion.div
      // relative + w-full: the toolbar below is absolute w-full, and without
      // an explicit positioned full-width ancestor its containing block
      // FLIPS between the viewport and this container while framer-motion
      // animates (transient will-change/transform) — visibly snapping the
      // toolbar pills outward at every fade's end.
      className="relative w-full flex flex-col items-center gap-4 p-4 h-full select-none max-h-dvh overflow-hidden"
      initial={{ opacity: 0 }}
      // Stay invisible until mount effects settle (mobile sizing, saved
      // username, restored progress) AND fonts are loaded, so the reveal
      // is one stable fade instead of visibly reflowing corners.
      animate={{ opacity: revealed ? 1 : 0 }}
      transition={{ duration: 0.4 }}
      style={{
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        setDragState(null);
        setDragCell(null);
      }}
    >
      {/* Plain div on purpose: a nested opacity animation inside the
          already-fading container makes WebKit promote and then tear down
          a compositing layer mid-fade, which re-rasterizes the pill
          buttons' rounded ends — visible as edge flicker on launch. The
          container's single fade covers this element. */}
      {/* No safe-area padding here: the container already sits inside the
          body's safe-area padding, so it would double-apply. */}
      <div className="absolute top-0 left-0 p-2 flex gap-2 items-start w-full justify-between">
        <div className="flex gap-2 px-2 p-1">
          <button
            onClick={() => {
              const url = viewingDate
                ? `/leaderboard?day=${viewingDate}`
                : "/leaderboard";
              router.push(url);
            }}
            className="icon-button"
          >
            ← Leaderboard
          </button>
          <button
            onClick={() => setShowHelpModal(true)}
            className="icon-button"
            title="Help & Hotkeys"
          >
            Help
          </button>
        </div>
        <div className="flex items-start gap-2">
          {/* Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="icon-button h-8"
            title="Settings"
          >
            {/* Flat 6-tooth gear: ring + 6 teeth rotated 60° apart */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              />
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <rect
                  key={angle}
                  x="10.2"
                  y="1"
                  width="3.6"
                  height="5"
                  rx="1"
                  transform={`rotate(${angle} 12 12)`}
                />
              ))}
            </svg>
          </button>
          {/* Username display */}
          {currentUsername && (
            <button
              onClick={() => {
                setModalMode("edit");
                setShowSolveModal(true);
              }}
              className="px-2 py-1 rounded-md bg-stone-800 text-white hover:bg-stone-700 font-mono tracking-wider"
              title="Click to change name"
            >
              {currentUsername}
            </button>
          )}
        </div>
      </div>

      <div className={`flex flex-col gap-4 items-center justify-center h-full`}>
        {/* Header */}
        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h1 className="text-xl font-light tracking-wide text-stone-700">
            {month} {dayNum}, {dayWord}
            {!viewingImported ? (
              <>
                {" · "}
                {viewingDate
                  ? formatTime(
                      history[viewingDate]
                        ? getSolveTime(history[viewingDate])
                        : 0
                    )
                  : formatTime(
                      isSolved && finalTime !== null ? finalTime : elapsedTime
                    )}
              </>
            ) : previewSolution?.timeElapsed !== undefined ? (
              <>
                {" · "}
                {formatTime(Math.floor(previewSolution.timeElapsed / 1000))}
              </>
            ) : null}
            {viewingImported ? (
              <motion.div
                key="preview"
                className="flex flex-col items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className="text-lg font-medium text-blue-600">
                  {previewSolution?.username
                    ? `${previewSolution.username}'s solution`
                    : "Preview"}
                </span>
              </motion.div>
            ) : isSolved || isViewingHistory ? (
              <motion.div
                key="solved"
                className="flex flex-col items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className="text-lg font-medium text-green-600">
                  {isViewingHistory ? "✓ Solved" : "🎉 Congratulations!"}
                </span>
                {(() => {
                  const dayKey = viewingDate ?? getDateKey(currentDate);
                  const state = history[dayKey];
                  return state ? (
                    <button
                      onClick={async () => {
                        const result = await shareSolve(
                          state.day,
                          state.timeElapsed
                        );
                        if (result === "copied") {
                          setShareStatus("copied!");
                          setTimeout(() => setShareStatus(null), 2000);
                        }
                      }}
                      className="px-2 py-0.5 text-sm whitespace-nowrap rounded-full bg-stone-300 hover:bg-stone-400 text-stone-600 transition-colors"
                      title="Share your solve"
                    >
                      {shareStatus ?? "Share"}
                    </button>
                  ) : null;
                })()}
              </motion.div>
            ) : null}
          </h1>
          <DifficultyBar date={displayDate} />
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
                return (
                  <motion.div
                    key={`${rowIdx}-${colIdx}`}
                    className={`absolute flex items-center justify-center font-medium pointer-events-none
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
                      className="relative z-[1] px-6 py-3 rounded-full bg-stone-800 text-white"
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

        {/* Shape palette - always visible */}
        {!isViewingHistory && isPlaying && !isSolved && (
          <motion.div
            className="flex w-full items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="flex gap-2 sm:gap-3 px-2 flex-wrap justify-center">
              {SHAPES.map((shape) => {
                const cells = shapeRotations[shape.id];
                // Only dim once a real drag is underway; a plain tap also
                // creates dragState and would otherwise blink the tile
                const isDraggingThis =
                  dragState?.shapeId === shape.id && dragState.hasMoved;
                const isSelected = selectedShapeId === shape.id;
                const isPlaced = isShapePlaced(shape.id);
                // Fixed square slot: every shape fits in 4x4 palette cells in
                // any orientation, so rotate/flip never reflows the palette
                const slotSize = 4 * paletteCellSize + 8;

                return (
                  <motion.div
                    key={shape.id}
                    ref={(el) => {
                      shapeRefs.current[shape.id] = el;
                    }}
                    className={`flex items-center justify-center rounded-md cursor-pointer transition-all ${
                      isSelected ? "bg-stone-300/60" : "hover:bg-stone-300/40"
                    }`}
                    style={{ width: slotSize, height: slotSize }}
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
                        filter: isPlaced ? "grayscale(1)" : "none",
                      },
                      paletteCellSize
                    )}
                  </motion.div>
                );
              })}
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
                className={`w-7 h-7 sm:w-8 sm:h-8 text-lg sm:text-xl flex items-center justify-center rounded text-sm transition-colors bg-stone-300 hover:bg-stone-400 active:bg-stone-400 text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed`}
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
                className={`w-7 h-7 sm:w-8 sm:h-8 text-lg sm:text-xl flex items-center justify-center rounded text-sm transition-colors bg-stone-300 hover:bg-stone-400 active:bg-stone-400 text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed`}
                title="Flip selected shape (F)"
              >
                ⇆
              </button>
            </div>
          </motion.div>
        )}

        {/* Dragging preview - only show after movement threshold.
            Outer div is positioned via direct DOM writes in handlePointerMove;
            the inner motion.div only animates opacity/scale. */}
        <AnimatePresence>
          {dragState && dragState.hasMoved && (
            <div
              ref={ghostRef}
              className="fixed top-0 left-0 pointer-events-none z-50"
              style={{
                transform: `translate3d(${ghostPos.current.x}px, ${ghostPos.current.y}px, 0)`,
                willChange: "transform",
              }}
            >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.8, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.1 }}
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
            </div>
          )}
        </AnimatePresence>

        {/* Leaderboard submission modal */}
        <SolveModal
          isOpen={showSolveModal}
          onClose={() => {
            setShowSolveModal(false);
            // Refresh username after modal closes
            const saved = getSavedUsername();
            setCurrentUsername(saved);
          }}
          mode={modalMode}
          onSubmit={
            modalMode === "submit"
              ? async (username: string) => {
                  if (!pendingSolution) throw new Error("No pending solution");
                  const solutionId = await submitSolution({
                    username,
                    grid: pendingSolution.grid,
                    day: pendingSolution.day,
                    startedAt: pendingSolution.startedAt,
                    timeElapsed: pendingSolution.timeElapsed,
                  });
                  return { solutionId, grid: pendingSolution.grid };
                }
              : undefined
          }
        />

        {/* Help Modal */}
        <AnimatePresence>
          {showHelpModal && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute inset-0 bg-black/50"
                onClick={closeHelpModal}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.div
                className="relative bg-white rounded-lg p-6 max-w-md w-full"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              >
                <h2 className="text-xl font-bold text-stone-800 mb-4">
                  How to Play
                </h2>
                <div className="text-stone-600 space-y-3 mb-4">
                  <p>
                    Fill the calendar grid using all 10 shapes without covering
                    today&apos;s date (month, day, and day of the week).
                  </p>
                  <p>
                    Drag shapes onto the grid; drag a shape off the grid to
                    remove it.
                  </p>
                </div>
                <h3 className="font-bold text-stone-800 mb-2">
                  Mobile Controls
                </h3>
                <ul className="text-stone-600 space-y-1 mb-4 list-disc pl-5">
                  <li>Tap to select a piece</li>
                  <li>Tap again to rotate</li>
                  <li>Press and hold to flip</li>
                </ul>
                <h3 className="font-bold text-stone-800 mb-2">
                  Keyboard Shortcuts
                </h3>
                <div className="text-stone-600 space-y-1 mb-4 font-mono text-sm">
                  <p>
                    <span className="inline-block w-24 text-stone-500">R</span>
                    Rotate
                  </p>
                  <p>
                    <span className="inline-block w-24 text-stone-500">F</span>
                    Flip
                  </p>
                  <p>
                    <span className="inline-block w-24 text-stone-500">
                      Backspace
                    </span>
                    Remove
                  </p>
                  <p>
                    <span className="inline-block w-24 text-stone-500">
                      Delete / X
                    </span>
                    Remove
                  </p>
                </div>
                <button
                  onClick={closeHelpModal}
                  className="w-full px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white transition-colors"
                >
                  Got it
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettingsModal && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute inset-0 bg-black/50"
                onClick={() => setShowSettingsModal(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.div
                className="relative bg-white rounded-lg p-6 max-w-sm w-full"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              >
                <h2 className="text-xl font-bold text-stone-800 mb-4">
                  Settings
                </h2>
                <div className="space-y-4 mb-6">
                  {nativeUI && (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-600">
                          Daily reminder (9:00 AM)
                        </span>
                        <button
                          onClick={async () => {
                            const status = await setReminderEnabled(
                              !reminderOn
                            );
                            setReminderOn(status === "on");
                            setReminderHint(
                              status === "denied"
                                ? "Notifications are turned off for Caladay. Enable them in the iOS Settings app, then try again."
                                : status === "error"
                                  ? "Couldn't set the reminder. Please try again."
                                  : null
                            );
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            reminderOn ? "bg-green-500" : "bg-stone-300"
                          }`}
                          title={
                            reminderOn
                              ? "Turn off daily reminder"
                              : "Turn on daily reminder"
                          }
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                              reminderOn ? "left-[22px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>
                      {reminderHint && (
                        <div className="mt-1">
                          <p className="text-xs text-red-500">
                            {reminderHint}
                          </p>
                          {reminderHint.includes("Settings") && (
                            <button
                              onClick={openAppSettings}
                              className="text-xs underline text-stone-500 hover:text-stone-700 mt-0.5"
                            >
                              Open Settings
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!nativeUI && (
                    <div className="flex items-center justify-between">
                      <span className="text-stone-600">On iPhone?</span>
                      <a
                        href="https://apps.apple.com/app/id6798105948"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 rounded-full bg-stone-800 hover:bg-stone-900 text-white transition-colors"
                      >
                        Get the app
                      </a>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600">Something wrong?</span>
                    <a
                      href="mailto:cabbagetree876@gmail.com?subject=Caladay%20report"
                      className="px-3 py-1 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-600 transition-colors"
                    >
                      Report a problem
                    </a>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="w-full px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white transition-colors"
                >
                  Done
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Duplicate Solution Modal */}
        <AnimatePresence>
          {showDuplicateModal && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute inset-0 bg-black/50"
                onClick={() => setShowDuplicateModal(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.div
                className="relative bg-white rounded-lg p-6 max-w-sm w-full text-center"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              >
                <p className="text-4xl mb-3">🎉</p>
                <h2 className="text-xl font-bold text-stone-800 mb-2">
                  You solved it again!
                </h2>
                <p className="text-stone-600 mb-4">
                  This solution is the same as one you&apos;ve already
                  submitted, so it won&apos;t appear on the leaderboard again.
                </p>
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  className="w-full px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white transition-colors"
                >
                  OK
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col gap-2 items-center"
        >
          <p className="text-stone-400 text-center">
            {isViewingHistory
              ? "Viewing previous solve"
              : isSolved
                ? "Play again tomorrow!"
                : isPlaying
                  ? `Use all shapes without touching the current day`
                  : elapsedTime > 0
                    ? "Press Resume to continue"
                    : "Press Start to begin"}
          </p>
          <div className="gap-2 items-center flex">
            {(placedShapes.length > 0 || isSolved) && (
              <motion.button onClick={resetToday} className="icon-button">
                Reset
              </motion.button>
            )}
            {isPlaying && !isSolved && (
              <motion.button
                onClick={() => setIsPlaying(false)}
                className="icon-button"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                Pause
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
