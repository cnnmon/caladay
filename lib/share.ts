// Share a solved puzzle as a Wordle-style emoji mosaic.
// Uses the native share sheet on iOS, navigator.share on capable web
// browsers, and clipboard copy as the final fallback.
import { Share } from "@capacitor/share";
import { isNative } from "./native";

// Only 7 colored-square emoji exist for 10 shapes, so repeats are
// unavoidable — but we pick colors per solution so that no two TOUCHING
// shapes share one (greedy graph coloring), which is what would visually
// merge pieces in the mosaic.
const EMOJI_PALETTE = ["🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🟫"];

// Each shape's preferred emoji (closest to its in-game color)
const PREFERRED_EMOJI: Record<string, string> = {
  L: "🟥", // red
  J: "🟧", // orange
  T: "🟨", // yellow
  S: "🟩", // green
  Z: "🟦", // teal
  I: "🟦", // blue
  O: "🟪", // indigo
  P: "🟪", // purple
  U: "🟫", // pink
  V: "🟫", // peach
};

// Assign an emoji per shape id so orthogonally adjacent shapes never match.
function assignEmoji(gridStr: string): Record<string, string> {
  // Adjacency between shape ids, and stable first-appearance order
  const order: string[] = [];
  const neighbors = new Map<string, Set<string>>();
  const at = (row: number, col: number) => gridStr[row * 7 + col];
  const isShape = (ch: string) => ch !== "#" && ch !== "." && ch !== undefined;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 7; col++) {
      const ch = at(row, col);
      if (!isShape(ch)) continue;
      if (!neighbors.has(ch)) {
        neighbors.set(ch, new Set());
        order.push(ch);
      }
      for (const [r, c] of [[row + 1, col], [row, col + 1]] as const) {
        if (r >= 8 || c >= 7) continue;
        const other = at(r, c);
        if (isShape(other) && other !== ch) {
          neighbors.get(ch)!.add(other);
          if (!neighbors.has(other)) {
            neighbors.set(other, new Set());
            order.push(other);
          }
          neighbors.get(other)!.add(ch);
        }
      }
    }
  }

  const assigned: Record<string, string> = {};
  for (const id of order) {
    const taken = new Set(
      [...neighbors.get(id)!].map((n) => assigned[n]).filter(Boolean)
    );
    const preferred = PREFERRED_EMOJI[id] ?? EMOJI_PALETTE[0];
    if (!taken.has(preferred)) {
      assigned[id] = preferred;
    } else {
      // Fall back to the preferred color if every palette color conflicts
      // (can't happen with 7 colors and pentomino adjacency in practice)
      assigned[id] =
        EMOJI_PALETTE.find((e) => !taken.has(e)) ?? preferred;
    }
  }
  return assigned;
}

export function solveToEmojiGrid(gridStr: string): string {
  const emoji = assignEmoji(gridStr);
  const rows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let line = "";
    for (let col = 0; col < 7; col++) {
      const char = gridStr[row * 7 + col];
      if (char === "#") {
        line += "⬛";
      } else if (char === ".") {
        line += "⬜"; // today's date, left uncovered
      } else {
        line += emoji[char] ?? "⬛";
      }
    }
    rows.push(line);
  }
  return rows.join("\n");
}

function formatShareTime(timeElapsed?: number): string {
  if (timeElapsed === undefined) return "";
  const seconds = Math.floor(timeElapsed / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return ` in ${mins}:${secs.toString().padStart(2, "0")}`;
}

// Returns "shared" | "copied" | "failed" so the caller can show feedback.
export async function shareSolve(
  gridStr: string,
  day: string,
  timeElapsed?: number
): Promise<"shared" | "copied" | "failed"> {
  const text = [
    `caladay ${day} — solved${formatShareTime(timeElapsed)}`,
    "",
    solveToEmojiGrid(gridStr),
    "",
    "https://caladay.vercel.app",
  ].join("\n");

  try {
    if (isNative()) {
      await Share.share({ text });
      return "shared";
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ text });
      return "shared";
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (err) {
    // User cancelling the share sheet is not a failure
    if (err instanceof Error && err.name === "AbortError") return "shared";
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      return "failed";
    }
  }
}
