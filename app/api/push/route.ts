import { NextResponse } from "next/server";
import webpush from "web-push";
import { userFromRequest } from "@/lib/server";

export const runtime = "nodejs";

/** Save this device's push subscription (POST), remove it (DELETE), or send a test (PUT). */
export async function POST(req: Request) {
  const auth = await userFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { subscription } = (await req.json()) as { subscription: { endpoint: string } };
  if (!subscription?.endpoint) return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
  const { error } = await auth.sb
    .from("push_subscriptions")
    .upsert({ endpoint: subscription.endpoint, subscription, user_id: auth.user.id }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await userFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { endpoint } = (await req.json()) as { endpoint: string };
  await auth.sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const auth = await userFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "VAPID keys are not set on the server." }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:daybook@example.com", pub, priv);
  const { data } = await auth.sb.from("push_subscriptions").select("subscription");
  let sent = 0;
  for (const row of data ?? []) {
    try {
      await webpush.sendNotification(
        row.subscription,
        JSON.stringify({ title: "Daybook", body: "Reminders are working on this device.", url: "/" }),
      );
      sent++;
    } catch {
      /* ignore dead devices here; the cron cleans them up */
    }
  }
  return NextResponse.json({ ok: true, sent });
}
