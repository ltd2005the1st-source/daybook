import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { nowLine, SYSTEM, TOOLS } from "@/lib/tools-def";

export const runtime = "nodejs";
// Netlify stops a function after 10 seconds, so keep each Claude turn short.
export const maxDuration = 10;

const MODEL = "claude-haiku-5-5";

async function authorized(req: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return process.env.ALLOW_LOCAL_CHAT === "1";
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  return !error && !!data.user;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 500 });
  }
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
  }
  const body = (await req.json()) as {
    messages: Anthropic.MessageParam[];
    now: { date: string; time: string; weekday: string };
  };
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 80) {
    return NextResponse.json({ error: "Bad conversation." }, { status: 400 });
  }

  const client = new Anthropic({ timeout: 9_000, maxRetries: 0 });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: nowLine(body.now) },
      ],
      tools: TOOLS,
      messages: body.messages,
      output_config: { effort: "low" },
    });
    return NextResponse.json({ content: res.content, stop_reason: res.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return NextResponse.json({ error: "Claude took too long to answer. Try a shorter question." }, { status: 504 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Claude is busy right now. Try again in a moment." }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error ${err.status}: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not reach Claude." }, { status: 502 });
  }
}
