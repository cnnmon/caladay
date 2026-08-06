"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

// iOS has no install-prompt API, so this sheet walks through
// Share → Add to Home Screen. Shown once after the first solve in a plain
// iOS browser tab, and on demand from Settings → "Install app".
export function InstallHint({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative bg-white rounded-t-2xl sm:rounded-lg p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-w-sm w-full"
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
          >
            <div className="flex items-center gap-4 mb-5">
              <Image
                src="/icons/icon-192.png"
                alt=""
                width={56}
                height={56}
                className="rounded-xl"
                unoptimized
              />
              <div>
                <h2 className="text-lg font-bold text-stone-800 leading-snug">
                  Add Caladay to your Home Screen
                </h2>
                <p className="text-sm text-stone-500 mt-0.5">
                  Full-screen play, its own icon, and works offline.
                </p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              <div className="flex items-center gap-3 bg-stone-100 rounded-xl px-4 py-3">
                <span className="flex-none w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-sky-600">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3v12" />
                    <path d="M8 6.5 12 3l4 3.5" />
                    <rect x="4" y="10" width="16" height="11" rx="2.5" />
                  </svg>
                </span>
                <p className="text-sm text-stone-700">
                  Tap <b>Share</b> in Safari&apos;s toolbar
                </p>
              </div>
              <div className="flex items-center gap-3 bg-stone-100 rounded-xl px-4 py-3">
                <span className="flex-none w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-sky-600">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
                    <path d="M12 8.5v7M8.5 12h7" />
                  </svg>
                </span>
                <p className="text-sm text-stone-700">
                  Choose <b>Add to Home Screen</b>
                  <span className="block text-xs text-stone-500">
                    Scroll down a little to find it
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white transition-colors"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
