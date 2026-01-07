import { Suspense } from "react";
import Puzzle from "./Puzzle";

export default function Home() {
  return (
    <div className="h-dvh flex items-center justify-center overflow-hidden">
      <Suspense fallback={<div className="text-stone-400">Loading...</div>}>
        <Puzzle />
      </Suspense>
    </div>
  );
}
