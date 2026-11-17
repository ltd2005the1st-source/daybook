"use client";
import { useState } from "react";
import { PinInput } from "./login";
import { useData } from "./data";

/** Change the sign-in PIN. Asks for the current one first. */
export function ChangePin() {
  const { session, toast } = useData();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  if (!open)
    return (
      <button className="btn btn-line" onClick={() => setOpen(true)}>
        Change PIN
      </button>
    );

  async function save() {
    setMsg(null);
    if (cur.length !== 4 || next.length !== 4) return setMsg("PINs are 4 digits.");
    if (next !== again) {
      setShake((n) => n + 1);
      return setMsg("The new PINs don’t match.");
    }
    setBusy(true);
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ action: "change", current: cur, pin: next }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setShake((n) => n + 1);
      setCur("");
      return setMsg(d.error ?? "Couldn’t change the PIN.");
    }
    toast("PIN changed");
    setOpen(false);
    setCur("");
    setNext("");
    setAgain("");
  }

  return (
    <form
      className="max-w-[280px]"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="label block mb-1.5">Current PIN</label>
      <PinInput label="Current PIN" value={cur} onChange={setCur} autoFocus shake={shake} />
      <label className="label block mb-1.5">New PIN</label>
      <PinInput label="New PIN" value={next} onChange={setNext} shake={shake} />
      <label className="label block mb-1.5">New PIN again</label>
      <PinInput label="Repeat new PIN" value={again} onChange={setAgain} shake={shake} />
      {msg && (
        <p role="alert" className="mb-3 text-[13px] text-pen">
          {msg}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save PIN"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
