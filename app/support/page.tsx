import Link from "next/link";

export const metadata = {
  title: "Support — Caladay",
};

export default function SupportPage() {
  return (
    <div className="h-dvh overflow-y-auto bg-[#f2ede7] px-6 py-8">
      <div className="max-w-2xl mx-auto text-stone-700">
        <h1 className="text-2xl font-light mb-8">Caladay Support</h1>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-medium text-base mb-2">Contact us</h2>
            <p>
              Questions, bug reports, feedback, or a leaderboard entry you
              want removed — email{" "}
              <a
                className="underline"
                href="mailto:cabbagetree876@gmail.com?subject=Caladay%20support"
              >
                cabbagetree876@gmail.com
              </a>{" "}
              and we&apos;ll get back to you.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">How to play</h2>
            <p>
              Fit all ten pieces onto the board so only today&apos;s month,
              date, and day of the week stay uncovered. Drag pieces onto the
              board; tap a piece to select it, tap again to rotate, press and
              hold to flip. Full instructions live under Help in the app.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">Common questions</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Every day has a solution</strong> — usually many. The
                difficulty bar shows how many exist for today.
              </li>
              <li>
                <strong>Leaderboard:</strong> submitting is optional. Other
                players&apos; solutions unlock the next day so nobody can copy
                a solve. Tap the flag next to an entry to report an
                inappropriate name.
              </li>
              <li>
                <strong>Daily reminder:</strong> toggle it in Settings (gear
                icon). If it won&apos;t turn on, allow notifications for
                Caladay in the iOS Settings app.
              </li>
              <li>
                <strong>Offline:</strong> the puzzle is fully playable without
                a connection; only the leaderboard needs one.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">Privacy &amp; terms</h2>
            <p>
              See{" "}
              <Link className="underline" href="/privacy">
                caladay.vercel.app/privacy
              </Link>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 pb-8">
          <Link
            href="/"
            className="px-3 py-1 rounded-full bg-stone-300 hover:bg-stone-400 text-stone-600 transition-colors"
          >
            ← Back to puzzle
          </Link>
        </div>
      </div>
    </div>
  );
}
