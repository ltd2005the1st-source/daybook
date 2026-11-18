import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { nowLine, SYSTEM, TOOLS } from "@/lib/assistant-tools";
import { userFromRequest } from "@/lib/server";
import { isShowcase } from "@/lib/showcase";

export const runtime = "nodejs";
// Netlify stops a function after 10 seconds, so each Claude step is kept short.
export const maxDuration = 10;

const MODEL = "claude-haiku-5-5";

export async function GET() {
  return NextResponse.json({ ready: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The assistant needs an ANTHROPIC_API_KEY on the server.", code: "no_key" }, { status: 503 });
  }
  const online = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (online) {
    const auth = await userFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
    // The demo account is public, so it can't spend the owner's Claude credit.
    if (isShowcase(auth.user)) return NextResponse.json({ error: "The assistant is turned off on the demo account.", code: "demo" }, { status: 403 });
  } else if (process.env.ALLOW_LOCAL_CHAT !== "1") {
    return NextResponse.json({ error: "Set ALLOW_LOCAL_CHAT=1 to use the assistant in local mode." }, { status: 403 });
  }

  let body: { messages?: Anthropic.MessageParam[]; now?: { date: string; time: string; weekday: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { messages, now } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60 || !now?.date) {
    return NextResponse.json({ error: "Bad conversation." }, { status: 400 });
  }

  const client = new Anthropic({ timeout: 9_000, maxRetries: 0 });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: nowLine(now) },
      ],
      tools: TOOLS,
      messages,
      output_config: { effort: "low" },
    });
    return NextResponse.json({ content: res.content, stop_reason: res.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return NextResponse.json({ error: "Claude took too long to answer. Try a shorter question." }, { status: 504 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on Netlify." }, { status: 502 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Claude is busy right now. Try again in a moment." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error ${err.status ?? ""}: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not reach Claude." }, { status: 502 });
  }
}
