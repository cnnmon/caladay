"use client";

import { useEffect, useState } from "react";

// Difficulty colors from shapes.ts
const DIFFICULTY_COLORS = {
  hard: "#A33366",     // Red
  medium: "#E7920A",   // Yellow
  easy: "#849E16",     // Green
  easiest: "#0F688E",  // Blue
};

// Cache for solutions data (loaded once, shared across all instances)
let solutionsCache: Map<string, number> | null = null;
let cacheLoadPromise: Promise<Map<string, number>> | null = null;

async function loadSolutionsCache(): Promise<Map<string, number>> {
  if (solutionsCache) return solutionsCache;
  
  if (cacheLoadPromise) return cacheLoadPromise;
  
  cacheLoadPromise = fetch("/solutions-cache.csv")
    .then(response => response.text())
    .then(text => {
      const cache = new Map<string, number>();
      const lines = text.trim().split("\n");
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const [date, solutions] = lines[i].split(",");
        cache.set(date, parseInt(solutions, 10));
      }
      solutionsCache = cache;
      return cache;
    });
  
  return cacheLoadPromise;
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Reference points for fill interpolation: [solutions, fillPercent]
const FILL_POINTS: [number, number][] = [
  [600, 95],
  [1250, 67],
  [3000, 33],
  [5000, 5],
];

function getFillPercent(solutions: number): number {
  const clamped = Math.max(600, Math.min(5000, solutions));
  
  // Find the two points to interpolate between
  for (let i = 0; i < FILL_POINTS.length - 1; i++) {
    if (clamped >= FILL_POINTS[i][0] && clamped <= FILL_POINTS[i + 1][0]) {
      const [x1, y1] = FILL_POINTS[i];
      const [x2, y2] = FILL_POINTS[i + 1];
      const t = (clamped - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }
  return FILL_POINTS[FILL_POINTS.length - 1][1];
}

function getDifficultyStyle(solutions: number): { fillPercent: number; color: string; label: string } {
  const fillPercent = getFillPercent(solutions);
  
  if (solutions >= 3500) {
    return { fillPercent, color: DIFFICULTY_COLORS.easiest, label: "Easiest" };
  }
  if (solutions >= 2000) {
    return { fillPercent, color: DIFFICULTY_COLORS.easy, label: "Easy" };
  }
  if (solutions >= 1250) {
    return { fillPercent, color: DIFFICULTY_COLORS.medium, label: "Medium" };
  }
  return { fillPercent, color: DIFFICULTY_COLORS.hard, label: "Hard" };
}

interface DifficultyBarProps {
  date?: Date;
  className?: string;
}

export default function DifficultyBar({ date = new Date(), className = "" }: DifficultyBarProps) {
  const [solutions, setSolutions] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    
    loadSolutionsCache()
      .then(cache => {
        if (cancelled) return;
        const dateKey = getDateKey(date);
        const count = cache.get(dateKey);
        if (count !== undefined) {
          setSolutions(count);
        } else {
          // Date not in cache - this shouldn't happen for dates within 2026-2029
          console.warn(`Date ${dateKey} not found in solutions cache`);
          setSolutions(null);
        }
        setIsLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error("Failed to load solutions cache:", err);
        setSolutions(null);
        setIsLoading(false);
      });
    
    return () => { cancelled = true; };
  }, [date]);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-24 h-2 bg-stone-200 rounded-full overflow-hidden animate-pulse" />
        <span className="text-xs text-stone-400">...</span>
      </div>
    );
  }

  if (solutions === null) {
    return null;
  }

  const { fillPercent, color, label } = getDifficultyStyle(solutions);

  return (
    <div
      className={`relative flex items-center gap-2 ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="w-24 h-2 bg-stone-200 rounded-full overflow-hidden cursor-help">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${fillPercent}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="text-xs font-medium" style={{ color }}>
        {label}
      </span>
      {showTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-1 bg-stone-800 text-white text-xs rounded whitespace-nowrap z-50">
          {solutions.toLocaleString()} solutions
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-stone-800" />
        </div>
      )}
    </div>
  );
}
