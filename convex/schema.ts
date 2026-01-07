import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  solutions: defineTable({
    username: v.string(), // Max 3 characters, uppercase
    grid: v.string(), // 56-character grid representation
    day: v.string(), // Date key (YYYY-MM-DD)
    startedAt: v.optional(v.string()), // ISO timestamp
    timeElapsed: v.optional(v.number()), // Elapsed time in ms
  }).index("by_day", ["day"]),
});

