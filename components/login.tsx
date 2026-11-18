"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { cx } from "@/lib/format";
import { sec } from "@/lib/motion";

type Screen = "loading" | "signin" | "setup" | "convert";

const USERNAME_KEY = "daybook:username";

async function call(body: Record<string, unknown>, token?: string) {
  const res = await fetch("/api/auth/pin", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; session?: { access_token: string; refresh_token: string }; ok?: boolean };
  return { ok: res.ok, ...data };
}

/** Four boxes over one numeric input, so the phone shows its number pad and paste still works. Digits are shown as typed. */
export function PinInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  label,
  shake,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  label: string;
  shake?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      key={shake}
      animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
      transition={{ duration: sec(0.36), ease: [0.65, 0, 0.35, 1] }}
      className="relative mb-4"
      onClick={() => ref.current?.focus()}
    >
      <input
        ref={ref}
        aria-label={label}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={4}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          onChange(v);
          if (v.length === 4) onComplete?.(v);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <div className="grid grid-cols-4 gap-2.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => {
          const filled = i < value.length;
          const current = focused && i === Math.min(value.length, 3);
          return (
            <div
              key={i}
              className={cx(
                "flex h-14 items-center justify-center rounded-lg border bg-surface transition-colors duration-200",
                current ? "border-accent ring-2 ring-accent/20" : "border-line-strong",
              )}
            >
              {filled && (
                <motion.span
                  key={value[i]}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: sec(0.18), ease: [0.65, 0, 0.35, 1] }}
                  className="num text-[24px] font-semibold text-ink"
                >
                  {value[i]}
                </motion.span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export function Login() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    try {
      setUsername(localStorage.getItem(USERNAME_KEY) ?? "");
    } catch {}
    fetch("/api/auth/pin")
      .then((r) => r.json())
      .then((d: { state?: Screen; error?: string }) => {
        if (d.state) setScreen(d.state);
        else {
          setScreen("signin");
          setMsg(d.error ?? "Couldn’t reach the server.");
        }
      })
      .catch(() => {
        setScreen("signin");
        setMsg("Couldn’t reach the server. Check your connection.");
      });
  }, []);

  async function finish(r: Awaited<ReturnType<typeof call>>) {
    if (!r.ok || !r.session) {
      setMsg(r.error ?? "Something went wrong.");
      setPin("");
      setPin2("");
      setShake((n) => n + 1);
      setBusy(false);
      return;
    }
    try {
      localStorage.setItem(USERNAME_KEY, username.trim().toLowerCase());
    } catch {}
    // Supabase keeps this session on the device and refreshes it, so you stay signed in.
    const { error } = await supabase().auth.setSession(r.session);
    if (error) {
      setMsg(`Signed in, but this device couldn’t keep the session: ${error.message}`);
      setBusy(false);
    }
  }

  async function submit(currentPin = pin) {
    if (busy) return;
    setMsg(null);
    if (!username.trim()) return setMsg("Enter your username.");
    if (currentPin.length !== 4) return setMsg("Your PIN is 4 digits.");
    if (screen !== "signin" && pin2 !== currentPin) {
      setShake((n) => n + 1);
      return setMsg("The two PINs don’t match.");
    }
    setBusy(true);
    if (screen === "signin") await finish(await call({ action: "signin", username, pin: currentPin }));
    else if (screen === "setup") await finish(await call({ action: "create", username, pin: currentPin }));
    else await finish(await call({ action: "convert", username, pin: currentPin, email, password }));
  }

  const title =
    screen === "setup" ? "Start your daybook" : screen === "convert" ? "Switch to a username and PIN" : "Open your daybook";
  const sub =
    screen === "setup"
      ? "Pick a username and a 4-digit PIN. You’ll stay signed in on each device."
      : screen === "convert"
        ? "Sign in once with the email and password you used before, then choose your username and PIN."
        : "You’ll stay signed in on this device.";

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 ruled">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="card w-full max-w-[340px] p-6 shadow-pop rise"
      >
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg mb-4" />
        <h1 className="display text-[26px] font-semibold leading-tight text-balance">{title}</h1>
        <p className="text-ink-2 mt-1 mb-5 text-[13.5px]">{sub}</p>

        {screen === "loading" ? (
          <p className="label">One moment…</p>
        ) : (
          <>
            {screen === "convert" && (
              <>
                <label className="label block mb-1">Old email</label>
                <input className="field mb-3" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label className="label block mb-1">Old password</label>
                <input className="field mb-4" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="mb-4 border-t border-line" />
              </>
            )}
            <label className="label block mb-1">Username</label>
            <input
              className="field mb-4"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="e.g. dat"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
            />
            <label className="label block mb-1.5">{screen === "signin" ? "PIN" : "Choose a PIN"}</label>
            <PinInput
              label="PIN"
              value={pin}
              onChange={setPin}
              autoFocus={screen === "signin" && !!username}
              onComplete={(v) => screen === "signin" && submit(v)}
              shake={shake}
            />
            {screen !== "signin" && (
              <>
                <label className="label block mb-1.5">Type it again</label>
                <PinInput label="Repeat PIN" value={pin2} onChange={setPin2} shake={shake} />
              </>
            )}
            {msg && (
              <p role="alert" className="mb-3 text-[13px] text-pen">
                {msg}
              </p>
            )}
            <button disabled={busy} className="btn btn-primary w-full justify-center py-2">
              {busy ? "One moment…" : screen === "signin" ? "Sign in" : screen === "setup" ? "Create my daybook" : "Switch and sign in"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
