import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    username: v.string(),
    grid: v.string(),
    day: v.string(),
    startedAt: v.optional(v.string()),
    timeElapsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("solutions", {
      username: args.username.toUpperCase().slice(0, 3),
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
    return solutions;
  },
});

export const listByDay = query({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const solutions = await ctx.db
      .query("solutions")
      .withIndex("by_day", (q) => q.eq("day", args.day))
      .collect();
    return solutions;
  },
});

export const getById = query({
  args: { id: v.id("solutions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
