mobile-friendly implementation of the caesar "calendar a day puzzle" (see: [physical puzzle](https://www.amazon.com/True-Genius-One-Day-Brainteasers/dp/B0CHWYG2PC))
for each day, try to fit all the puzzle pieces on the board without touching the current day and month.

<img width="1622" height="1054" alt="Screenshot 2026-01-04 at 4 34 28 PM" src="https://github.com/user-attachments/assets/d7a71d64-dbf1-4b38-bc4c-18b7e26e4b80" />
<img width="1622" height="1054" alt="Screenshot 2026-01-04 at 4 34 31 PM" src="https://github.com/user-attachments/assets/b440c399-dad8-4b00-9ffb-0cbab37328aa" />

## iOS app

The same static build ships as an iOS app via Capacitor (`ios/`):

- `npm run ios:sync` — rebuild the web bundle and copy it into the iOS project
- `npm run ios:open` — open the Xcode project

See `docs/app-store.md` for the App Store submission checklist (signing,
privacy labels, review notes) and `ios/App/CaladayWidget/README.md` for the
one-time widget setup.
