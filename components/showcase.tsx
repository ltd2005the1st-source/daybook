"use client";
import { useState } from "react";
import { useData } from "./data";

/** The public "tester" account (PIN 0000). The owner can replace its copy with today's dashboard. */
export function Showcase() {
  const { session, toast } = useData();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ action: "showcase", mode: "refresh" }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      toast(res.ok ? "Tester account now shows a fresh copy of your dashboard." : d.error ?? `The server said ${res.status}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3">
      <span className="label mb-1 block">Showcase account</span>
      <p className="mb-2 text-[13px] text-muted-foreground">
        Anyone can sign in as <b>tester</b> with PIN <b>0000</b> to see a copy of your dashboard. Changes there never touch your data.
      </p>
      <button type="button" className="btn btn-line" disabled={busy} onClick={refresh}>
        {busy ? "Copying…" : "Refresh tester copy"}
      </button>
    </div>
  );
}
