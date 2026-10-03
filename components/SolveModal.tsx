"use client";

import { useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal";
import { setTextInteraction } from "../lib/native";
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

export default function SolveModal({ isOpen, ...props }: LeaderboardModalProps) {
  return isOpen ? <NameDialog key={props.mode} {...props} /> : null;
}

function NameDialog({ onClose, onSubmit, mode }: Omit<LeaderboardModalProps, "isOpen">) {
  const [username, setUsername] = useState(() => getSavedUsername() ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeRequest = useRef<symbol | null>(null);
  const titleId = useId();
  useEffect(() => () => { activeRequest.current = null; }, []);
  // iOS: the name field needs the text interaction the puzzle turns off.
  useEffect(() => {
    setTextInteraction(true);
    return () => setTextInteraction(false);
  }, []);

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
    if (activeRequest.current) return;
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

    const request = Symbol();
    activeRequest.current = request;
    setIsSubmitting(true);
    try {
      await onSubmit(username);
    } catch (err) {
      if (activeRequest.current !== request) return;
      activeRequest.current = null;
      setIsSubmitting(false);
      // submitSolution throws Error with a user-facing message
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to submit. Please try again."
      );
      return;
    }
    // The request may finish after this popup was dismissed or reopened.
    if (activeRequest.current !== request) return;
    activeRequest.current = null;
    setIsSubmitting(false);
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
    <Modal isOpen onClose={onClose} labelledBy={titleId}>
      <p id={titleId} className="text-stone-600 text-center mb-4">{title}</p>

      <div className="mb-4">
        <label htmlFor={`${titleId}-username`} className="block text-sm text-stone-500 mb-1">
          Enter your name (3 characters max)
        </label>
        <input
          id={`${titleId}-username`}
          type="text"
          value={username}
          onChange={(e) => handleUsernameChange(e.target.value)}
          maxLength={3}
          className="w-full px-4 py-2 border border-stone-300 rounded-lg text-center text-2xl font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-stone-400 text-stone-800"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
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
    </Modal>
  );
}
