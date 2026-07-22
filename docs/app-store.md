# Caladay — App Store submission guide

The iOS app is the same static Next.js bundle as the web app, wrapped with
Capacitor (`ios/`). `npm run ios:sync` rebuilds the web bundle and copies it
into the iOS project; `npm run ios:open` opens Xcode.

## Before every TestFlight/App Store build

1. `npm run ios:sync`
2. In Xcode: select the `App` scheme → Product → Archive → Distribute.

## One-time setup remaining

- [ ] **Deploy Convex changes**: `npx convex deploy` (server-side validation,
      moderation, and the `report` mutation must be live BEFORE the app ships —
      also before the next Vercel deploy, since the web report button calls it).
- [ ] **Signing**: in Xcode → App target → Signing & Capabilities, pick your
      team; bundle ID is `com.caladay.app`.
- [ ] **App icon**: replace `ios/App/App/Assets.xcassets/AppIcon.appiconset`
      with a real 1024×1024 icon (single-size icon works in current Xcode).
- [ ] **Widget**: follow `ios/App/CaladayWidget/README.md` (one-time GUI step).
- [ ] **Privacy policy URL**: required in App Store Connect. Needs to cover:
      3-letter usernames + solve times stored in Convex (leaderboard),
      no accounts, no tracking in the iOS app (Vercel Analytics is web-only,
      gated off in `app/AnalyticsGate.tsx`).

## App Store Connect — App Privacy answers

- Data collected: **User Content** (leaderboard name + solve grid/time).
  - Linked to identity: **No** (no accounts; name is a 3-char handle).
  - Used for tracking: **No**.
- No other data types (no analytics SDK in the native build, no ads, no
  identifiers).

## Age rating

No objectionable content → 4+. The leaderboard shows user-chosen 3-letter
names; moderation is server-enforced (see below), with in-app reporting.

## Review notes (paste into App Store Connect)

> Caladay is a daily spatial puzzle (the classic "calendar puzzle").
> Native capabilities beyond the web version:
> - Haptic feedback on piece placement, invalid moves, and solving
> - Optional daily reminder via local notifications (bell icon, top right)
> - Native share sheet for sharing results as an emoji mosaic
> - Home-screen widget showing today's date and puzzle difficulty
> - Fully playable offline; the online leaderboard is optional
>
> User-generated content (3-character leaderboard names) is moderated:
> server-side profanity filtering at submission time, plus an in-app report
> button (flag icon next to each entry); entries are automatically hidden
> after multiple reports.

## Guideline-1.2 (UGC) mechanisms — implemented

- Server-side username filtering: `convex/moderation.ts` +
  `convex/solutions.ts` (`create` throws on banned/invalid names).
- Report button on every leaderboard row → `solutions.report` mutation;
  auto-hides an entry after 3 reports (`convex/solutions.ts`).
- Grid submissions are validated server-side as genuine solutions
  (`convex/validation.ts`) so the leaderboard can't be spoofed.

## Screenshots needed

- 6.9" (iPhone 16 Pro Max class) and 6.5" — puzzle mid-solve, solved state,
  leaderboard. Use the simulator once the iOS runtime is installed.

## Known follow-ups

- `solutions.list` fetches every row ever; fine at current scale, will want
  pagination eventually.
- Simulator requires the iOS platform download in Xcode
  (`xcodebuild -downloadPlatform iOS`).
