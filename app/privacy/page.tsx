import Link from "next/link";

export const metadata = {
  title: "Privacy & Terms — Caladay",
};

export default function PrivacyPage() {
  return (
    <div className="h-dvh overflow-y-auto bg-[#f2ede7] px-6 py-8">
      <div className="max-w-2xl mx-auto text-stone-700">
        <h1 className="text-2xl font-light mb-1">Privacy &amp; Terms</h1>
        <p className="text-sm text-stone-400 mb-8">Last updated: July 22, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-medium text-base mb-2">What Caladay is</h2>
            <p>
              Caladay is a free daily puzzle game, available on the web and as
              an iOS app. It does not require an account, and we collect as
              little data as possible.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">
              Data stored on your device
            </h2>
            <p>
              Your puzzle progress, solve history, settings, and chosen
              leaderboard name are stored only on your device (browser or app
              storage). We can&apos;t see them, and they never leave your
              device unless you submit a solve to the leaderboard.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">
              Leaderboard submissions
            </h2>
            <p>
              If you choose to submit a solve to the leaderboard, we store: your
              chosen display name (up to 3 letters), your solution, the puzzle
              date, and your solve time. This is stored with our database
              provider (Supabase) and is <strong>publicly visible</strong> to
              other players. Submissions are optional — you can always skip
              them and keep playing.
            </p>
            <p className="mt-2">
              Display names are filtered for offensive content, and any player
              can report an entry; repeatedly reported entries are hidden.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">Analytics</h2>
            <p>
              The website uses Vercel Analytics, a privacy-friendly, cookie-free
              analytics service that reports aggregate page views. The iOS app
              contains <strong>no analytics or tracking of any kind</strong>.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">
              What we don&apos;t do
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>No accounts, no email collection</li>
              <li>No ads, no third-party trackers</li>
              <li>No sale or sharing of data</li>
              <li>No data linked to your identity</li>
            </ul>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">Notifications</h2>
            <p>
              The iOS app can send an optional daily reminder. This is scheduled
              entirely on your device and can be turned off at any time via the
              bell icon or iOS Settings.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">Deleting your data</h2>
            <p>
              To remove a leaderboard entry you submitted (or for any other
              privacy question), contact us at{" "}
              <a className="underline" href="mailto:cabbagetree876@gmail.com">
                cabbagetree876@gmail.com
              </a>{" "}
              and we&apos;ll delete it. Clearing your browser/app data removes
              everything stored locally.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">Children</h2>
            <p>
              Caladay is suitable for all ages and collects no personal
              information beyond the optional 3-letter display name.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">
              Leaderboard rules (terms of use)
            </h2>
            <p>
              By submitting a solve to the leaderboard you agree to: choose a
              display name that isn&apos;t offensive, hateful, or impersonating
              someone; and accept that we may hide or remove entries at our
              discretion (including automatically after user reports). The
              service is provided as-is, free of charge, with no warranty; we
              may modify or discontinue it at any time. Use of the app is
              otherwise governed by Apple&apos;s standard licensed application
              end user license agreement.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-base mb-2">Changes</h2>
            <p>
              If this policy changes, we&apos;ll update this page and the date
              above.
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
