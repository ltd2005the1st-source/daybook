> 👋 **Want to try Daybook?** Open the live app at **https://mydeardaybook.netlify.app** and sign in with the username **`tester`** and the PIN/password **`0000`**. It's a demo account, so feel free to click around.

# Daybook

A personal dashboard for money, teaching, calendar, tasks and habits. It runs online so your phone and laptop stay in sync in real time, and installs on your phone like an app.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, auth, real-time) · Netlify (hosting) · Web Push (phone reminders). All of it fits in free tiers.

## What's in v1

| Page | What it does |
| --- | --- |
| **Today** | Your day as a timeline (routines, classes, homework checks), tasks due, makeups owed, sleep and exercise status, quick expense logging. |
| **Calendar** | Week view on desktop, day view on phone. Drag a block to move it, drag its bottom edge to change the length, right-click to recolour (Google Calendar's colours), drag across empty space to add an event. On a phone, press and hold a block to drag it. Moving a weekly class or repeating event asks "this one or every week". |
| **Tasks** | Replaces Any.do. Quick add understands "tomorrow", "fri", and a trailing "!" to flag. Each task can have milestones that drive its progress bar. Long-term goals are kept separate. |
| **Teaching** | The register: one column per student or class, one row per day, tap a cell to cycle taught → missed (makeup owed) → cancelled. Rates, makeups owed, homework logs, free-slot finder, and homework check rules per student. |
| **Receipts** | Monthly tuition receipts from the register at each student's rate, with prepaid sessions and adjustments. Print/save as PDF or copy as text for Zalo. |
| **Money** | Manual income and expense log with categories, monthly totals (teaching income is counted from the register), recurring items, and who owes whom. |
| **Habits** | Sleep chart against your target bedtime, exercise weekly target and streak, simple custom habits. |

Keyboard: ⌘K to jump anywhere or add a task.

## Run it on your computer (local mode)

```bash
npm install
cp .env.example .env.local     # leave the Supabase lines empty for local mode
npm run dev                    # open http://localhost:3000
```

With no Supabase settings, everything is saved in the browser and the app loads your starter data automatically.

## Put it online on Netlify (about 30 minutes, once)

You need free accounts on GitHub, Supabase and Netlify. Nothing here costs money.

1. **GitHub**: create an empty private repository (no README), then upload this folder to it. Without git: on the new repo page choose **uploading an existing file** and drag in everything except `node_modules` and `.next`. With git: `git remote add origin https://github.com/YOU/daybook.git && git push -u origin main`.
2. **Supabase** (database, login, sync): create a project at supabase.com and pick the Singapore region (closest to Vietnam). In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql). In **Authentication → Sign In / Providers → Email**, turn off "Confirm email". From **Project Settings → API** (or **API Keys**), copy the Project URL, the `anon` (publishable) key and the `service_role` (secret) key.
3. **Push keys**: on any computer with Node, run `npx web-push generate-vapid-keys` and keep both keys.
4. **Netlify**: app.netlify.com → **Add new project → Import an existing project → GitHub**, pick the repo. Netlify reads [`netlify.toml`](netlify.toml), so leave the build settings as they are. Before deploying, open **Environment variables** and add:

   | Key | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role / secret key |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key |
   | `VAPID_PRIVATE_KEY` | VAPID private key |
   | `VAPID_SUBJECT` | `mailto:` followed by your email |
   | `CRON_SECRET` | any long random string you make up |
   | `PIN_PEPPER` | another long random string (32+ characters). Never change it later, or your PIN stops working. |

   Click **Deploy**. Rename the site under **Project configuration → Change project name** if you want a nicer address, such as `daybook-dat.netlify.app`.
5. **Supabase login URL**: in Supabase **Authentication → URL Configuration**, set Site URL to your Netlify address.
6. **First sign-in**: open your Netlify address, pick a username and a 4-digit PIN, then press **Load my starter data**. Each device stays signed in. If you made an account with email and password before, the sign-in page asks for them once and switches you over.

   Sign-in is a username and 4-digit PIN. The server turns the PIN into a long password with `PIN_PEPPER`, so PINs can't be guessed against Supabase directly, and 5 wrong PINs lock the account for 15 minutes (doubling after that, up to a day). Only the first account can be created from the sign-in page. In Supabase **Authentication → Sign In / Providers**, you can turn off **Allow new users to sign up**; Daybook's own sign-in keeps working.
7. **Reminders**: in Supabase **Database → Extensions**, enable `pg_cron` and `pg_net`. Open [`supabase/cron.sql`](supabase/cron.sql), replace `YOUR-SITE.netlify.app` and `YOUR-CRON-SECRET`, and run it in the SQL Editor. Supabase then pings `/api/cron/reminders` every 5 minutes.
8. **Phone**: open the site in Safari (iPhone) or Chrome (Android) and choose **Add to Home Screen**. On iPhone, reminders only work from the home-screen app. Open Daybook from the icon, go to **Settings → Turn on reminders**, allow notifications, then **Send a test**.

From then on, every change pushed to GitHub redeploys the site by itself in a minute or two. Environment variable changes need **Deploys → Trigger deploy** to take effect.

## Reminders you get

- 40 and 20 minutes before every class, homework check, calendar event and task with a time. Homework check reminders list the homework still open (checks default to 22:30 the night before class; switch a student to fixed weekdays in their profile). Change the minutes per event or per student if you ever want to.
- Tasks get reminders when they have a time: type it in quick add ("Call bank tomorrow 3pm", "Nộp bài fri 15h30") or set it in the task.
- Wind-down 30 minutes before your target bedtime.
- A 07:30 brief with today's classes and tasks due.

## Notes

- All times are Vietnam time (UTC+7). Money is whole VND; "200k", "1.5tr" and "1,200,000" all work.
- Makeups left are a number you set yourself with −/+ on each student. The app never changes it.
- Google Calendar sync is not in v1. Daybook keeps its own calendar.

## Android app

`android/` is a Trusted Web Activity: a small Android app that opens the live site
(https://mydeardaybook.netlify.app) full screen, with no browser bar. It uses Chrome
underneath, so sign-in, offline cache and push reminders work the same as the website.
App changes ship by deploying the website; the Android app only needs a new build
when its icon, name, colours or package settings change.

- Package name: `app.netlify.mydeardaybook`
- Build: the **Android app** GitHub Action builds unsigned `.apk` and `.aab` files.
- Signing: done offline with the upload key, which is kept out of git
  (project files, `daybook-android-key/`). Never commit a keystore.
- `public/.well-known/assetlinks.json` must list the SHA-256 fingerprint of every key
  that signs an installed copy: the upload key (sideloaded APK) and, once on Google
  Play, the "App signing key" from Play Console → Test and release → App integrity.
- To change version: bump `versionCode` / `versionName` in `android/app/build.gradle`
  and `appVersionCode` / `appVersionName` in `android/twa-manifest.json`.

## Hosting on Firebase App Hosting (alternative to Netlify)

Supabase stays the database and auth, so only the hosting moves. [`apphosting.yaml`](apphosting.yaml) lists the environment variables. Every one is a Secret Manager secret, set once with:

```
firebase apphosting:secrets:set NEXT_PUBLIC_SUPABASE_URL
firebase apphosting:secrets:set NEXT_PUBLIC_SUPABASE_ANON_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_VAPID_PUBLIC_KEY
firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY
firebase apphosting:secrets:set PIN_PEPPER
firebase apphosting:secrets:set VAPID_PRIVATE_KEY
firebase apphosting:secrets:set VAPID_SUBJECT
firebase apphosting:secrets:set CRON_SECRET
```

Use the same values as on Netlify (never change `PIN_PEPPER`). Reminders are triggered by Supabase `pg_cron` (see [`supabase/cron.sql`](supabase/cron.sql)), not by the host, so no Cloud Scheduler is needed: re-run that SQL with the new URL once the Firebase site is live. Also add the new URL under Supabase Authentication → URL Configuration.
