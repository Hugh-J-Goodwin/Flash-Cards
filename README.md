# Study Space

A responsive dark-mode school study app: organise subjects and topics, study image flashcards, make multiple-choice quizzes, review due cards, and track your progress. Install it on a phone or computer and keep studying offline.

## Run and test

Requires Node.js 22.12+; Node 24 recommended.

```sh
npm ci
npm run dev
```

`npm test` runs model and sync-integrity tests. `npm run build` creates the production site in `dist/`; `npm run preview` serves it locally.

`npm run test:e2e` builds an isolated production test site, then runs Chromium browser tests for automatic sync, multi-device conflicts, offline persistence, account separation, reviews and quiz history. Supabase is simulated; no production credentials are used. The test build goes to ignored `dist-e2e/`, never deploy that directory. Install a test browser using `npx playwright install chromium` if none is available, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium executable. System `/usr/bin/chromium` is detected automatically.

## Flashcards and quizzes

Add a subject with the library + button, add a topic, then create cards or quizzes. Flashcards accept text and images on either side. Uploaded images are resized to at most 1200 pixels and compressed. Tap or press Space to flip a card; use arrow keys or swipe left/right to navigate. Keyboard shortcuts do not intercept text editing or focused controls.

After revealing an answer, rate it **Again**, **Hard** or **Easy**. Again schedules a review in 10 minutes. Hard starts at one day and increases the previous interval by 1.2×; Easy starts at three days and increases it by 2.5×. This is a simple interval-based scheduler, not a prediction of mastery. **Review due cards** shows new and overdue cards for the current topic; **Browse all cards** includes cards scheduled for later. Editing a card preserves its schedule.

**Progress** shows due cards, cards reviewed at least once, weighted topic quiz accuracy, and completed quiz history for the current subject. Scores are recorded only when finishing a quiz, not when exiting it. New history starts with this update; old quiz results cannot be recovered retroactively. Deleting a topic hides its old attempts from the subject view, but history remains in JSON backups. The latest 50 attempts are displayed; all attempts count toward accuracy.

## Automatic cloud sync

The app saves every change locally first. Signed-in users get a separate local library per account. On sign-in, the app loads that account's cloud library automatically. Edits, review schedules and quiz results upload automatically after a short delay. It checks for other-device updates every 15 seconds while visible, on window focus, and when reconnecting. **Sync now** is available in the **Sign in** menu. This is polling-based sync, not live collaborative editing.

Offline edits survive reloads and upload when connectivity returns and the app is open. Background syncing while the app is closed is not supported. Wait for **All changes synced** before changing devices. A valid existing session supports offline study; signing in for the first time requires an internet connection.

Cloud writes compare the last downloaded version against the server and update only if that version still matches. If two devices have edited the library, automatic sync pauses. the **Sign in** menu lets you export both libraries and choose which whole library to keep. Conflicting records are not merged automatically. Both versions are also saved locally before replacement; **Export last conflict backup** retrieves this recovery file. If storage is full, conflict resolution stops rather than discarding either version. A cloud copy changed during resolution must be reviewed again.

An open editor or active quiz delays incoming replacements so drafts are not silently lost. Stale edits from another browser tab are rejected; close the editor and refresh before retrying. Avoid editing the same account in several tabs at once.

### Upgrading from the original app

No database migration or additional SQL is required. Keep the same two public environment variables and redeploy.

The previous `study-space-v1` browser library is retained as device-only data and is never uploaded into an account automatically. Existing cloud libraries load after sign-in. If older unsynced cards are missing from the account, export the current account as a backup, then use **Import device library**. This replaces the account's current library after confirmation; it does not merge it. Import only your own device data.

Signing out switches to the device-only library and removes the account's content from the view. Unsynced edits remain cached under that account for the next sign-in. Account caches are not encrypted against someone with access to the same browser profile or developer tools. On shared computers, use separate OS/browser profiles or private browsing and export your work before clearing browser data.

## Install and study offline

The production build includes a web app manifest, icons and a service worker. Deploy over HTTPS and open the app online once so its app shell is cached. The worker caches only public application files, never Supabase API responses, sign-in requests or credentials. Study data stays in local storage.

- **iPhone/iPad:** open the site in Safari, tap Share → Add to Home Screen.
- **Android:** use the app's Install button under the **Sign in** menu when available, or your browser's Install app / Add to Home screen menu.
- **Desktop Chrome/Edge:** use the address-bar Install icon or the browser menu.

The app also works offline in an ordinary browser tab once cached. A fresh device must visit online first. When a new version is ready, an update banner offers a controlled reload. Finish editors/quizzes and sync pending changes before updating. Browser storage eviction, private browsing and clearing website data can remove offline copies. Export regular backups; a cached app is not a backup.

## Backups and storage

Export JSON from the **Sign in** menu regularly. Import replaces the current library after confirmation, then automatically syncs it if signed in. Backups include images, review schedules and quiz history. Older valid backups still import. Conflict exports contain two libraries under `local` and `cloud`; to restore one, import its individual exported library or extract the appropriate object into its own JSON file.

Images are stored in library JSON rather than public object storage. Browser local-storage limits vary (often around 5 MB), so image-heavy libraries can fill them. Save failures are displayed and do not mark changes as saved. Consider private object storage for very large collections.

## Deploy with Supabase

Deploy to Vercel, Netlify or Cloudflare Pages using `npm ci && npm run build`, output `dist`, Node 24. The app still works locally without cloud configuration.

For email accounts and cloud data:

1. Create a Supabase project and run `supabase/schema.sql` **once** in its SQL editor. It creates one private JSON library per user, protected with row-level security. Do not disable RLS. Existing installations do not rerun this script.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's build environment. Use the public anon or publishable key, **never** a secret or service-role key. For local development, copy `.env.example` to `.env.local` and fill in the same public values. Vite embeds these public configuration values into the browser bundle.
3. In Supabase Authentication → URL Configuration, set the production Site URL and add the production origin to Redirect URLs. Add local development origins only if needed.
4. Enable email authentication. Configure production SMTP and appropriate sign-up restrictions and rate limits before inviting others; the default email service is restricted and intended for testing.
5. Redeploy and sign in with an email link in the same device/browser. Create a card, wait for **All changes synced**, then sign in on another device and confirm it appears automatically.

The tests simulate Supabase to verify client sync behavior; they do not establish real email delivery or production database permission correctness. Verify with your deployed project and two accounts that each account sees only its own data. The included policies enforce this ownership on the server.

## Future ideas

Private image storage for larger collections, CSV/Anki import, richer per-question explanations, study goals and optional reminders.
