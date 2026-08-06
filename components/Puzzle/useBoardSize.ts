import { useLayoutEffect, useState, type RefObject } from "react";

const MAX_CELL_DESKTOP = 48;
const MAX_CELL_MOBILE = 56;
const MIN_CELL = 26;
// border-4 on the board frame, both sides
const BOARD_FRAME = 8;

// Fluid board sizing for phones: measure the space the flex layout gives the
// board area and derive the largest integer cell that fits a 7×8 grid.
// Desktop (isMobile false) bypasses the state entirely and stays at the
// fixed 48px cells — layout there is unchanged. The measured wrapper's size
// must not depend on the returned value (siblings are all content-sized),
// or the observer would feed back on itself.
export function useCellSize(
  areaRef: RefObject<HTMLDivElement | null>,
  isMobile: boolean
): number {
  // Initial value matches the prerendered desktop HTML, so hydration is
  // clean; on phones the reveal gate hides the pre-measure frame.
  const [cell, setCell] = useState(MAX_CELL_DESKTOP);

  useLayoutEffect(() => {
    if (!isMobile) return;
    const el = areaRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 50 || height < 50) return; // pre-layout / hidden guard
      const fit = Math.floor(
        Math.min((width - BOARD_FRAME) / 7, (height - BOARD_FRAME) / 8)
      );
      const next = Math.max(MIN_CELL, Math.min(MAX_CELL_MOBILE, fit));
      setCell((prev) => (prev === next ? prev : next));
    };
    const ro = new ResizeObserver(() => {
      // Coalesce bursts (e.g. rotation) into one post-layout measure
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    // First measure also goes through rAF: it still lands before paint,
    // and keeps setState out of the effect's synchronous path.
    raf = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [isMobile, areaRef]);

  return isMobile ? cell : MAX_CELL_DESKTOP;
}
