import { NextResponse } from "next/server";
import webpush from "web-push";
import { userFromRequest } from "@/lib/server";

export const runtime = "nodejs";

/** Vietnam time, now or some minutes from now, as HH:MM. */
const hhmm = (plus = 0) =>
  new Date(Date.now() + plus * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

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

/**
 * Sends a test. With { endpoint } it reports exactly what happened for this device, so Settings can say
 * why nothing arrived instead of staying quiet. Devices that Google or Apple say are gone get removed.
 */
export async function PUT(req: Request) {
  const auth = await userFromRequest(req);
  if (!auth) return NextResponse.json({ error: "You’re signed out. Sign in again, then try." }, { status: 401 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "The server is missing its push keys (VAPID). They need adding on Netlify." }, { status: 500 });
  const subject = process.env.VAPID_SUBJECT ?? "mailto:daybook@example.com";
  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (e) {
    return NextResponse.json({ error: `The server’s push keys are set up wrong: ${(e as Error).message}` }, { status: 500 });
  }
  let endpoint: string | undefined;
  try {
    endpoint = ((await req.json()) as { endpoint?: string }).endpoint;
  } catch {
    /* older clients send no body */
  }
  const { data, error } = await auth.sb.from("push_subscriptions").select("id, endpoint, subscription");
  if (error) return NextResponse.json({ error: `Couldn’t read your devices: ${error.message}` }, { status: 500 });
  const rows = data ?? [];
  const mine = endpoint ? rows.filter((r) => r.endpoint === endpoint) : rows;
  if (endpoint && mine.length === 0) return NextResponse.json({ ok: false, registered: false, devices: rows.length });

  const results: { ok: boolean; status?: number; error?: string }[] = [];
  for (const row of mine) {
    try {
      const r = await webpush.sendNotification(
        row.subscription,
        JSON.stringify({ title: "Test reminder", body: `${hhmm()} – ${hhmm(60)}\nReminders are working on this device.`, url: "/settings", tag: "test" }),
        { TTL: 120, urgency: "high" },
      );
      results.push({ ok: true, status: r.statusCode });
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      if (err.statusCode === 404 || err.statusCode === 410) await auth.sb.from("push_subscriptions").delete().eq("id", row.id);
      results.push({ ok: false, status: err.statusCode, error: (err.body || err.message || "Unknown error").slice(0, 300) });
    }
  }
  return NextResponse.json({ ok: results.some((r) => r.ok), registered: true, devices: rows.length, sent: results.filter((r) => r.ok).length, results });
}
