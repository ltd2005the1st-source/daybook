import { NextResponse } from "next/server";
import { nowLine, SYSTEM, TOOLS } from "@/lib/assistant-tools";
import type { Block, ChatMessage, Schema } from "@/lib/assistant-types";
import { userFromRequest } from "@/lib/server";
import { isShowcase } from "@/lib/showcase";

export const runtime = "nodejs";
// Netlify stops a function after 10 seconds, so each Gemini step is kept short.
export const maxDuration = 10;

// "gemini-flash-latest" always points at the newest Flash model. Override the first choice with
// GEMINI_MODEL. When a model is overloaded (503/429/500) the next one in the list is tried.
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
].filter((m, i, a) => a.indexOf(m) === i);
const BUDGET_MS = 9_000; // Netlify cuts the function at 10 s
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};
type Content = { role: "user" | "model"; parts: Part[] };

/** Gemini takes an OpenAPI-style schema: upper-case types, no additionalProperties. */
function schema(s: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: s.type.toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.items) out.items = schema(s.items);
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, schema(v)]));
    if (s.required?.length) out.required = s.required;
  }
  return out;
}
const DECLARATIONS = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: schema(t.input_schema) }));

function toContents(messages: ChatMessage[]): Content[] {
  const names = new Map<string, string>(); // tool_use id -> function name
  const out: Content[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const blocks: Block[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    const parts: Part[] = [];
    for (const b of blocks) {
      if (b.type === "text") {
        if (b.text.trim()) parts.push({ text: b.text });
      } else if (b.type === "tool_use") {
        names.set(b.id, b.name);
        parts.push({ functionCall: { name: b.name, args: b.input }, ...(b.signature ? { thoughtSignature: b.signature } : {}) });
      } else {
        const response = b.is_error ? { error: b.content } : { result: b.content };
        parts.push({ functionResponse: { name: names.get(b.tool_use_id) ?? "tool", response } });
      }
    }
    if (parts.length) out.push({ role, parts });
  }
  return out;
}

export async function GET() {
  return NextResponse.json({ ready: !!process.env.GEMINI_API_KEY });
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "The assistant needs a GEMINI_API_KEY on the server.", code: "no_key" }, { status: 503 });
  }
  const online = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (online) {
    const auth = await userFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
    // The demo account is public, so it can't spend the owner's Gemini quota.
    if (isShowcase(auth.user)) return NextResponse.json({ error: "The assistant is turned off on the demo account.", code: "demo" }, { status: 403 });
  } else if (process.env.ALLOW_LOCAL_CHAT !== "1") {
    return NextResponse.json({ error: "Set ALLOW_LOCAL_CHAT=1 to use the assistant in local mode." }, { status: 403 });
  }

  let body: { messages?: ChatMessage[]; now?: { date: string; time: string; weekday: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { messages, now } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60 || !now?.date) {
    return NextResponse.json({ error: "Bad conversation." }, { status: 400 });
  }

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: `${SYSTEM}\n\n${nowLine(now)}` }] },
    contents: toContents(messages),
    tools: [{ functionDeclarations: DECLARATIONS }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: { maxOutputTokens: 2000, temperature: 0.4 },
  });
  const deadline = Date.now() + BUDGET_MS;
  let res: Response | null = null;
  let timedOut = false;
  for (let i = 0; i < MODELS.length; i++) {
    const left = deadline - Date.now();
    if (left < 1_200) break;
    // Leave time for the remaining models: the first attempt gets at most 5 s.
    const limit = Math.min(left, i === 0 ? 5_000 : 4_000);
    try {
      res = await fetch(`${URL_BASE}/${MODELS[i]}:generateContent`, {
        method: "POST",
        // The key goes in a header, never in the URL or the browser.
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(limit),
        body: payload,
      });
    } catch (err) {
      res = null;
      timedOut = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
      continue;
    }
    if (res.ok || !RETRYABLE.has(res.status)) break;
  }
  if (!res) {
    return NextResponse.json(
      { error: timedOut ? "Gemini took too long to answer. Try a shorter question." : "Could not reach Gemini." },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (res.status === 400 && /API key/i.test(detail?.error?.message ?? "")) {
      return NextResponse.json({ error: "The Gemini API key was rejected. Check GEMINI_API_KEY on the server." }, { status: 502 });
    }
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "The Gemini API key was rejected. Check GEMINI_API_KEY on the server." }, { status: 502 });
    }
    if (res.status === 429) return NextResponse.json({ error: "Gemini is busy right now. Try again in a moment." }, { status: 429 });
    return NextResponse.json({ error: `Gemini API error ${res.status}: ${detail?.error?.message ?? "unknown"}` }, { status: 502 });
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const cand = data.candidates?.[0];
  if (!cand || data.promptFeedback?.blockReason || cand.finishReason === "SAFETY") {
    return NextResponse.json({ content: [{ type: "text", text: "I can't help with that one." }], stop_reason: "refusal" });
  }

  const content: Block[] = [];
  let n = 0;
  for (const p of cand.content?.parts ?? []) {
    if (p.thought) continue;
    if (p.functionCall) {
      content.push({ type: "tool_use", id: `call_${n++}`, name: p.functionCall.name, input: p.functionCall.args ?? {}, signature: p.thoughtSignature });
    } else if (p.text) {
      content.push({ type: "text", text: p.text });
    }
  }
  const uses = content.some((b) => b.type === "tool_use");
  return NextResponse.json({ content, stop_reason: uses ? "tool_use" : "end_turn" });
}
