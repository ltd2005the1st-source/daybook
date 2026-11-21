"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useData } from "@/components/data";
import { ONLINE, supabase } from "@/lib/supabase";

/**
 * Free notes beside The register. Saved on the account (user_metadata.register_notes), the same way
 * the Apps list is, so they follow you between phone and laptop without a new table. A copy is kept
 * in this browser so the box fills instantly; the account copy wins when it arrives.
 */
const KEY = "register_notes";
const CACHE_KEY = "daybook:register-notes";

let notes = "";
let started = false;
/** True while this device has edits the server hasn't confirmed: don't let a refresh overwrite them. */
let dirty = false;
const listeners = new Set<() => void>();

function setNotes(next: string) {
  notes = next;
  try {
    localStorage.setItem(CACHE_KEY, next);
  } catch {
    /* storage blocked: keep it in memory */
  }
  listeners.forEach((f) => f());
}

async function refresh() {
  const { data, error } = await supabase().auth.getUser();
  if (error || !data.user || dirty) return;
  const saved = data.user.user_metadata?.[KEY];
  setNotes(typeof saved === "string" ? saved : "");
}

function start() {
  if (started) return;
  started = true;
  try {
    notes = localStorage.getItem(CACHE_KEY) ?? "";
  } catch {
    /* no cache */
  }
  if (!ONLINE) return;
  refresh();
  supabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") setTimeout(refresh, 0);
  });
  // Picks up notes written on another device when Daybook comes back to the front.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
}

function subscribe(f: () => void) {
  listeners.add(f);
  start();
  return () => listeners.delete(f);
}

let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();

function save(next: string, toast: (t: string) => void, now = false) {
  setNotes(next);
  if (!ONLINE) return;
  dirty = true;
  clearTimeout(timer);
  const send = () => {
    // One write at a time, always sending the latest text.
    saving = saving.then(async () => {
      const text = notes;
      const { error } = await supabase().auth.updateUser({ data: { [KEY]: text } });
      if (error) toast(`Couldn't save your notes: ${error.message}`);
      else if (text === notes) dirty = false;
    });
  };
  if (now) send();
  else timer = setTimeout(send, 600);
}

export function RegisterNotes() {
  const { toast } = useData();
  const value = useSyncExternalStore(subscribe, () => notes, () => "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // Grow to fit every line, so the notes always show in full (no inner scrollbar).
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Width changes rewrap the text, so refit when the column resizes.
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      aria-label="Notes"
      rows={3}
      value={value}
      spellCheck={focused}
      placeholder="Type anything you want to keep in mind…"
      onFocus={() => setFocused(true)}
      onChange={(e) => save(e.target.value, toast)}
      onBlur={(e) => {
        setFocused(false);
        if (dirty) save(e.target.value, toast, true);
      }}
      className="field block min-h-[96px] resize-none overflow-hidden whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"
    />
  );
}
