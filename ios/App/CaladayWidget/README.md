# CaladayWidget — one-time Xcode setup

The Swift files in this folder implement a small home-screen widget showing
today's date and puzzle difficulty. Adding an extension target has to be done
once in the Xcode GUI:

1. Open `ios/App/App.xcodeproj` in Xcode.
2. **File → New → Target… → Widget Extension** (iOS).
   - Product name: `CaladayWidget`
   - Uncheck "Include Configuration App Intent" (we use a static widget).
   - Team/bundle: `com.caladay.app.CaladayWidget`, same team as the app.
   - When asked, do NOT activate the new scheme's generated content yet.
3. Delete the template Swift files Xcode generated inside its `CaladayWidget`
   group, and add the two files from this folder instead
   (`CaladayWidgetBundle.swift`, `CaladayWidget.swift`) — make sure their
   target membership is `CaladayWidget`.
4. Add `public/solutions-cache.csv` (repo root) to the widget target as a
   bundle resource, named `solutions-cache.csv`.
   (Drag it into the CaladayWidget group, check "CaladayWidget" under
   target membership. Reference, don't copy, so it stays in sync with the
   web app's copy.)
5. Build & run the `App` scheme; long-press the home screen → add the
   "Caladay" widget.

Note: the difficulty data is a static lookup table (same file the web app's
difficulty bar uses), so the widget works fully offline and needs no
app-group plumbing.
