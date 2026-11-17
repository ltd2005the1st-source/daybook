# Daybook

A personal dashboard for money, teaching, calendar, tasks and habits. It runs online so your phone and laptop stay in sync in real time, installs on your phone like an app, and has a Claude Haiku assistant that can log things and answer questions about your data.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, auth, real-time) · Vercel (hosting) · Web Push (phone reminders) · Claude Haiku 5.5 (assistant). All of it fits in free tiers except Claude API usage, which costs cents a month at Haiku prices.

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

## Put it online (about 20 minutes, once)

1. **Supabase** (database + login + sync): create a free project at supabase.com. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql). In **Authentication → Providers → Email**, you can turn off "Confirm email" since you are the only user. Copy the Project URL, `anon` key and `service_role` key from **Project Settings → API**.
2. **Anthropic API key**: create one at console.anthropic.com → API Keys.
3. **Push keys**: run `npx web-push generate-vapid-keys` and keep both keys.
4. **Vercel** (hosting): import this GitHub repository at vercel.com/new. Add the environment variables from [`.env.example`](.env.example) (everything except `ALLOW_LOCAL_CHAT`). Deploy.
5. **Sign up** on your new site with your email and a password, then press **Load my starter data**.
6. **Reminders**: in Supabase, enable the `pg_cron` and `pg_net` extensions (**Database → Extensions**), edit the URL and secret in [`supabase/cron.sql`](supabase/cron.sql), and run it. It pings `/api/cron/reminders` every 5 minutes.
7. **Phone**: open the site in Safari (iPhone) or Chrome (Android) and choose **Add to Home Screen**. Open Daybook from the home screen, go to **Settings → Turn on reminders**, then **Send a test**.

## Reminders you get

- Homework check: before each student's check block (default 22:30 the night before class, 30 minutes ahead), listing the homework still open. Switch a student to fixed weekdays in their profile.
- Calendar events with "remind me" minutes.
- Wind-down 30 minutes before your target bedtime.
- A 07:30 brief with today's classes and tasks due.

## Notes

- All times are Vietnam time (UTC+7). Money is whole VND; "200k", "1.5tr" and "1,200,000" all work.
- Makeups owed = the starting count per student + missed classes − classes taught on unscheduled days.
- Google Calendar sync is not in v1. Daybook keeps its own calendar.
