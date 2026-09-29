"use client";

import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}

export default function Modal({
  isOpen, onClose, labelledBy, children, className = "max-w-sm",
}: ModalProps) {
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const visualViewport = window.visualViewport;
    const update = () => setViewport({
      top: visualViewport?.offsetTop ?? 0,
      height: visualViewport?.height ?? window.innerHeight,
    });
    update();
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const dismissBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onClick={dismissBackdrop}
      // Portal events still bubble through the puzzle's React tree.
      // Isolate game controls without preventing native input gestures.
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
      }}
    >
      {/* The card follows the keyboard; the shade always fills the screen. */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center p-4"
        onClick={dismissBackdrop}
        style={{
          top: viewport?.top ?? 0,
          height: viewport?.height ?? "100dvh",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className={`relative w-full max-h-full overflow-y-auto overscroll-contain rounded-lg bg-white p-6 ${className}`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
