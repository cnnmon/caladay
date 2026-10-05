# Caladay — Google Play submission guide

The Android app is the same static Next.js bundle as the web and iOS apps,
wrapped with Capacitor (`android/`). `npm run android:sync` rebuilds the web
bundle (analytics off) and copies it into the Android project;
`npm run android:open` opens it in Android Studio.

## Toolchain on this Mac

Installed 2026-10-04, no Android Studio needed:

- JDK 21: `brew install openjdk@21` →
  `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
- Android SDK: `~/Library/Android/sdk` (platform 36, build-tools 36,
  emulator, cmdline-tools).
- Emulators: AVDs `caladay_pixel` and `caladay_pixel_361` (Pixel 8,
  Android 16, Google Play images).

Gradle needs `JAVA_HOME` and the SDK location (`ANDROID_HOME`, or a
gitignored `android/local.properties` with `sdk.dir=...`):

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
npm run android:sync                     # web bundle into android/
cd android && ./gradlew assembleDebug    # emulator/sideload APK
cd android && ./gradlew bundleRelease    # Play upload (.aab)
```

Outputs: `android/app/build/outputs/apk/debug/app-debug.apk` and
`android/app/build/outputs/bundle/release/app-release.aab`.

## Before every Play upload

1. `npm run android:sync`
2. Bump `versionCode` in `android/app/build.gradle` (every upload needs a
   higher one; it's independent of the iOS build number). Keep
   `versionName` in step with the iOS release.
3. `cd android && ./gradlew bundleRelease`, then upload the `.aab` in Play
   Console.

## One-time setup remaining

- [ ] **Play Console account**: play.google.com/console, $25 one-time fee,
      identity verification (can take a few days). A **personal** account
      created after Nov 13, 2023 must run a closed test with **at least 12
      testers opted in for 14 consecutive days** before it can apply for
      production access. An organization account (needs a D-U-N-S number)
      skips that.
- [ ] **Upload key**: generate it yourself and keep it and its password in
      your password manager. Store the file outside the repo:

      ```sh
      mkdir -p ~/.android-keys
      $JAVA_HOME/bin/keytool -genkeypair -v -keystore ~/.android-keys/caladay-upload.jks \
        -alias upload -keyalg RSA -keysize 2048 -validity 10000
      ```

      Then create `android/keystore.properties` (gitignored):

      ```properties
      storeFile=/Users/alex/.android-keys/caladay-upload.jks
      storePassword=...
      keyAlias=upload
      keyPassword=...
      ```

      Play App Signing (on by default for new apps) keeps the real app
      signing key at Google, so a lost upload key can be reset through Play
      support. The package name `com.caladay.app` can never change after the
      first upload.
- [ ] **Supabase, before testers get a build**: run
      `supabase/migrations/0006_android_platform.sql` in the dashboard SQL
      editor, then `npx supabase functions deploy submit-solution`. Until
      both are done the old function records Android solves as "web", and a
      just-submitted solve can briefly show twice on the leaderboard.
- [ ] **Privacy policy**: publish cala.day with the Android wording in
      `app/privacy/page.tsx` (Sites, via Codex) before filling in App content.

## Play Console — app setup

- App name: **Caladay** · Default language: English (US)
- App or game: **Game** · Category: **Puzzle** · Free
- Contact email: the same address as the privacy page
- Privacy policy URL: https://cala.day/privacy/
- Website: https://cala.day

## App content declarations

- **App access**: all functionality is available without special access.
- **Ads**: no ads.
- **Content rating** (IARC questionnaire): puzzle game, no violence or
  mature content. Answer **yes** to users interacting / user-generated
  content: leaderboard names are chosen by players and shown publicly
  (3 characters, filtered server-side, reportable in-app).
- **Target audience**: 13 and over. Including under-13 age groups brings in
  the Families policy, and the game isn't designed for children.
- **Data safety**:
  - Collects data: **Yes**, only when the player submits a solve to the
    leaderboard (optional).
    - Personal info → **Name**: the 3-character leaderboard name.
      Optional; purpose: app functionality.
    - App activity → **Other user-generated content**: the solution grid,
      puzzle date, and solve time. Optional; purpose: app functionality.
  - Shared with third parties: **No** (Supabase stores it on our behalf as
    a service provider, which Play doesn't count as sharing).
  - Encrypted in transit: **Yes** (HTTPS).
  - Deletion: users can request it by email (privacy page). There are no
    accounts, so no account-deletion URL is required.
  - No analytics, advertising ID, location, contacts, or device IDs.
- **Permissions** (merged manifest, checked 2026-10-04): `INTERNET`
  (leaderboard), `POST_NOTIFICATIONS` (optional daily reminder, requested
  only when the player turns it on), `RECEIVE_BOOT_COMPLETED` and
  `WAKE_LOCK` (keep the reminder scheduled across reboots), `VIBRATE`
  (haptics). No exact-alarm permission, so Android may deliver the 9:00
  reminder up to an hour late; Play restricts exact alarms to alarm and
  calendar apps, so keep it that way.

## Store listing

- Short description (80 max):
  > A daily calendar puzzle: fit every piece and leave only today's date showing.
- Full description:
  > Caladay is the classic calendar puzzle, one day at a time. Every day the
  > board has a new goal: fit all ten pieces so that only today's month,
  > day, and weekday are left uncovered. Every date has at least one solution, and the
  > difficulty bar shows how many there are.
  >
  > - A new puzzle every day
  > - Rotate and flip pieces, with haptic feedback as they snap into place
  > - Optional daily reminder
  > - Share your solve time without spoiling the solution
  > - Optional leaderboard with 3-letter names; other players' solutions
  >   unlock the next day
  > - Fully playable offline, no account, no ads, no tracking
- Graphics (in `docs/play-store/`): `icon-512.png`, `feature-graphic.png`
  (1024×500), and three 9:16 phone screenshots from the emulator
  (`screenshot-1-puzzle.png`, `-2-leaderboard.png`, `-3-how-to-play.png`;
  status and navigation bars cropped off). The leaderboard shot shows real
  players' 3-letter names from Oct 4, 2026; retake it if you'd rather not.

## Closed testing (personal accounts)

1. Testing → Closed testing → create a track, upload the `.aab`.
2. Add testers by email list or Google Group (at least 12, with margin for
   drop-outs) and share the opt-in link. Testers must stay opted in for 14
   consecutive days.
3. Then Dashboard → Apply for production (a short questionnaire about the
   test).

## Known follow-ups

- The hardware Back button closes the app even when a dialog is open
  (progress is kept). Fixing it needs `@capacitor/app` and a back-button
  handler that closes the open dialog first.
- The emulator images ship WebView 133/134. Phones with WebView 140+ (nearly
  all, via Play updates) draw the page under the status and navigation
  bars and pad it with `env(safe-area-inset-*)`, as on iOS. That path is
  untested here; ask closed testers to check the top and bottom edges.

- **When the Play listing goes public**, set `PLAY_STORE_LIVE = true` in
  `lib/stores.ts`. Until then the website's "get the app" links send
  iPhones to the App Store and show Android visitors nothing, and Android
  shares link to cala.day. After the flip, Android visitors get Google
  Play, computers get both stores, and Android shares link to the Play
  listing. The website change needs a Sites publish; the share link
  changes with the next Android build (and iOS build, which bundles the
  same code but is unaffected).
- No Android home-screen widget (iOS has one).
- In-app review prompts only appear in builds installed from Play.
