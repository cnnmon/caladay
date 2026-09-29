"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { isUsernameBanned, validateUsername } from "../supabase/functions/_shared/puzzle";

const USERNAME_KEY = "CALADAY_USERNAME";

export type ModalMode = "submit" | "edit";

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (username: string) => Promise<void>;
  mode: ModalMode;
}

export function getSavedUsername(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const username = localStorage.getItem(USERNAME_KEY);
    // Previously saved invalid names should prompt for a replacement rather
    // than silently failing every future automatic submission.
    return username && !validateUsername(username) && !isUsernameBanned(username)
      ? username : null;
  } catch {
    return null;
  }
}

export function saveUsername(username: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USERNAME_KEY, username.toUpperCase());
  } catch {
    // Remembering the name is optional; the server submission already worked.
  }
}

export default function SolveModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
}: LeaderboardModalProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const saved = getSavedUsername();
      setUsername(saved ?? "");
      setError("");
    }
  }, [isOpen]);

  const handleUsernameChange = (value: string) => {
    const upper = value.toUpperCase().slice(0, 3);
    setUsername(upper);
    if (isUsernameBanned(upper)) {
      setError("That name is not allowed");
    } else {
      setError(upper ? validateUsername(upper) ?? "" : "");
    }
  };

  const handleSubmit = async () => {
    if (!username || username.length === 0) {
      setError("Please enter a name");
      return;
    }
    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (isUsernameBanned(username)) {
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
      await onSubmit(username);
    } catch (err) {
      // submitSolution throws Error with a user-facing message
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to submit. Please try again."
      );
      return;
    } finally {
      setIsSubmitting(false);
    }
    // A local preference failure must never invite a second server insert.
    saveUsername(username);
    onClose();
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
                <p role="alert" className="text-red-500 text-sm mt-1 text-center">{error}</p>
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
                  isSubmitting || !!validateUsername(username) || isUsernameBanned(username)
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
