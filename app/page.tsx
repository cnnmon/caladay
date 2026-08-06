import { Suspense } from "react";
import Puzzle from "../components/Puzzle";

export default function Home() {
  return (
    <div className="h-dvh flex items-center justify-center overflow-hidden">
      {/* Empty fallback: it's baked into the prerendered HTML (useSearchParams
          suspends during static export), so any visible content here flashes
          on every cold start before hydration. */}
      <Suspense fallback={null}>
        <Puzzle />
      </Suspense>
    </div>
  );
}
