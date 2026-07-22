import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isUsernameBanned } from "./moderation";
import { validateSolution, validateUsername } from "./validation";

// Solutions may only be submitted for days close to the server's current
// date (covers all client time zones plus a just-after-midnight submit).
const MAX_DAY_SKEW_MS = 2 * 24 * 60 * 60 * 1000;

// Hide a solution once it accumulates this many reports.
const REPORTS_TO_HIDE = 3;

export const create = mutation({
  args: {
    username: v.string(),
    grid: v.string(),
    day: v.string(),
    startedAt: v.optional(v.string()),
    timeElapsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const username = args.username.toUpperCase().slice(0, 3);
    const usernameError = validateUsername(username);
    if (usernameError) {
      throw new ConvexError(usernameError);
    }
    if (isUsernameBanned(username)) {
      throw new ConvexError("That name is not allowed");
    }

    const gridError = validateSolution(args.grid, args.day);
    if (gridError) {
      throw new ConvexError(`Invalid solution: ${gridError}`);
    }

    // Only accept submissions for (roughly) the current day
    const dayTime = new Date(args.day + "T12:00:00Z").getTime();
    if (Math.abs(Date.now() - dayTime) > MAX_DAY_SKEW_MS) {
      throw new ConvexError("Submissions are only accepted for today's puzzle");
    }

    // Sanity-check the self-reported solve time
    if (
      args.timeElapsed !== undefined &&
      (args.timeElapsed < 0 || args.timeElapsed > 24 * 60 * 60 * 1000)
    ) {
      throw new ConvexError("Invalid solve time");
    }

    const id = await ctx.db.insert("solutions", {
      username,
      grid: args.grid,
      day: args.day,
      startedAt: args.startedAt,
      timeElapsed: args.timeElapsed,
    });
    return id;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const solutions = await ctx.db.query("solutions").order("desc").collect();
    return solutions.filter((s) => !s.hidden);
  },
});

export const listByDay = query({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const solutions = await ctx.db
      .query("solutions")
      .withIndex("by_day", (q) => q.eq("day", args.day))
      .collect();
    return solutions.filter((s) => !s.hidden);
  },
});

export const getById = query({
  args: { id: v.id("solutions") },
  handler: async (ctx, args) => {
    const solution = await ctx.db.get(args.id);
    // Hidden (reported) entries are hidden everywhere, including previews
    if (!solution || solution.hidden) return null;
    return solution;
  },
});

// Report a leaderboard entry as inappropriate (App Store Guideline 1.2).
// After REPORTS_TO_HIDE reports, the entry is hidden from all leaderboards.
// Note: with no auth there is no way to dedupe reporters server-side; the
// client dedupes locally. Abuse of this can only hide entries (fail-safe
// direction for content moderation), never expose anything.
export const report = mutation({
  args: { solutionId: v.id("solutions") },
  handler: async (ctx, args) => {
    const solution = await ctx.db.get(args.solutionId);
    if (!solution) {
      throw new ConvexError("Solution not found");
    }
    await ctx.db.insert("reports", { solutionId: args.solutionId });
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_solution", (q) => q.eq("solutionId", args.solutionId))
      .collect();
    if (reports.length >= REPORTS_TO_HIDE && !solution.hidden) {
      await ctx.db.patch(args.solutionId, { hidden: true });
    }
  },
});
