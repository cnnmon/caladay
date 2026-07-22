import {
  targetsForDay,
  validateSolution,
  validateUsername,
} from "../convex/validation";
import { isUsernameBanned } from "../convex/moderation";
import { solveToEmojiGrid } from "../lib/share";

// Real solutions pulled from the production Convex DB (solutions:list)
const REAL_SOLUTIONS: Array<{ day: string; grid: string }> = [
  {
    day: "2026-07-22",
    grid: "JJJJOO#.SSJVO#LLSSVOOLPPPVVVLPPIIII.ZZZTUUZZTTTU.####TUU",
  },
  {
    day: "2026-07-21",
    grid: "TTTSOO#.TZSSO#ITZZSOOILLZPPPILVZPP.ILVJJJJVVVJU.U####UUU",
  },
  {
    day: "2026-07-21",
    grid: "VVVJIZ#.PVJIZ#PPVJIZZPPJJITZLLSOOT.LSSOTTTLSOOU.U####UUU",
  },
  {
    day: "2026-07-20",
    grid: "UUOOPP#.ULOPP#UULOOPTZZLLTTTJZZZS.TJJJJSSVIIII.SV####VVV",
  },
];

describe("targetsForDay", () => {
  it("computes month, day number, and weekday", () => {
    expect(targetsForDay("2026-07-22")).toEqual({
      month: "Jul",
      dayNum: "22",
      dayWord: "Wed",
    });
    expect(targetsForDay("2026-01-01")).toEqual({
      month: "Jan",
      dayNum: "1",
      dayWord: "Thu",
    });
  });

  it("rejects malformed or impossible dates", () => {
    expect(targetsForDay("2026-7-22")).toBeNull();
    expect(targetsForDay("garbage")).toBeNull();
    expect(targetsForDay("2026-02-30")).toBeNull();
    expect(targetsForDay("2026-13-01")).toBeNull();
  });
});

describe("validateSolution", () => {
  it("accepts real production solutions", () => {
    for (const { day, grid } of REAL_SOLUTIONS) {
      expect(validateSolution(grid, day)).toBeNull();
    }
  });

  it("rejects a valid grid submitted for the wrong day", () => {
    // Solution for Jul 22 leaves Jul/22/Wed uncovered; on Jul 20 the
    // targets (20/Mon) are covered, so it must fail.
    expect(validateSolution(REAL_SOLUTIONS[0].grid, "2026-07-20")).not.toBeNull();
  });

  it("rejects wrong length and garbage", () => {
    expect(validateSolution("", "2026-07-22")).not.toBeNull();
    expect(validateSolution("x".repeat(56), "2026-07-22")).not.toBeNull();
  });

  it("rejects a grid with a target cell covered", () => {
    const { day, grid } = REAL_SOLUTIONS[0];
    // Jul target is at row 1, col 0 => index 7. Cover it with a shape.
    const tampered = grid.slice(0, 7) + "J" + grid.slice(8);
    expect(validateSolution(tampered, day)).toBe("Target cell is covered");
  });

  it("rejects a grid with an uncovered non-target cell", () => {
    const { day, grid } = REAL_SOLUTIONS[0];
    // Index 0 (Jan) is covered by J in the real solution; uncover it.
    const tampered = "." + grid.slice(1);
    expect(validateSolution(tampered, day)).toBe("Uncovered non-target cell");
  });

  it("rejects shapes that aren't a valid orientation", () => {
    const { day, grid } = REAL_SOLUTIONS[0];
    // Swap two adjacent cells belonging to different shapes: both shapes
    // keep their cell counts but at least one becomes an invalid placement.
    const i = grid.indexOf("O");
    const j = grid.indexOf("J");
    const chars = grid.split("");
    chars[i] = "J";
    chars[j] = "O";
    expect(validateSolution(chars.join(""), day)).toBe(
      "Invalid shape placement"
    );
  });

  it("rejects a grid missing a shape", () => {
    const { day, grid } = REAL_SOLUTIONS[0];
    // Replace all of shape L with shape J cells: J becomes invalid/duplicated
    const tampered = grid.replace(/L/g, "J");
    expect(validateSolution(tampered, day)).not.toBeNull();
  });

  it("rejects tampered blocked cells", () => {
    const { day, grid } = REAL_SOLUTIONS[0];
    const tampered = grid.replace("#", "J");
    expect(validateSolution(tampered, day)).toBe("Blocked cell not marked");
  });
});

describe("validateUsername", () => {
  it("accepts 1-3 uppercase letters", () => {
    expect(validateUsername("ALU")).toBeNull();
    expect(validateUsername("A")).toBeNull();
  });

  it("rejects empty, long, or non-letter names", () => {
    expect(validateUsername("")).not.toBeNull();
    expect(validateUsername("ABCD")).not.toBeNull();
    expect(validateUsername("A1")).not.toBeNull();
    expect(validateUsername("a b")).not.toBeNull();
  });
});

describe("solveToEmojiGrid", () => {
  it("renders 8 rows of 7 squares with targets left white", () => {
    const mosaic = solveToEmojiGrid(REAL_SOLUTIONS[0].grid);
    const rows = mosaic.split("\n");
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect([...row]).toHaveLength(7);
    }
    // 3 uncovered target cells → 3 white squares
    expect(mosaic.match(/⬜/g)).toHaveLength(3);
    // 6 blocked cells → 6 black squares
    expect(mosaic.match(/⬛/g)).toHaveLength(6);
  });

  it("never gives touching shapes the same color", () => {
    for (const { grid } of REAL_SOLUTIONS) {
      const rows = solveToEmojiGrid(grid).split("\n").map((r) => [...r]);
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 7; col++) {
          const id = grid[row * 7 + col];
          if (id === "#" || id === ".") continue;
          for (const [r, c] of [[row + 1, col], [row, col + 1]]) {
            if (r >= 8 || c >= 7) continue;
            const otherId = grid[r * 7 + c];
            if (otherId === "#" || otherId === "." || otherId === id) continue;
            expect(rows[row][col]).not.toBe(rows[r][c]);
          }
        }
      }
    }
  });
});

describe("isUsernameBanned", () => {
  it("flags banned words case-insensitively", () => {
    expect(isUsernameBanned("KKK")).toBe(true);
    expect(isUsernameBanned("kkk")).toBe(true);
    expect(isUsernameBanned("ALU")).toBe(false);
  });
});
