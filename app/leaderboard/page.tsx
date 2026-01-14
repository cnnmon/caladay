"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

const SUBMISSIONS_KEY = "CALADAY_SUBMISSIONS";

function getDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(timeElapsed?: number): string {
  if (timeElapsed === undefined) {
    return "—";
  }
  const seconds = Math.floor(timeElapsed / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(day: string): string {
  const date = new Date(day + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getMySolutionIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const data = localStorage.getItem(SUBMISSIONS_KEY);
    if (!data) return new Set();
    const submissions = JSON.parse(data) as { id: string; grid: string }[];
    return new Set(submissions.map((s) => s.id));
  } catch {
    return new Set();
  }
}

// Difficulty colors from shapes.ts
const DIFFICULTY_COLORS = {
  hard: "#A33366",     // Red
  medium: "#E7920A",   // Yellow
  easy: "#849E16",     // Green
  easiest: "#0F688E",  // Blue
};

function getDifficultyColor(solutions: number): string {
  if (solutions >= 3500) return DIFFICULTY_COLORS.easiest;
  if (solutions >= 2000) return DIFFICULTY_COLORS.easy;
  if (solutions >= 1250) return DIFFICULTY_COLORS.medium;
  return DIFFICULTY_COLORS.hard;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const solutions = useQuery(api.solutions.list);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mySolutionIds] = useState<Set<string>>(() => getMySolutionIds());
  const [urlDayParam, setUrlDayParam] = useState<string | null>(null);
  const [urlParamChecked, setUrlParamChecked] = useState(false);
  const [solutionsCache, setSolutionsCache] = useState<Map<string, number> | null>(null);

  // Load solutions cache for difficulty colors
  useEffect(() => {
    fetch("/solutions-cache.csv")
      .then(response => response.text())
      .then(text => {
        const cache = new Map<string, number>();
        const lines = text.trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const [date, solutions] = lines[i].split(",");
          cache.set(date, parseInt(solutions, 10));
        }
        setSolutionsCache(cache);
      })
      .catch(err => console.error("Failed to load solutions cache:", err));
  }, []);

  // Group solutions by day
  const groupedByDay = solutions?.reduce(
    (acc, sol) => {
      if (!acc[sol.day]) acc[sol.day] = [];
      acc[sol.day].push(sol);
      return acc;
    },
    {} as Record<string, NonNullable<typeof solutions>>
  );

  // Sort days descending
  const sortedDays = groupedByDay
    ? Object.keys(groupedByDay).sort((a, b) => b.localeCompare(a))
    : [];

  // Read URL param once on mount
  useEffect(() => {
    if (!urlParamChecked) {
      const dayParam = searchParams.get("day");
      if (dayParam) {
        setUrlDayParam(dayParam);
        // Clear the URL param without full navigation
        router.replace("/leaderboard", { scroll: false });
      }
      setUrlParamChecked(true);
    }
  }, [searchParams, router, urlParamChecked]);

  // Set initial day once sortedDays is available
  useEffect(() => {
    if (sortedDays.length > 0 && selectedDay === null && urlParamChecked) {
      // Prefer URL param day if valid, otherwise today or most recent
      if (urlDayParam && sortedDays.includes(urlDayParam)) {
        setSelectedDay(urlDayParam);
      } else {
        const today = getDateKey();
        if (sortedDays.includes(today)) {
          setSelectedDay(today);
        } else {
          setSelectedDay(sortedDays[0]);
        }
      }
    }
  }, [sortedDays, selectedDay, urlDayParam, urlParamChecked]);

  const currentDaySolutions = selectedDay && groupedByDay?.[selectedDay];
  const sortedSolutions = currentDaySolutions
    ? [...currentDaySolutions].sort((a, b) => {
        const timeA = a.timeElapsed ?? Infinity;
        const timeB = b.timeElapsed ?? Infinity;
        return timeA - timeB;
      })
    : [];

  const isViewingPastDay = selectedDay !== null && selectedDay < getDateKey();
  const isViewingToday = selectedDay === getDateKey();

  const handlePreview = (solutionId: string, isMine: boolean) => {
    // Allow preview for past days, or your own solutions today
    if (!isViewingPastDay && !(isViewingToday && isMine)) return;
    router.push(`/?solution=${solutionId}`);
  };

  return (
    <div className="min-h-screen bg-[#f2ede7] px-6 py-4">
      {/* Full-width header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <h1 className="text-xl font-light text-stone-700">Leaderboard</h1>
        <Link
          href="/"
          className="px-3 py-1 rounded-full bg-stone-300 hover:bg-stone-400 text-stone-600 transition-colors w-fit"
        >
          Back to puzzle →
        </Link>
      </motion.div>

      {/* Narrower content */}
      <div className="max-w-2xl mx-auto">
        {!solutions ? (
          <div className="text-center text-stone-400 py-8">Loading...</div>
        ) : solutions.length === 0 ? (
          <div className="text-center text-stone-400 py-8">
            No solutions yet. Be the first to solve and submit!
          </div>
        ) : (
          <>
            {/* Day tabs */}
            <div className="flex gap-2 mb-3 overflow-x-auto">
              {sortedDays.map((day) => {
                const isToday = day === getDateKey();
                const isActive = day === selectedDay;
                const isPastOrToday = day <= getDateKey();
                const solutionCount = solutionsCache?.get(day);
                const difficultyColor = isPastOrToday && solutionCount ? getDifficultyColor(solutionCount) : null;
                
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                      isActive
                        ? "text-white"
                        : difficultyColor
                          ? "text-white hover:opacity-80"
                          : "bg-stone-200 hover:bg-stone-300 text-stone-600"
                    }`}
                    style={{
                      backgroundColor: isActive 
                        ? "#44403c" // stone-700
                        : difficultyColor || undefined,
                    }}
                  >
                    {isToday ? "Today" : formatDate(day)}
                  </button>
                );
              })}
            </div>

            {/* Solutions list */}
            <motion.div
              key={selectedDay}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg overflow-hidden"
            >
              {sortedSolutions.length === 0 ? (
                <div className="text-center text-stone-400 py-8">
                  No solutions for this day yet.
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {sortedSolutions.map((solution, index) => {
                    const isMine = mySolutionIds.has(solution._id);
                    // Can click past day solutions, or your own solutions today
                    const isClickable = isViewingPastDay || (isViewingToday && isMine);

                    return (
                      <motion.div
                        key={solution._id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() =>
                          isClickable && handlePreview(solution._id, isMine)
                        }
                        className={`flex items-center justify-between px-4 py-3 ${
                          isMine ? "bg-amber-50" : ""
                        } ${
                          isClickable
                            ? "cursor-pointer hover:bg-stone-50"
                            : "cursor-default"
                        }`}
                        title={
                          isClickable
                            ? "Click to preview solution"
                            : "Other players' solutions can be viewed tomorrow"
                        }
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-lg font-medium w-6 text-center ${
                              index === 0
                                ? "text-yellow-500"
                                : index === 1
                                  ? "text-stone-400"
                                  : index === 2
                                    ? "text-amber-600"
                                    : "text-stone-300"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span
                            className={`font-mono text-lg tracking-wider ${
                              isMine
                                ? "text-amber-700 font-bold"
                                : "text-stone-700"
                            }`}
                          >
                            {solution.username}
                            {isMine && (
                              <span className="ml-2 text-xs text-amber-600">
                                (you)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-stone-500 font-mono">
                            {formatTime(solution.timeElapsed)}
                          </span>
                          {isClickable && (
                            <span className="text-stone-300 text-sm">→</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {isViewingToday && (
              <p className="text-center text-stone-400 text-sm mt-4">
                Other players&apos; solutions can be viewed tomorrow
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
