import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  solutions: defineTable({
    username: v.string(), // Max 3 characters, uppercase
    grid: v.string(), // 56-character grid representation
    day: v.string(), // Date key (YYYY-MM-DD)
    startedAt: v.optional(v.string()), // ISO timestamp
    solvedAt: v.optional(v.string()), // ISO timestamp
  }).index("by_day", ["day"]),
});

