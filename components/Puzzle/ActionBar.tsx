"use client";

// Mobile contextual action bar: Rotate / Flip / Remove for the selected
// piece, sized for thumbs (≥44pt), replacing the small floating buttons.
// The row's height is always reserved by the parent so the board never
// reflows when selection changes; idle state shows the one-time gesture hint.
export function ActionBar({
  visible,
  hint,
  canRotate,
  canFlip,
  canRemove,
  onRotate,
  onFlip,
  onRemove,
}: {
  visible: boolean;
  hint: string | null;
  canRotate: boolean;
  canFlip: boolean;
  canRemove: boolean;
  onRotate: () => void;
  onFlip: () => void;
  onRemove: () => void;
}) {
  const button =
    "h-11 px-4 rounded-full bg-stone-300 active:bg-stone-400 text-stone-700 " +
    "font-medium flex items-center gap-1.5 transition-colors " +
    "disabled:opacity-30";

  return (
    <div className="h-13 flex-none flex items-center justify-center gap-2.5 w-full">
      {visible ? (
        <>
          <button
            className={button}
            disabled={!canRotate}
            onClick={onRotate}
            title="Rotate (R)"
          >
            <span aria-hidden className="text-lg leading-none">
              ↻
            </span>
            Rotate
          </button>
          <button
            className={button}
            disabled={!canFlip}
            onClick={onFlip}
            title="Flip (F)"
          >
            <span aria-hidden className="text-lg leading-none">
              ⇆
            </span>
            Flip
          </button>
          <button
            className={button}
            disabled={!canRemove}
            onClick={onRemove}
            title="Return to tray (Backspace)"
          >
            <span aria-hidden className="text-lg leading-none">
              ✕
            </span>
            Remove
          </button>
        </>
      ) : hint ? (
        <p className="text-sm text-stone-400">{hint}</p>
      ) : null}
    </div>
  );
}
