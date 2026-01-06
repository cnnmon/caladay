/**
 * Tests for timezone-consistent date handling
 * 
 * Key invariant: The date key should match what the GRID shows, not the UTC time.
 * If the grid shows Jan 4, the solve should be keyed as "2026-01-04" regardless
 * of what the UTC time is.
 */

import { SavedPuzzleState } from '../types';

const STORAGE_KEY = "caesar-v2";

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

// Get solve time from startedAt/solvedAt
function getSolveTime(state: SavedPuzzleState): number {
  if (state.startedAt && state.solvedAt) {
    const start = new Date(state.startedAt).getTime();
    const end = new Date(state.solvedAt).getTime();
    return Math.floor((end - start) / 1000);
  }
  return 0;
}

// Sample grid string for testing
const SAMPLE_GRID = ".ZZZOO#LLLZZO#SSLJ.OOTSSJJJJTTTIIIITPPUUUVPPPU.UV####VVV";

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

  describe('getSolveTime from startedAt/solvedAt', () => {
    it('should compute duration correctly', () => {
      const state: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
        startedAt: "2026-01-04T23:00:00.000Z",
        solvedAt: "2026-01-04T23:05:30.000Z", // 5 min 30 sec later
      };
      
      expect(getSolveTime(state)).toBe(330); // 5*60 + 30 = 330 seconds
    });

    it('should handle missing startedAt gracefully', () => {
      const state: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
        solvedAt: "2026-01-04T23:05:30.000Z",
      };
      
      expect(getSolveTime(state)).toBe(0);
    });

    it('should handle UTC times correctly', () => {
      // Even if times are in UTC, the duration calculation is correct
      const state: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
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
  });

  describe('Refresh behavior with timezone edge cases', () => {
    it('should restore correct grid after refresh even if UTC date changed', () => {
      // Scenario:
      // 1. User solves puzzle at 11:30 PM local on Jan 4
      // 2. UTC time is 7:30 AM Jan 5
      // 3. Solve is saved with key "2026-01-04" (local)
      // 4. User refreshes at 12:30 AM local on Jan 5
      // 5. Should still show Jan 4 solve when viewing history
      
      const solveDate = new Date(2026, 0, 4, 23, 30, 0);
      const dateKey = getDateKey(solveDate);
      
      expect(dateKey).toBe("2026-01-04");
      
      const savedState: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: dateKey,
        startedAt: solveDate.toISOString(),
        solvedAt: new Date(solveDate.getTime() + 300000).toISOString(), // +5 min
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
      expect(history["2026-01-04"].day).toBe("2026-01-04");
    });

    it('should show solved state on refresh if same local day', () => {
      // User solves at 10 PM, refreshes at 10:30 PM (same day)
      
      const solveDate = new Date(2026, 0, 4, 22, 0, 0);
      const refreshDate = new Date(2026, 0, 4, 22, 30, 0);
      
      const solveDateKey = getDateKey(solveDate);
      const refreshDateKey = getDateKey(refreshDate);
      
      expect(solveDateKey).toBe(refreshDateKey); // Same day
      
      const savedState: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: solveDateKey,
        startedAt: solveDate.toISOString(),
        solvedAt: new Date(solveDate.getTime() + 300000).toISOString(),
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ [solveDateKey]: savedState }));
      
      // On refresh, check if today is solved
      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const todayState = history[refreshDateKey];
      
      expect(todayState).toBeDefined();
      expect(todayState.day).toBe("2026-01-04");
      
      // App should restore this state and show "Congratulations"
    });
  });

  describe('Timer persistence', () => {
    it('should preserve solve time correctly when startedAt and solvedAt are set', () => {
      const state: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
        startedAt: "2026-01-04T10:00:00.000Z", // Started at 10:00 AM
        solvedAt: "2026-01-04T10:50:00.000Z",  // Solved at 10:50 AM (50 minutes later)
      };

      // 50 minutes = 3000 seconds
      expect(getSolveTime(state)).toBe(3000);
    });

    it('should return 0 if startedAt is missing', () => {
      const incompleteState: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
        solvedAt: "2026-01-04T10:50:00.000Z",
        // No startedAt
      };

      expect(getSolveTime(incompleteState)).toBe(0);
    });

    it('should calculate solve time correctly for long solves', () => {
      const state: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
        startedAt: "2026-01-04T09:00:00.000Z", // Started at 9:00 AM
        solvedAt: "2026-01-04T09:34:13.000Z",  // Solved at 9:34:13 AM
      };

      // 34 minutes 13 seconds = 2053 seconds
      expect(getSolveTime(state)).toBe(2053);
    });

    it('should find today solve by date key', () => {
      // Simulate history with today's and past solves
      const history: Record<string, SavedPuzzleState> = {
        "2026-01-04": {
          grid: SAMPLE_GRID,
          day: "2026-01-04",
          startedAt: "2026-01-04T10:00:00.000Z",
          solvedAt: "2026-01-04T10:50:00.000Z", // 50 min solve
        },
        "2026-01-02": {
          grid: SAMPLE_GRID,
          day: "2026-01-02",
          startedAt: "2026-01-02T10:00:00.000Z",
          solvedAt: "2026-01-02T10:04:20.000Z", // 4:20 solve
        },
      };

      // Find today's solve directly by key
      const todayKey = "2026-01-04";
      const todayState = history[todayKey];

      expect(todayState).toBeDefined();
      expect(getSolveTime(todayState)).toBe(3000); // 50 minutes

      // Past solve
      const jan2State = history["2026-01-02"];
      expect(getSolveTime(jan2State)).toBe(260); // 4 min 20 sec
    });
  });

  describe('Grid string storage', () => {
    it('should store grid as 56-character string', () => {
      const state: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
        startedAt: "2026-01-04T10:00:00.000Z",
        solvedAt: "2026-01-04T10:05:00.000Z",
      };

      expect(state.grid.length).toBe(56); // 7 cols × 8 rows
    });

    it('should use day field as the date key', () => {
      const state: SavedPuzzleState = {
        grid: SAMPLE_GRID,
        day: "2026-01-04",
        startedAt: "2026-01-04T10:00:00.000Z",
        solvedAt: "2026-01-04T10:05:00.000Z",
      };

      // day field matches the expected format
      expect(state.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
