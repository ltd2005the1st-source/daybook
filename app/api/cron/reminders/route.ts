import { NextResponse } from "next/server";
import webpush from "web-push";
import { vnNow } from "@/lib/dates";
import { remindersFor } from "@/lib/reminders";
import { serviceClient } from "@/lib/server";
import { TABLES, type Store } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every 5 minutes by Supabase pg_cron (see supabase/cron.sql).
// A reminder is sent once if its time passed within the last WINDOW minutes.
const WINDOW = 15;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || given !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = serviceClient();
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!sb || !pub || !priv) return NextResponse.json({ error: "Supabase service key or VAPID keys missing" }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:daybook@example.com", pub, priv);

  const now = vnNow();
  const { data: subs } = await sb.from("push_subscriptions").select("id, user_id, endpoint, subscription");
  const users = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  const report: { user: string; sent: string[] }[] = [];

  for (const uid of users) {
    const store = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Store;
    const needed = ["students", "slots", "lessons", "homework", "events", "tasks", "habits"] as const;
    const results = await Promise.all(needed.map((t) => sb.from(t).select("*").eq("user_id", uid)));
    needed.forEach((t, i) => ((store as Record<string, unknown[]>)[t] = results[i].data ?? []));

    const due = remindersFor(store, now.date).filter((r) => now.minutes >= r.at && now.minutes - r.at < WINDOW);
    const sent: string[] = [];
    for (const r of due) {
      const key = `${uid}:${r.key}`;
      const { error: dup } = await sb.from("notifications_sent").insert({ key, user_id: uid });
      if (dup) continue; // already sent
      for (const s of (subs ?? []).filter((x) => x.user_id === uid)) {
        try {
          await webpush.sendNotification(s.subscription, JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.key }));
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
      sent.push(r.key);
    }
    report.push({ user: uid.slice(0, 8), sent });
  }

  // Keep the dedupe table small.
  await sb.from("notifications_sent").delete().lt("sent_at", new Date(Date.now() - 3 * 86400_000).toISOString());
  return NextResponse.json({ at: `${now.date} ${now.time}`, report });
}

export const GET = handle;
export const POST = handle;
