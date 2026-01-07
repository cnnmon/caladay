"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const USERNAME_KEY = "CALADAY_USERNAME";
const SOLUTIONS_KEY = "CALADAY_SOLUTIONS";

export type ModalMode = "submit" | "edit";

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (username: string) => Promise<string>; // Returns solution ID (only for submit mode)
  mode: ModalMode;
}

async function loadBannedWords(): Promise<Set<string>> {
  try {
    const res = await fetch("/moderation.txt");
    const text = await res.text();
    const words = text
      .trim()
      .split(/\s+/)
      .map((w) => w.toUpperCase());
    return new Set(words);
  } catch {
    return new Set();
  }
}

export function getSavedUsername(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USERNAME_KEY);
}

export function saveUsername(username: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USERNAME_KEY, username.toUpperCase());
}

export function addSolutionId(solutionId: string): void {
  if (typeof window === "undefined") return;
  const existing = localStorage.getItem(SOLUTIONS_KEY);
  const ids: string[] = existing ? JSON.parse(existing) : [];
  ids.push(solutionId);
  localStorage.setItem(SOLUTIONS_KEY, JSON.stringify(ids));
}

export function getSolutionIds(): string[] {
  if (typeof window === "undefined") return [];
  const existing = localStorage.getItem(SOLUTIONS_KEY);
  return existing ? JSON.parse(existing) : [];
}

export default function LeaderboardModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
}: LeaderboardModalProps) {
  const [username, setUsername] = useState("");
  const [bannedWords, setBannedWords] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadBannedWords().then(setBannedWords);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const saved = getSavedUsername();
      if (saved) setUsername(saved);
      setError("");
    }
  }, [isOpen]);

  const handleUsernameChange = (value: string) => {
    const upper = value.toUpperCase().slice(0, 3);
    setUsername(upper);
    if (bannedWords.has(upper)) {
      setError("That name is not allowed");
    } else {
      setError("");
    }
  };

  const handleSubmit = async () => {
    if (!username || username.length === 0) {
      setError("Please enter a name");
      return;
    }
    if (bannedWords.has(username)) {
      setError("That name is not allowed");
      return;
    }

    if (mode === "edit") {
      // Just save username and close
      saveUsername(username);
      onClose();
      return;
    }

    // Submit mode
    if (!onSubmit) return;

    setIsSubmitting(true);
    try {
      const solutionId = await onSubmit(username);
      saveUsername(username);
      addSolutionId(solutionId);
      onClose();
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    mode === "submit"
      ? "YAY! You solved the puzzle. Do you want to be included on the leaderboard?"
      : "Change your leaderboard name";

  const submitText = mode === "submit" ? "Submit" : "Save";
  const skipText = mode === "submit" ? "Skip" : "Cancel";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative bg-white rounded-lg p-6 max-w-sm w-full"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <p className="text-stone-600 text-center mb-4">{title}</p>

            <div className="mb-4">
              <label className="block text-sm text-stone-500 mb-1">
                Enter your name (3 characters max)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                maxLength={3}
                className="w-full px-4 py-2 border border-stone-300 rounded-lg text-center text-2xl font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-stone-400 text-stone-800"
                placeholder="AAA"
                autoFocus
              />
              {error && (
                <p className="text-red-500 text-sm mt-1 text-center">{error}</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 transition-colors"
              >
                {skipText}
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  isSubmitting || !username || bannedWords.has(username)
                }
                className="flex-1 px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Saving..." : submitText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
