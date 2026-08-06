"use client";

import { useEffect, useRef, useState } from "react";

// Reference points for fill and color interpolation
// Format: [solutions, fillPercent, r, g, b]
const REFERENCE_POINTS: [number, number, number, number, number][] = [
  [600, 95, 239, 68, 68],    // Red, mostly filled
  [1250, 67, 234, 179, 8],   // Yellow, 2/3 filled
  [3000, 33, 34, 197, 94],   // Green, 1/3 filled
  [5000, 5, 59, 130, 246],   // Blue, mostly empty
];

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

function interpolate(solutions: number): { fillPercent: number; color: string } {
  // Clamp solutions to our range
  const clampedSolutions = Math.max(600, Math.min(5000, solutions));

  // Find the two reference points to interpolate between
  let lowerIdx = 0;
  for (let i = 0; i < REFERENCE_POINTS.length - 1; i++) {
    if (clampedSolutions >= REFERENCE_POINTS[i][0] && clampedSolutions <= REFERENCE_POINTS[i + 1][0]) {
      lowerIdx = i;
      break;
    }
  }

  const lower = REFERENCE_POINTS[lowerIdx];
  const upper = REFERENCE_POINTS[Math.min(lowerIdx + 1, REFERENCE_POINTS.length - 1)];

  // Calculate interpolation factor (0 to 1)
  const range = upper[0] - lower[0];
  const t = range > 0 ? (clampedSolutions - lower[0]) / range : 0;

  // Interpolate fill percentage
  const fillPercent = lower[1] + t * (upper[1] - lower[1]);

  // Interpolate color (RGB)
  const r = Math.round(lower[2] + t * (upper[2] - lower[2]));
  const g = Math.round(lower[3] + t * (upper[3] - lower[3]));
  const b = Math.round(lower[4] + t * (upper[4] - lower[4]));

  return {
    fillPercent,
    color: `rgb(${r}, ${g}, ${b})`,
  };
}

function getDifficultyLabel(solutions: number): string {
  if (solutions >= 3500) return "Easiest";
  if (solutions >= 2000) return "Easy";
  if (solutions >= 1250) return "Medium";
  return "Hard";
}

interface DifficultyBarProps {
  date?: Date;
  className?: string;
}

export default function DifficultyBar({ date = new Date(), className = "" }: DifficultyBarProps) {
  const [solutions, setSolutions] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hover has no equivalent on touch: tapping the bar toggles the tooltip,
  // and any tap outside dismisses it.
  useEffect(() => {
    if (!showTooltip) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showTooltip]);

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

  const { fillPercent, color } = interpolate(solutions);
  const label = getDifficultyLabel(solutions);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center gap-2 ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((v) => !v)}
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
