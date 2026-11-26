"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Eraser, Sparkles, X } from "lucide-react";
import type { Block, ChatMessage, ToolResultBlock, ToolUseBlock } from "@/lib/assistant-types";
import { useData } from "./data";
import { runTool } from "@/lib/assistant-exec";
import { vnNow, WD_LONG, weekday } from "@/lib/dates";
import { cx } from "@/lib/format";
import { sec } from "@/lib/motion";

/**
 * "Ask Gemini": a Gemini assistant that reads and logs your Daybook data. Gemini runs on the server
 * (/api/assistant); the tools it asks for run here in the browser against the same store as the rest
 * of the app, so every change syncs and shows up instantly. The conversation is kept on this device.
 */

const EASE = [0.65, 0, 0.35, 1] as const;
const HISTORY_KEY = "daybook.assistant.v1";
const KEEP = 40; // messages kept on this device
const CONTEXT = 12; // earlier messages sent along with each new question
const MAX_STEPS = 8;

const SUGGESTIONS = [
  "Spent 45k on coffee",
  "Who do I check homework for tonight?",
  "How much have I spent this month?",
  "Taught Khánh An today",
  "Slept 0:30, woke 7:15",
  "What's on tomorrow?",
];

type Msg = { id: string; role: "user" | "assistant"; text: string; actions: string[]; error?: boolean };

function readHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const v = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeHistory(m: Msg[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(m.slice(-KEEP)));
  } catch {
    /* storage blocked: keep it in memory */
  }
}

/** Earlier turns as plain text, so Gemini remembers the conversation without resending tool calls. */
function contextFrom(history: Msg[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of history.filter((x) => !x.error).slice(-CONTEXT)) {
    const text = m.role === "assistant" && m.actions.length ? `${m.text}\n\n(Done in Daybook: ${m.actions.join("; ")})` : m.text;
    if (!text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** Very small markdown: **bold**, line breaks, and "- " lists. */
function Md({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {text.split("\n").map((l, i) => {
        if (!l.trim()) return <span key={i} className="h-1" />;
        const bullet = /^\s*([-*•]|\d+\.)\s+/.test(l);
        const body = l.replace(/^\s*([-*•]|\d+\.)\s+/, "").replace(/^#+\s+/, "");
        const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <b key={j} className="font-semibold">
              {p.slice(2, -2)}
            </b>
          ) : (
            <span key={j}>{p}</span>
          ),
        );
        return bullet ? (
          <div key={i} className="flex gap-2">
            <span className="text-muted">–</span>
            <span>{parts}</span>
          </div>
        ) : (
          <p key={i}>{parts}</p>
        );
      })}
    </div>
  );
}

function Thinking() {
  return (
    <span className="inline-flex gap-1 py-1.5" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: sec(1.1), repeat: Infinity, ease: EASE, delay: i * sec(0.16) }}
        />
      ))}
    </span>
  );
}

export function useAssistantShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}

export function Assistant({ open, onClose, seed, onSeedUsed }: { open: boolean; onClose: () => void; seed?: string | null; onSeedUsed?: () => void }) {
  const { storeRef, insert, update, remove, session, online } = useData();
  const [history, setHistory] = useState<Msg[]>([]);
  const [live, setLive] = useState<{ text: string; actions: string[] } | null>(null);
  const [input, setInput] = useState("");
  const busy = live !== null;
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<Msg[]>([]);

  useEffect(() => {
    historyRef.current = readHistory();
    setHistory(historyRef.current);
  }, []);
  const push = useCallback((m: Omit<Msg, "id">) => {
    const next = [...historyRef.current, { ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }].slice(-KEEP);
    historyRef.current = next;
    setHistory(next);
    writeHistory(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", k);
    };
  }, [open, onClose]);
  useEffect(() => {
    if (open && seed) {
      onSeedUsed?.();
      send(seed);
    }
  }, [open, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [history.length, live, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const convo: ChatMessage[] = [...contextFrom(historyRef.current), { role: "user", content: q }];
    // Two user turns in a row (after an error) merge into one.
    if (convo.length > 1 && convo[convo.length - 2].role === "user") {
      const prev = convo.splice(convo.length - 2, 1)[0];
      convo[convo.length - 1] = { role: "user", content: `${prev.content}\n\n${q}` };
    }
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    push({ role: "user", text: q, actions: [] });
    setLive({ text: "", actions: [] });

    const actions: string[] = [];
    const finish = (reply: string, error?: boolean) => {
      push({ role: "assistant", text: reply, actions: [...actions], error });
      setLive(null);
    };

    if (process.env.NEXT_PUBLIC_PREVIEW === "1") {
      setTimeout(() => finish("This is the preview, so I can't reach Gemini here. On mydeardaybook.netlify.app I can log things like this and answer questions about your data."), 600);
      return;
    }
    const vn = vnNow();
    const now = { date: vn.date, time: vn.time, weekday: WD_LONG[weekday(vn.date)] };

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(online && session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ messages: convo, now }),
        });
        const data = (await res.json().catch(() => ({}))) as { content?: Block[]; stop_reason?: string; error?: string };
        if (!res.ok || !data.content) throw new Error(data.error ?? `Request failed (${res.status})`);
        convo.push({ role: "assistant", content: data.content as Block[] });

        if (data.stop_reason === "refusal") return finish("I can't help with that one.");
        const uses = data.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
        const said = data.content
          .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (data.stop_reason !== "tool_use" || uses.length === 0) return finish(said || (actions.length ? "Done." : "…"));

        const results: ToolResultBlock[] = uses.map((u) => {
          let out;
          try {
            out = runTool(u.name, (u.input ?? {}) as Record<string, unknown>, { get: () => storeRef.current, insert, update, remove });
          } catch (e) {
            out = { result: `Tool failed: ${(e as Error).message}`, error: true };
          }
          if (out.action) actions.push(out.action);
          return {
            type: "tool_result",
            tool_use_id: u.id,
            content: typeof out.result === "string" ? out.result : JSON.stringify(out.result),
            is_error: out.error || undefined,
          };
        });
        setLive({ text: said, actions: [...actions] });
        convo.push({ role: "user", content: results });
      }
      finish("I stopped after several steps. Ask me to carry on if something is missing.");
    } catch (e) {
      finish((e as Error).message || "Something went wrong.", true);
    }
  }

  function clear() {
    historyRef.current = [];
    setHistory([]);
    writeHistory([]);
  }

  const shown = [...history, ...(live ? [{ id: "live", role: "assistant" as const, text: live.text, actions: live.actions, pending: true }] : [])];

  return (
    <AnimatePresence>
      {open && (
        <div data-scroll-contain className="no-print fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end">
          <motion.div className="absolute inset-0 bg-[var(--scrim)] md:bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Ask Gemini"
            initial={{ opacity: 0, y: 28, scale: 0.98, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 28, scale: 0.98, filter: "blur(6px)" }}
            transition={{ duration: sec(0.34), ease: EASE }}
            style={{ transformOrigin: "50% 100%" }}
            className="relative flex h-[86dvh] w-full flex-col overflow-hidden rounded-t-xl glass-thick md:m-3 md:h-auto md:w-[400px] md:rounded-xl md:mb-[calc(0.75rem+var(--dock,0px))]"
          >
            <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 edge-bottom" data-scrolled>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Sparkles size={16} strokeWidth={2} />
                </span>
                <div>
                  <h3 className="display text-[18px] font-semibold leading-tight">Ask Gemini</h3>
                  <div className="text-[11.5px] text-muted">Gemini · reads and logs your daybook</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {history.length > 0 && (
                  <button aria-label="Clear conversation" title="Clear conversation" onClick={clear} disabled={busy} className="press inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink">
                    <Eraser size={15} />
                  </button>
                )}
                <button aria-label="Close" onClick={onClose} className="press inline-flex h-8 w-8 items-center justify-center rounded-full bg-hover text-ink-2 hover:text-ink">
                  <X size={17} />
                </button>
              </div>
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {shown.length === 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: sec(0.3), ease: EASE }}>
                  <p className="mb-3 text-[14px] text-ink-2">Tell me what happened, or ask about anything in your daybook. English or Vietnamese both work.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="press rounded-xl border border-line px-3 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink">
                        {s}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
              <div className="flex flex-col gap-3">
                {shown.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: sec(0.26), ease: EASE }}
                    className={cx(
                      "max-w-[88%] text-[14.5px] leading-relaxed",
                      m.role === "user" ? "self-end rounded-xl bg-accent px-3.5 py-2 text-white" : "self-start",
                    )}
                  >
                    {m.role === "assistant" && m.actions.length > 0 && (
                      <div className="mb-1.5 flex flex-col items-start gap-1">
                        {m.actions.map((a, i) => (
                          <span key={i} className="inline-flex items-start gap-1.5 rounded-xl bg-good-soft px-2 py-1 text-[12.5px] text-good">
                            <svg width="12" height="12" viewBox="0 0 16 16" className="mt-[3px] shrink-0" aria-hidden>
                              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    {"error" in m && m.error ? (
                      <p className="rounded-xl bg-pen-soft px-3 py-2 text-[13.5px] text-pen">{m.text}</p>
                    ) : m.text ? (
                      <Md text={m.text} />
                    ) : null}
                    {"pending" in m && m.pending && <Thinking />}
                  </motion.div>
                ))}
              </div>
            </div>

            <form
              className="edge-top px-3 pt-3 pb-[max(var(--sab),12px)]"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className="flex items-end gap-2 rounded-xl border border-line bg-surface px-3 py-2 focus-within:border-ink-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="max-h-32 flex-1 resize-none bg-transparent py-1 text-[15px] outline-none placeholder:text-muted focus-visible:outline-none"
                  placeholder="Spent 200k on Grab, or ask a question"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                />
                <button
                  aria-label="Send"
                  disabled={busy || !input.trim()}
                  className={cx("press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity", (busy || !input.trim()) && "opacity-30")}
                >
                  <ArrowUp size={16} strokeWidth={2.2} />
                </button>
              </div>
            </form>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
