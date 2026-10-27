# Study Space

A responsive, dark-mode study app with subject/topic organisation, two-sided image flashcards, keyboard and phone swipe navigation, editable multiple-choice quizzes, scoring and answer review.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the address printed by Vite. `npm test` runs data-integrity and quiz-scoring tests; `npm run build` creates `dist/`. `npm run preview` serves the production build for local verification.

Add a subject with the + in the library, add a topic, then create flashcards or quizzes. Each flashcard side accepts text, an image, or both. Images are resized to a maximum of 1200 pixels and compressed before storage. Space flips a card; left/right arrow keys select the previous/next card. On a phone, swipe left for next and right for previous. Controls do not intercept keys while editing or interacting with focused controls. Tap a card to flip it.

## Saving and backups

Edits save automatically to this browser’s local storage, including compressed images. Clearing browser data or using a different browser does not retain local data. Storage capacity varies; image-heavy libraries can fill it. Export JSON from **Sync & backups** regularly, especially before imports, downloads or switching accounts. Importing a backup replaces the local library and asks for confirmation. Libraries are not merged automatically.

## Cloud hosting and cross-device access

The app is a static website. Deploy it to Netlify, Vercel or Cloudflare Pages with `npm ci && npm run build`, output directory `dist`, and Node 24. No backend is needed for local-only use.

For cloud storage and email sign-in:

1. Create a Supabase project. In its SQL editor, run `supabase/schema.sql` **once**. It creates one private library per account and enforces ownership with row-level security. Do not disable RLS.
2. Copy `.env.example` to `.env.local` for local development. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase’s project connection settings. Use the public anon or publishable key, **never** the secret/service-role key. Set the same two variables in your hosting provider before building. Public Vite variables are embedded in the browser bundle.
3. In Supabase Authentication URL Configuration, set your production Site URL and add your production origin (and local development origin if needed) to the allowed redirect URLs. Enable email authentication. Configure production SMTP and appropriate sign-up restrictions/rate limits before wider use.
4. Redeploy. Under **Sync & backups**, enter your email and open the sign-in link on the same device/browser. Upload your local library. On your other device, sign in to the same account and download it.
5. Before editing on another device, download the current cloud library. After editing, upload it. Uploads use optimistic version checks to reject overwriting a newer cloud version. Export local work if there is a conflict; automatic merging and live background sync are not implemented.

Images are stored inside the library JSON rather than a public image bucket. Keep libraries modest; a future version can use private object storage for larger collections. Local data stays on the device when signing out, so export and remove sensitive material on shared devices. Cloud credentials are not required for local use.

## Validation and limits

Automated model tests cover backups, invalid imports, subject deletion and quiz grading. Production builds are checked during development. Real email delivery, database access policies and cross-device sync must be verified in your own Supabase deployment; they cannot be verified without a configured project. This version does not include live collaboration, spaced repetition or an installed offline PWA.

## Useful next improvements

- Spaced repetition with “Again / Hard / Good / Easy” and a daily review queue.
- Quiz history and topic-level progress to identify weak spots.
- CSV/Anki import and bulk card creation.
- Private image storage for larger libraries and automatic conflict-aware sync.
- An installable offline PWA with reminders and accessible study settings.
