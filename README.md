# Daybook

A personal dashboard for money, teaching, calendar, tasks and habits. It runs online so your phone and laptop stay in sync in real time, installs on your phone like an app, and has a Claude Haiku assistant that can log things and answer questions about your data.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, auth, real-time) · Netlify (hosting) · Web Push (phone reminders) · Claude Haiku 5.5 (assistant). All of it fits in free tiers except Claude API usage, which costs cents a month at Haiku prices.

## What's in v1

| Page | What it does |
| --- | --- |
| **Today** | Your day as a timeline (routines, classes, homework checks), tasks due, makeups owed, sleep and exercise status, quick expense logging. |
| **Calendar** | Week view on desktop, day view on phone. Classes come from each student's weekly schedule; homework check blocks are generated the night before each class. Add one-off or weekly events with reminders. |
| **Tasks** | Replaces Any.do. Quick add understands "tomorrow", "fri", and a trailing "!" to flag. Each task can have milestones that drive its progress bar. Long-term goals are kept separate. |
| **Teaching** | The register: one column per student or class, one row per day, tap a cell to cycle taught → missed (makeup owed) → cancelled. Rates, makeups owed, homework logs, free-slot finder, and homework check rules per student. |
| **Receipts** | Monthly tuition receipts from the register at each student's rate, with prepaid sessions and adjustments. Print/save as PDF or copy as text for Zalo. |
| **Money** | Manual income and expense log with categories, monthly totals (teaching income is counted from the register), recurring items, and who owes whom. |
| **Habits** | Sleep chart against your target bedtime, exercise weekly target and streak, simple custom habits. |
| **Ask Claude** | ⌘J or the sparkle button. "Spent 45k on coffee", "Taught Bách today, assigned 2 essays", "How much did I spend on food this month?" |

Keyboard: ⌘K jump/add, ⌘J assistant.

## Run it on your computer (local mode)

```bash
npm install
cp .env.example .env.local     # leave the Supabase lines empty for local mode
npm run dev                    # open http://localhost:3000
```

With no Supabase settings, everything is saved in the browser and the app loads your starter data automatically. Add `ANTHROPIC_API_KEY` and `ALLOW_LOCAL_CHAT=1` to use the assistant locally.

## Put it online on Netlify (about 30 minutes, once)

You need free accounts on GitHub, Supabase and Netlify, plus an Anthropic API account with a little credit.

1. **GitHub**: create an empty private repository (no README), then upload this folder to it. Without git: on the new repo page choose **uploading an existing file** and drag in everything except `node_modules` and `.next`. With git: `git remote add origin https://github.com/YOU/daybook.git && git push -u origin main`.
2. **Supabase** (database, login, sync): create a project at supabase.com and pick the Singapore region (closest to Vietnam). In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql). In **Authentication → Sign In / Providers → Email**, turn off "Confirm email". From **Project Settings → API** (or **API Keys**), copy the Project URL, the `anon` (publishable) key and the `service_role` (secret) key.
3. **Anthropic key**: console.anthropic.com → **API Keys** → Create key. Add a few dollars of credit under **Billing**.
4. **Push keys**: on any computer with Node, run `npx web-push generate-vapid-keys` and keep both keys.
5. **Netlify**: app.netlify.com → **Add new project → Import an existing project → GitHub**, pick the repo. Netlify reads [`netlify.toml`](netlify.toml), so leave the build settings as they are. Before deploying, open **Environment variables** and add:

   | Key | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role / secret key |
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key |
   | `VAPID_PRIVATE_KEY` | VAPID private key |
   | `VAPID_SUBJECT` | `mailto:` followed by your email |
   | `CRON_SECRET` | any long random string you make up |

   Do not add `ALLOW_LOCAL_CHAT`. Click **Deploy**. Rename the site under **Project configuration → Change project name** if you want a nicer address, such as `daybook-dat.netlify.app`.
6. **Supabase login URL**: in Supabase **Authentication → URL Configuration**, set Site URL to your Netlify address.
7. **First sign-in**: open your Netlify address, create your account with email and a password, then press **Load my starter data**.
8. **Reminders**: in Supabase **Database → Extensions**, enable `pg_cron` and `pg_net`. Open [`supabase/cron.sql`](supabase/cron.sql), replace `YOUR-SITE.netlify.app` and `YOUR-CRON-SECRET`, and run it in the SQL Editor. Supabase then pings `/api/cron/reminders` every 5 minutes.
9. **Phone**: open the site in Safari (iPhone) or Chrome (Android) and choose **Add to Home Screen**. On iPhone, reminders only work from the home-screen app. Open Daybook from the icon, go to **Settings → Turn on reminders**, allow notifications, then **Send a test**.

From then on, every change pushed to GitHub redeploys the site by itself in a minute or two. Environment variable changes need **Deploys → Trigger deploy** to take effect.

## Reminders you get

- Homework check: before each student's check block (default 22:30 the night before class, 30 minutes ahead), listing the homework still open. Switch a student to fixed weekdays in their profile.
- Calendar events with "remind me" minutes.
- Wind-down 30 minutes before your target bedtime.
- A 07:30 brief with today's classes and tasks due.

## Notes

- All times are Vietnam time (UTC+7). Money is whole VND; "200k", "1.5tr" and "1,200,000" all work.
- Makeups left are a number you set yourself with −/+ on each student. The app never changes it.
- Google Calendar sync is not in v1. Daybook keeps its own calendar.
