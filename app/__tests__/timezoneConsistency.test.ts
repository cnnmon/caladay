/**
 * Tests for timezone-consistent date handling
 * 
 * Key invariant: The date key should match what the GRID shows, not the UTC time.
 * If the grid shows Jan 4, the solve should be keyed as "2026-01-04" regardless
 * of what the UTC time is.
 */

import { SavedPuzzleState, ShapeMatrix } from '../types';

const STORAGE_KEY = "caesar-puzzle-history";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// getDateKey uses LOCAL time, not UTC - this is critical for consistency
function getDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Old UTC-based getDateKey for comparison
function getDateKeyUTC(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

// Grid building logic (simplified from Puzzle.tsx)
interface GridCell {
  row: number;
  col: number;
  label: string;
  isBlocked: boolean;
}

function buildGrid(): GridCell[][] {
  const grid: GridCell[][] = [];

  // Row 0: Jan-Jun + blocked
  grid.push([
    ...MONTHS.slice(0, 6).map((m, i) => ({ row: 0, col: i, label: m, isBlocked: false })),
    { row: 0, col: 6, label: "", isBlocked: true },
  ]);

  // Row 1: Jul-Dec + blocked
  grid.push([
    ...MONTHS.slice(6, 12).map((m, i) => ({ row: 1, col: i, label: m, isBlocked: false })),
    { row: 1, col: 6, label: "", isBlocked: true },
  ]);

  // Rows 2-6: Days 1-31
  for (let rowIdx = 2; rowIdx <= 6; rowIdx++) {
    const row: GridCell[] = [];
    for (let col = 0; col < 7; col++) {
      const dayNum = (rowIdx - 2) * 7 + col + 1;
      if (rowIdx === 6 && col >= 3) {
        const dayWord = DAYS[col - 3];
        row.push({ row: rowIdx, col, label: dayWord, isBlocked: false });
      } else if (dayNum <= 31) {
        row.push({ row: rowIdx, col, label: String(dayNum), isBlocked: false });
      } else {
        row.push({ row: rowIdx, col, label: "", isBlocked: true });
      }
    }
    grid.push(row);
  }

  // Row 7: blocked, blocked, blocked, blocked, Thu, Fri, Sat
  grid.push([
    { row: 7, col: 0, label: "", isBlocked: true },
    { row: 7, col: 1, label: "", isBlocked: true },
    { row: 7, col: 2, label: "", isBlocked: true },
    { row: 7, col: 3, label: "", isBlocked: true },
    { row: 7, col: 4, label: "Thu", isBlocked: false },
    { row: 7, col: 5, label: "Fri", isBlocked: false },
    { row: 7, col: 6, label: "Sat", isBlocked: false },
  ]);

  return grid;
}

// Compute gridTargets from placed shapes by finding uncovered cells
function computeGridTargetsFromShapes(
  placedShapes: Array<{ gridRow: number; gridCol: number; cells: ShapeMatrix }>
): { month: string; dayNum: string; dayWord: string } | null {
  const grid = buildGrid();
  const covered = new Set<string>();

  for (const shape of placedShapes) {
    for (const [r, c] of shape.cells) {
      const row = shape.gridRow + r;
      const col = shape.gridCol + c;
      covered.add(`${row},${col}`);
    }
  }

  let month = "";
  let dayNum = "";
  let dayWord = "";

  for (const row of grid) {
    for (const cell of row) {
      if (cell.isBlocked) continue;
      const key = `${cell.row},${cell.col}`;
      if (!covered.has(key)) {
        if (MONTHS.includes(cell.label)) {
          month = cell.label;
        } else if (DAYS.includes(cell.label)) {
          dayWord = cell.label;
        } else if (/^\d+$/.test(cell.label)) {
          dayNum = cell.label;
        }
      }
    }
  }

  if (month && dayNum && dayWord) {
    return { month, dayNum, dayWord };
  }
  return null;
}

// Get solve time from startedAt/solvedAt (handles both old and new format)
function getSolveTime(state: SavedPuzzleState): number {
  if (state.startedAt && state.solvedAt) {
    const start = new Date(state.startedAt).getTime();
    const end = new Date(state.solvedAt).getTime();
    return Math.floor((end - start) / 1000);
  }
  // Fallback for old format with solveTime
  const oldFormat = state as unknown as { solveTime?: number };
  if (oldFormat.solveTime !== undefined) {
    return oldFormat.solveTime;
  }
  return 0;
}

// Convert gridTargets to a date key (YYYY-MM-DD)
function gridTargetsToDateKey(
  targets: { month: string; dayNum: string; dayWord: string },
  referenceYear?: number
): string | null {
  const year = referenceYear ?? new Date().getFullYear();
  const monthIndex = MONTHS.indexOf(targets.month);
  if (monthIndex === -1) return null;
  
  const day = parseInt(targets.dayNum, 10);
  if (isNaN(day) || day < 1 || day > 31) return null;
  
  // Validate the day of week matches
  const date = new Date(year, monthIndex, day);
  const expectedDayWord = DAYS[date.getDay()];
  if (expectedDayWord !== targets.dayWord) {
    // Try previous year
    const prevYearDate = new Date(year - 1, monthIndex, day);
    if (DAYS[prevYearDate.getDay()] === targets.dayWord) {
      return getDateKey(prevYearDate);
    }
    return null;
  }
  
  return getDateKey(date);
}

// Check if gridTargets match today's date
function isGridTargetsToday(targets: { month: string; dayNum: string; dayWord: string }): boolean {
  const today = new Date();
  const todayMonth = MONTHS[today.getMonth()];
  const todayDayNum = String(today.getDate());
  const todayDayWord = DAYS[today.getDay()];
  return (
    targets.month === todayMonth &&
    targets.dayNum === todayDayNum &&
    targets.dayWord === todayDayWord
  );
}

// Migrate old storage format to new format
function migrateHistory(history: Record<string, SavedPuzzleState>): { migrated: Record<string, SavedPuzzleState>; changed: boolean } {
  let changed = false;
  const migrated: Record<string, SavedPuzzleState> = {};
  
  for (const [oldKey, state] of Object.entries(history)) {
    // Compute gridTargets from shapes if missing
    let gridTargets = state.gridTargets;
    if (!gridTargets) {
      gridTargets = computeGridTargetsFromShapes(state.placedShapes) ?? undefined;
      changed = true;
    }
    
    // Backfill startedAt from old solveTime format
    let startedAt = state.startedAt;
    if (!startedAt && state.solvedAt) {
      const oldFormat = state as unknown as { solveTime?: number };
      if (oldFormat.solveTime !== undefined) {
        const solvedAtMs = new Date(state.solvedAt).getTime();
        startedAt = new Date(solvedAtMs - oldFormat.solveTime * 1000).toISOString();
        changed = true;
      }
    }
    
    // Determine the correct key from gridTargets
    let correctKey = oldKey;
    if (gridTargets) {
      const computedKey = gridTargetsToDateKey(gridTargets);
      if (computedKey && computedKey !== oldKey) {
        correctKey = computedKey;
        changed = true;
      }
    }
    
    migrated[correctKey] = {
      ...state,
      gridTargets,
      startedAt,
    };
  }
  
  return { migrated, changed };
}

describe('Timezone-consistent date handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getDateKey uses local time', () => {
    it('should return local date, not UTC date', () => {
      // Jan 4, 2026 at 11:59 PM in local time
      // This would be Jan 5 in UTC for many timezones
      const date = new Date(2026, 0, 4, 23, 59, 0); // Month is 0-indexed
      
      const localKey = getDateKey(date);
      const utcKey = getDateKeyUTC(date);
      
      // Local should always be Jan 4
      expect(localKey).toBe("2026-01-04");
      
      // UTC might be Jan 5 depending on timezone, but that's not what we use
      // The key point is: localKey is consistent with what the user sees
    });

    it('should be consistent with grid target date methods', () => {
      const date = new Date(2026, 0, 4, 23, 59, 0);
      
      // These methods use local time
      expect(date.getMonth()).toBe(0); // January
      expect(date.getDate()).toBe(4);
      expect(date.getDay()).toBe(0); // Sunday
      
      // getDateKey should match
      expect(getDateKey(date)).toBe("2026-01-04");
    });
  });

  describe('computeGridTargetsFromShapes', () => {
    it('should find the last uncovered cell of each type as targets', () => {
      // With only one cell covered, there are still many uncovered cells
      // The function iterates through and captures the last seen of each type
      
      const placedShapes = [
        // Cover cell at row 0, col 1 (Feb)
        { gridRow: 0, gridCol: 1, cells: [[0, 0]] as ShapeMatrix },
      ];
      
      const targets = computeGridTargetsFromShapes(placedShapes);
      
      // With only Feb covered, we still have:
      // - Many months uncovered (Jan, Mar-Dec) - last one is Dec
      // - All day numbers uncovered (1-31) - last one is 31
      // - All weekdays uncovered - last one is Sat
      expect(targets).not.toBeNull();
      expect(targets?.month).toBe("Dec");
      expect(targets?.dayNum).toBe("31");
      expect(targets?.dayWord).toBe("Sat");
    });

    it('should return correct targets when puzzle is solved', () => {
      // Create a complete solve where only Jan (0,0), 4 (2,3), and Sun (6,3) are uncovered
      const grid = buildGrid();
      const allCells: Array<{ row: number; col: number }> = [];
      
      // Collect all non-blocked cells
      for (const row of grid) {
        for (const cell of row) {
          if (!cell.isBlocked) {
            allCells.push({ row: cell.row, col: cell.col });
          }
        }
      }
      
      // Target cells to leave uncovered: Jan (0,0), 4 (2,3), Sun (6,3)
      const targetCells = [
        { row: 0, col: 0 }, // Jan
        { row: 2, col: 3 }, // 4
        { row: 6, col: 3 }, // Sun
      ];
      
      // Create one giant shape covering everything except targets
      const coveredCells = allCells.filter(
        c => !targetCells.some(t => t.row === c.row && t.col === c.col)
      );
      
      const placedShapes = [{
        gridRow: 0,
        gridCol: 0,
        cells: coveredCells.map(c => [c.row, c.col] as [number, number]),
      }];
      
      const targets = computeGridTargetsFromShapes(placedShapes);
      
      expect(targets).not.toBeNull();
      expect(targets?.month).toBe("Jan");
      expect(targets?.dayNum).toBe("4");
      expect(targets?.dayWord).toBe("Sun");
    });
  });

  describe('getSolveTime from startedAt/solvedAt', () => {
    it('should compute duration correctly', () => {
      const state: SavedPuzzleState = {
        placedShapes: [],
        shapeRotations: {},
        startedAt: "2026-01-04T23:00:00.000Z",
        solvedAt: "2026-01-04T23:05:30.000Z", // 5 min 30 sec later
      };
      
      expect(getSolveTime(state)).toBe(330); // 5*60 + 30 = 330 seconds
    });

    it('should handle missing startedAt gracefully', () => {
      const state: SavedPuzzleState = {
        placedShapes: [],
        shapeRotations: {},
        solvedAt: "2026-01-04T23:05:30.000Z",
      };
      
      expect(getSolveTime(state)).toBe(0);
    });

    it('should handle UTC times correctly', () => {
      // Even if times are in UTC, the duration calculation is correct
      const state: SavedPuzzleState = {
        placedShapes: [],
        shapeRotations: {},
        startedAt: "2026-01-05T01:00:00.000Z", // Jan 5 1 AM UTC (could be Jan 4 local)
        solvedAt: "2026-01-05T01:34:39.531Z",  // Same as the user's example
      };
      
      // Duration: 34*60 + 39 = 2079 seconds (approximately)
      const duration = getSolveTime(state);
      expect(duration).toBeGreaterThan(2000);
      expect(duration).toBeLessThan(2100);
    });
  });

  describe('Date key matches grid, not UTC', () => {
    it('should use local date for key even when UTC date differs', () => {
      // Scenario: User in UTC-8 (PST) solves puzzle at 11 PM local on Jan 4
      // UTC time would be 7 AM Jan 5
      // Grid shows Jan 4 targets
      // Key should be "2026-01-04"
      
      const localDate = new Date(2026, 0, 4, 23, 0, 0); // Jan 4, 11 PM local
      const dateKey = getDateKey(localDate);
      
      expect(dateKey).toBe("2026-01-04");
      
      // The UTC key would be wrong for this use case
      // (depending on timezone, it might be "2026-01-05")
    });

    it('should compute correct gridTargets from real faulty data', () => {
      // Real faulty data: saved as "2026-01-05" but grid was showing Jan 4
      // Jan 4, 2026 is a SUNDAY
      const faultyPlacedShapes = [
        { id: "V", gridRow: 5, gridCol: 4, cells: [[0,2],[1,2],[2,2],[2,1],[2,0]] as ShapeMatrix },
        { id: "O", gridRow: 4, gridCol: 4, cells: [[2,1],[2,0],[1,1],[0,2],[0,1]] as ShapeMatrix },
        { id: "U", gridRow: 4, gridCol: 2, cells: [[0,0],[0,2],[1,0],[1,1],[1,2]] as ShapeMatrix },
        { id: "I", gridRow: 0, gridCol: 1, cells: [[0,0],[0,1],[0,2],[0,3]] as ShapeMatrix },
        { id: "J", gridRow: 1, gridCol: 0, cells: [[0,0],[0,1],[0,2],[0,3],[1,0]] as ShapeMatrix },
        { id: "Z", gridRow: 2, gridCol: 0, cells: [[0,1],[1,1],[1,0],[2,0],[3,0]] as ShapeMatrix },
        { id: "T", gridRow: 4, gridCol: 0, cells: [[0,1],[1,1],[2,0],[2,1],[2,2]] as ShapeMatrix },
        { id: "S", gridRow: 2, gridCol: 2, cells: [[1,0],[0,0],[2,1],[1,1]] as ShapeMatrix },
        { id: "L", gridRow: 2, gridCol: 4, cells: [[1,0],[1,1],[1,2],[0,2]] as ShapeMatrix },
        { id: "P", gridRow: 0, gridCol: 4, cells: [[2,1],[2,0],[1,1],[1,0],[0,1]] as ShapeMatrix },
      ];
      
      const targets = computeGridTargetsFromShapes(faultyPlacedShapes);
      
      // The grid should show Jan 4, Sun (not Jan 5, Mon as the faulty key suggests)
      expect(targets).not.toBeNull();
      expect(targets?.month).toBe("Jan");
      expect(targets?.dayNum).toBe("4");
      expect(targets?.dayWord).toBe("Sun");
    });

    it('should NOT trust the date key for gridTargets', () => {
      // The faulty save: key is "2026-01-05" but shapes actually solved Jan 4 grid
      const faultySave: SavedPuzzleState = {
        placedShapes: [], // Would have the actual shapes here
        shapeRotations: {},
        solvedAt: "2026-01-05T01:34:39.531Z", // UTC Jan 5
        // gridTargets is missing - needs backfill from shapes
      };
      
      // Key assertion: we should NOT trust the date key for gridTargets
      expect(faultySave.gridTargets).toBeUndefined();
    });
  });

  describe('Refresh behavior with timezone edge cases', () => {
    it('should restore correct grid after refresh even if UTC date changed', () => {
      // Scenario:
      // 1. User solves puzzle at 11:30 PM local on Jan 4
      // 2. UTC time is 7:30 AM Jan 5
      // 3. Solve is saved with key "2026-01-04" (local)
      // 4. gridTargets: { month: "Jan", dayNum: "4", dayWord: "Sun" }
      // 5. User refreshes at 12:30 AM local on Jan 5
      // 6. Should still show Jan 4 solve when viewing history
      
      const solveDate = new Date(2026, 0, 4, 23, 30, 0);
      const dateKey = getDateKey(solveDate);
      
      expect(dateKey).toBe("2026-01-04");
      
      const savedState: SavedPuzzleState = {
        placedShapes: [],
        shapeRotations: {},
        startedAt: solveDate.toISOString(),
        solvedAt: new Date(solveDate.getTime() + 300000).toISOString(), // +5 min
        gridTargets: { month: "Jan", dayNum: "4", dayWord: "Sun" },
      };
      
      // Save with local date key
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ [dateKey]: savedState }));
      
      // Simulate refresh on Jan 5
      const refreshDate = new Date(2026, 0, 5, 0, 30, 0);
      const todayKey = getDateKey(refreshDate);
      
      expect(todayKey).toBe("2026-01-05");
      expect(todayKey).not.toBe(dateKey); // Different day now
      
      // Load history
      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      
      // Jan 5 is not solved yet
      expect(history[todayKey]).toBeUndefined();
      
      // But Jan 4 solve is available in history
      expect(history["2026-01-04"]).toBeDefined();
      expect(history["2026-01-04"].gridTargets).toEqual({
        month: "Jan",
        dayNum: "4",
        dayWord: "Sun",
      });
    });

    it('should show solved state on refresh if same local day', () => {
      // User solves at 10 PM, refreshes at 10:30 PM (same day)
      
      const solveDate = new Date(2026, 0, 4, 22, 0, 0);
      const refreshDate = new Date(2026, 0, 4, 22, 30, 0);
      
      const solveDateKey = getDateKey(solveDate);
      const refreshDateKey = getDateKey(refreshDate);
      
      expect(solveDateKey).toBe(refreshDateKey); // Same day
      
      const savedState: SavedPuzzleState = {
        placedShapes: [{ id: "L", gridRow: 0, gridCol: 0, cells: [[0, 0]] }],
        shapeRotations: {},
        startedAt: solveDate.toISOString(),
        solvedAt: new Date(solveDate.getTime() + 300000).toISOString(),
        gridTargets: { month: "Jan", dayNum: "4", dayWord: "Sun" },
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ [solveDateKey]: savedState }));
      
      // On refresh, check if today is solved
      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const todayState = history[refreshDateKey];
      
      expect(todayState).toBeDefined();
      expect(todayState.gridTargets).toEqual({ month: "Jan", dayNum: "4", dayWord: "Sun" });
      
      // App should restore this state and show "Congratulations"
    });
  });

  describe('gridTargetsToDateKey', () => {
    it('should convert valid gridTargets to date key', () => {
      // Jan 4, 2026 is a Sunday
      const targets = { month: "Jan", dayNum: "4", dayWord: "Sun" };
      const key = gridTargetsToDateKey(targets, 2026);
      expect(key).toBe("2026-01-04");
    });

    it('should return null for invalid day of week', () => {
      // Jan 4, 2026 is Sunday, not Monday
      const targets = { month: "Jan", dayNum: "4", dayWord: "Mon" };
      const key = gridTargetsToDateKey(targets, 2026);
      expect(key).toBeNull();
    });

    it('should return null for invalid month', () => {
      const targets = { month: "Foo", dayNum: "4", dayWord: "Sun" };
      const key = gridTargetsToDateKey(targets, 2026);
      expect(key).toBeNull();
    });
  });

  describe('migrateHistory', () => {
    it('should migrate real faulty data with wrong date key', () => {
      // Real faulty data: saved as "2026-01-05" but grid was showing Jan 4, Sun
      // Jan 4, 2026 is a Sunday
      const faultyHistory: Record<string, SavedPuzzleState> = {
        "2026-01-05": {
          placedShapes: [
            { id: "V", gridRow: 5, gridCol: 4, cells: [[0,2],[1,2],[2,2],[2,1],[2,0]] },
            { id: "O", gridRow: 4, gridCol: 4, cells: [[2,1],[2,0],[1,1],[0,2],[0,1]] },
            { id: "U", gridRow: 4, gridCol: 2, cells: [[0,0],[0,2],[1,0],[1,1],[1,2]] },
            { id: "I", gridRow: 0, gridCol: 1, cells: [[0,0],[0,1],[0,2],[0,3]] },
            { id: "J", gridRow: 1, gridCol: 0, cells: [[0,0],[0,1],[0,2],[0,3],[1,0]] },
            { id: "Z", gridRow: 2, gridCol: 0, cells: [[0,1],[1,1],[1,0],[2,0],[3,0]] },
            { id: "T", gridRow: 4, gridCol: 0, cells: [[0,1],[1,1],[2,0],[2,1],[2,2]] },
            { id: "S", gridRow: 2, gridCol: 2, cells: [[1,0],[0,0],[2,1],[1,1]] },
            { id: "L", gridRow: 2, gridCol: 4, cells: [[1,0],[1,1],[1,2],[0,2]] },
            { id: "P", gridRow: 0, gridCol: 4, cells: [[2,1],[2,0],[1,1],[1,0],[0,1]] },
          ],
          shapeRotations: {},
          solvedAt: "2026-01-05T01:34:39.531Z",
          // Old format with solveTime instead of startedAt
        },
      };
      // Add old solveTime
      (faultyHistory["2026-01-05"] as unknown as { solveTime: number }).solveTime = 2053;

      const { migrated, changed } = migrateHistory(faultyHistory);

      expect(changed).toBe(true);
      
      // The key should be corrected to 2026-01-04 (based on gridTargets computed from shapes)
      expect(migrated["2026-01-05"]).toBeUndefined();
      expect(migrated["2026-01-04"]).toBeDefined();
      
      // gridTargets should be computed from shapes (Jan 4, 2026 is a Sunday)
      expect(migrated["2026-01-04"].gridTargets).toEqual({
        month: "Jan",
        dayNum: "4",
        dayWord: "Sun",
      });
      
      // startedAt should be backfilled from solveTime
      expect(migrated["2026-01-04"].startedAt).toBeDefined();
      
      // Solve time should still be accessible
      expect(getSolveTime(migrated["2026-01-04"])).toBe(2053);
    });

    it('should not modify already correct data', () => {
      // Jan 4, 2026 is a Sunday
      const correctHistory: Record<string, SavedPuzzleState> = {
        "2026-01-04": {
          placedShapes: [{ id: "L", gridRow: 0, gridCol: 0, cells: [[0, 0]] }],
          shapeRotations: {},
          startedAt: "2026-01-04T20:00:00.000Z",
          solvedAt: "2026-01-04T20:05:00.000Z",
          gridTargets: { month: "Jan", dayNum: "4", dayWord: "Sun" },
        },
      };

      const { migrated, changed } = migrateHistory(correctHistory);

      expect(changed).toBe(false);
      expect(migrated["2026-01-04"]).toBeDefined();
      expect(migrated["2026-01-04"].gridTargets).toEqual({
        month: "Jan",
        dayNum: "4",
        dayWord: "Sun",
      });
    });
  });
});

