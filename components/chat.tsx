"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Eraser, X } from "lucide-react";
import type Anthropic from "@anthropic-ai/sdk";
import { useData } from "./data";
import { runTool } from "@/lib/tools-exec";
import { today, WD_LONG, weekday } from "@/lib/dates";
import { cx } from "@/lib/format";

const SUGGESTIONS = [
  "Spent 45k on coffee",
  "How much did I spend on food this month?",
  "Taught Khánh An today, assigned 2 essays",
  "Who do I check homework for tonight?",
  "Slept 0:30, woke 7:15",
  "Add a task: French A2 course with 4 milestones",
];

type Live = { role: "user" | "assistant"; text: string; actions: string[]; pending?: boolean };

/** Very small markdown: **bold**, line breaks, and "- " lists. */
function Md({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="flex flex-col gap-1">
      {lines.map((l, i) => {
        const bullet = /^\s*[-*•]\s+/.test(l);
        const body = l.replace(/^\s*[-*•]\s+/, "");
        const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") ? (
            <b key={j} className="font-semibold">
              {p.slice(2, -2)}
            </b>
          ) : (
            <span key={j}>{p}</span>
          ),
        );
        if (!l.trim()) return <span key={i} className="h-1" />;
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

export function ChatPanel({ open, onClose, seed, onSeedUsed }: { open: boolean; onClose: () => void; seed?: string | null; onSeedUsed?: () => void }) {
  const { store, storeRef, insert, update, remove, session, online } = useData();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live[]>([]);
  const [error, setError] = useState<string | null>(null);
  const convo = useRef<Anthropic.MessageParam[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const history = [...store.chat_messages].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")).slice(-60);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);
  useEffect(() => {
    if (open && seed) {
      onSeedUsed?.();
      send(seed);
    }
  }, [open, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [live, history.length, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    insert("chat_messages", { role: "user", text: q, actions: [] });
    setLive([{ role: "assistant", text: "", actions: [], pending: true }]);
    if (convo.current.length > 60) convo.current = [];
    convo.current.push({ role: "user", content: q });

    const actions: string[] = [];
    if (process.env.NEXT_PUBLIC_PREVIEW === "1") {
      finish(
        "This is the preview, so I can’t reach Claude here. Once Daybook is deployed with your Anthropic key, I can log things like this and answer questions about your data.",
        [],
      );
      return;
    }
    const now = new Date();
    const nowInfo = {
      date: today(),
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      weekday: WD_LONG[weekday(today())],
    };

    try {
      for (let step = 0; step < 8; step++) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(online && session ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ messages: convo.current, now: nowInfo }),
        });
        const data = (await res.json()) as { content?: Anthropic.ContentBlock[]; stop_reason?: string; error?: string };
        if (!res.ok || !data.content) throw new Error(data.error ?? `Request failed (${res.status})`);
        convo.current.push({ role: "assistant", content: data.content as Anthropic.ContentBlockParam[] });

        if (data.stop_reason === "refusal") {
          finish("I can’t help with that one.", actions);
          return;
        }
        const uses = data.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        const said = data.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();

        if (data.stop_reason !== "tool_use" || uses.length === 0) {
          finish(said || (actions.length ? "Done." : "…"), actions);
          return;
        }
        const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
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
        setLive([{ role: "assistant", text: said, actions: [...actions], pending: true }]);
        convo.current.push({ role: "user", content: results });
      }
      finish("I stopped after several steps. Ask me to continue if something is missing.", actions);
    } catch (e) {
      // Drop the unanswered turn so the next message starts cleanly.
      convo.current = [];
      setError((e as Error).message);
      setLive([]);
      setBusy(false);
    }
  }

  function finish(text: string, actions: string[]) {
    insert("chat_messages", { role: "assistant", text, actions });
    setLive([]);
    setBusy(false);
  }

  function clear() {
    convo.current = [];
    for (const m of storeRef.current.chat_messages) remove("chat_messages", m.id, { silent: true });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/20 md:bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-line bg-surface shadow-pop"
          >
            <header className="flex items-center justify-between border-b border-line px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
              <div>
                <div className="display text-[17px] font-semibold">Ask Claude</div>
                <div className="text-[11.5px] text-muted">Haiku · can read and log your data</div>
              </div>
              <div className="flex items-center gap-1">
                <button aria-label="Clear conversation" title="Clear conversation" className="btn btn-ghost px-1.5" onClick={clear}>
                  <Eraser size={16} />
                </button>
                <button aria-label="Close" className="btn btn-ghost px-1.5" onClick={onClose}>
                  <X size={17} />
                </button>
              </div>
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
              {history.length === 0 && live.length === 0 && (
                <div className="rise">
                  <p className="mb-3 text-[13.5px] text-ink-2">Tell me what happened or ask about anything in your daybook.</p>
                  <div className="flex flex-col items-start gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-lg border border-line px-3 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3">
                {[...history.map((m) => ({ role: m.role, text: m.text, actions: m.actions ?? [], key: m.id, pending: false })), ...live.map((m, i) => ({ ...m, key: `live${i}` }))].map((m) => (
                  <motion.div
                    key={m.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cx("max-w-[88%] text-[14px] leading-relaxed", m.role === "user" ? "self-end rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-bg" : "self-start")}
                  >
                    {m.role === "assistant" && m.actions.length > 0 && (
                      <div className="mb-1.5 flex flex-col gap-1">
                        {m.actions.map((a, i) => (
                          <span key={i} className="inline-flex items-start gap-1.5 rounded-md bg-good-soft px-2 py-1 text-[12.5px] text-good">
                            <svg width="12" height="12" viewBox="0 0 16 16" className="mt-[3px] shrink-0">
                              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.text ? <Md text={m.text} /> : null}
                    {m.pending && (
                      <span className="mt-1 inline-flex gap-1" aria-label="Thinking">
                        {[0, 1, 2].map((i) => (
                          <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-muted" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
                        ))}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
              {error && <p className="mt-3 rounded-md bg-pen-soft px-3 py-2 text-[13px] text-pen">{error}</p>}
            </div>

            <form
              className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),12px)]"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className="flex items-end gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent">
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="max-h-32 flex-1 resize-none bg-transparent focus-visible:outline-none text-[14.5px] outline-none placeholder:text-muted"
                  placeholder="Log 200k grab, or ask a question"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                />
                <button aria-label="Send" disabled={busy || !input.trim()} className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-bg transition-opacity", (busy || !input.trim()) && "opacity-30")}>
                  <ArrowUp size={16} />
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
