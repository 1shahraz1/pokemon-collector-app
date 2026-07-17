# Collector Challenges (phase 1 alpha)

Daily challenges, points, streaks, referrals, and prize giveaway entries for Pokemon card collectors. Built with Next.js and Supabase.

## What's in here

- `app/page.js` — home screen: points, streak, invite-friends card, today's challenges (photo upload, quiz, simple actions)
- `app/onboarding/page.js` — required profile setup (name, username, shipping address, profile picture, favorite set), also used to edit your profile later
- `app/giveaway/page.js` — list of giveaways and your entry counts
- `app/profile/page.js` — your stats, edit profile, sign out
- `app/admin/page.js` — add challenges (with type: custom action, log card, photo upload, or quiz), manage quiz questions, review photo submissions, add giveaways, pick a winner
- `app/login/page.js` — email sign-in (magic link, no password), carries referral codes through
- `supabase/schema.sql` — the entire database setup: tables, security rules, storage buckets, and the server-side functions that award points/entries (run once in Supabase)

## How the pieces fit together

Signing up only asks for an email. The account can't see challenges until the profile form is filled out (name, username, shipping address, profile picture, favorite set) — that's enforced by the app, not just a suggestion.

All points, streaks, and giveaway entries are calculated inside Supabase (in `complete_challenge`, `submit_quiz`, and `apply_referral`), never directly by the app in the browser. That's deliberate: it means nobody can open their browser's dev tools and hand themselves extra points.

Referrals are credited the day a referred friend finishes their profile (not just signs up), and each referrer can only earn credited referrals up to a daily cap — both are there specifically to stop referral farming.

Photo challenge submissions post points instantly, and show up in `/admin` so you can flag anything suspicious after the fact.

## Deploy it (no coding needed, about 15 minutes)

### 1. Create a Supabase project
Go to supabase.com, sign up free, click "New project." Name it anything, set a database password (save it somewhere), pick a region, create.

Once it's ready: open the SQL editor (left sidebar), click "New query," paste in the entire contents of `supabase/schema.sql`, click Run. This creates every table, security rule, storage bucket, and starter challenge in one go — no separate Storage setup needed.

Then go to Project Settings -> API. Copy the "Project URL" and the "anon public" key — you'll need both in step 3.

### 2. Put the code on GitHub
Go to github.com, sign up free if you don't have an account. Click the "+" in the top right -> "New repository." Name it `pokemon-collector-app`, keep it private or public, click "Create repository."

On the next page, click "uploading an existing file." Drag the entire `pokemon-app` folder into the browser window. GitHub will keep the folder structure. Commit the files.

### 3. Deploy on Vercel
Go to vercel.com, sign up free using your GitHub account. Click "Add New" -> "Project," select the `pokemon-collector-app` repo, click Import.

Before deploying, add two environment variables:
- `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from step 1
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key from step 1

Click Deploy. In about a minute you'll get a live link like `pokemon-collector-app.vercel.app`.

### 4. Try it
Open the link on your phone, sign in with your email (you'll get a magic link email), fill out your profile, and you should see today's challenges. On iPhone, tap the share icon -> "Add to Home Screen" to make it feel like a real app icon.

### 5. Make yourself an admin
In Supabase, go to Table editor -> profiles, find the row with your email, set `is_admin` to `true`. Now `/admin` on your deployed link lets you add challenges, manage quiz questions, review photo submissions, add giveaways, and pick winners.

### 6. Try the referral flow
On your profile picture card on the home screen, tap "Copy link" — that's your personal invite link (`/login?ref=yourcode`). Anyone who signs up through it and finishes their profile counts toward your referral total automatically.

## Making future changes

Any time you want to tweak wording, colors, or layout, describe the change here and the code gets updated. Every time you push updated files to GitHub, Vercel automatically redeploys — nothing manual needed after the first setup.
