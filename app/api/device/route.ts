import { NextResponse } from "next/server";
import { vnNow } from "@/lib/dates";
import { deviceToken, userFromDeviceToken } from "@/lib/device-token";
import { upcomingReminders } from "@/lib/reminders";
import { serviceClient, userFromRequest } from "@/lib/server";
import { TABLES, type Store } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Android app's reminders. POST (signed in) hands the app its device key;
// GET with that key returns the next two days of reminders, which the app schedules on the phone.

export async function POST(req: Request) {
  const who = await userFromRequest(req);
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const token = deviceToken(who.user.id);
  if (!token) return NextResponse.json({ error: "PIN_PEPPER is missing on the server" }, { status: 500 });
  return NextResponse.json({ token });
}

export async function GET(req: Request) {
  const uid = userFromDeviceToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!uid) return NextResponse.json({ error: "Unknown device" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Supabase service key missing" }, { status: 500 });

  const store = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Store;
  const needed = ["students", "slots", "lessons", "homework", "events", "tasks", "habits"] as const;
  const results = await Promise.all(needed.map((t) => sb.from(t).select("*").eq("user_id", uid)));
  for (const [i, r] of results.entries()) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    (store as Record<string, unknown[]>)[needed[i]] = r.data ?? [];
  }
  return NextResponse.json({ reminders: upcomingReminders(store, vnNow().date) }, { headers: { "Cache-Control": "no-store" } });
}
