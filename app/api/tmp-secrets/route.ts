import { NextResponse } from "next/server";
import { createHash } from "crypto";

// TEMPORARY: hands four server secrets to the owner once, during the move to Firebase.
// Deleted right after. Only the sha256 of the access token is stored here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = "9c17c8f1213d31d17989d2ce2ffaf9cb8f70e6d182fd20a49011bf33081747dd";

export async function GET(req: Request) {
  const t = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (createHash("sha256").update(t).digest("hex") !== HASH) return NextResponse.json({ error: "no" }, { status: 404 });
  const e = process.env;
  return NextResponse.json(
    {
      SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY ?? null,
      PIN_PEPPER: e.PIN_PEPPER ?? null,
      VAPID_PRIVATE_KEY: e.VAPID_PRIVATE_KEY ?? null,
      CRON_SECRET: e.CRON_SECRET ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
