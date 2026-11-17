"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabase();
    const { error, data } =
      mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up" && !data.session) setMsg("Check your inbox to confirm the address, then sign in.");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 ruled">
      <form onSubmit={submit} className="card w-full max-w-[360px] p-6 shadow-pop rise">
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg mb-4" />
        <h1 className="display text-[26px] font-semibold leading-tight">
          {mode === "in" ? "Open your daybook" : "Start your daybook"}
        </h1>
        <p className="text-ink-2 mt-1 mb-5 text-[13.5px]">
          One account, synced across your phone and laptop.
        </p>
        <label className="label block mb-1">Email</label>
        <input className="field mb-3" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label block mb-1">Password</label>
        <input
          className="field mb-4"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {msg && <p className="mb-3 text-[13px] text-pen">{msg}</p>}
        <button disabled={busy} className="btn btn-primary w-full justify-center py-2">
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="mt-3 w-full text-center text-[13px] text-muted hover:text-ink"
        >
          {mode === "in" ? "First time here? Create your account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
