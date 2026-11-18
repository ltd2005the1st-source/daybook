"use client";
import { useEffect, useState } from "react";
import { Bell, Download, Upload } from "lucide-react";
import { ChangePin } from "@/components/change-pin";
import { useData } from "@/components/data";
import { ConfirmButton, Field, Page, PageHeader, Section } from "@/components/ui";
import { remindersFor, fmtAt } from "@/lib/reminders";
import { today } from "@/lib/dates";
import { cx } from "@/lib/format";
import { TABLES, type Store } from "@/lib/types";

/* ---------- Backups ---------- */

type Backup = { data: Partial<Store>; settings: Record<string, string> };
// Preferences kept in this browser (theme, name, calendar view…). The local data store itself is in `data`.
const isSetting = (k: string) => /^daybook[.:]/.test(k) && k !== "daybook.store.v1";

function downloadBackup(store: Store) {
  const settings: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (isSetting(k)) settings[k] = localStorage.getItem(k) ?? "";
    }
  } catch {}
  const counts = Object.fromEntries(TABLES.map((t) => [t, store[t].length]));
  const file = { app: "daybook", version: 1, exported_at: new Date().toISOString(), counts, settings, data: store };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `daybook-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Reads a new-style backup ({ app, data, settings }) or an older one that was just the data. */
function readBackup(raw: unknown): Backup {
  if (!raw || typeof raw !== "object") throw new Error("not a backup");
  const r = raw as Record<string, unknown>;
  const data = (r.app === "daybook" ? r.data : r) as Partial<Store>;
  if (!data || typeof data !== "object" || !TABLES.some((t) => Array.isArray(data[t]))) throw new Error("not a backup");
  const settings = r.app === "daybook" && r.settings && typeof r.settings === "object" ? (r.settings as Record<string, string>) : {};
  return { data, settings };
}

function restoreSettings(settings: Record<string, string>) {
  try {
    Object.entries(settings).forEach(([k, v]) => isSetting(k) && typeof v === "string" && localStorage.getItem(k) === null && localStorage.setItem(k, v));
  } catch {}
}

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function SettingsPage() {
  const { store, online, session, resetLocal, loadSeed, restoreBackup, toast, storeRef } = useData();
  const [restoring, setRestoring] = useState(false);
  const [name, setName] = useState("");
  const [push, setPush] = useState<"unsupported" | "off" | "on" | "denied">("off");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem("daybook.name") ?? "");
    } catch {}
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPush("unsupported");
      return;
    }
    if (Notification.permission === "denied") setPush("denied");
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => s && setPush("on"));
  }, []);

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };

  async function enablePush() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return toast("Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to the server settings first.");
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPush("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
      const res = await fetch("/api/push", { method: "POST", headers: authHeaders, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setPush("on");
      toast("Reminders are on for this device");
    } catch (e) {
      toast(`Couldn’t turn on reminders: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: authHeaders, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setPush("off");
  }

  const upcoming = remindersFor(store, today()).sort((a, b) => a.at - b.at);

  return (
    <Page>
      <PageHeader eyebrow="Settings" title="Your daybook" />

      <Section title="You">
        <Field label="What should Daybook call you?">
          <input
            className="field max-w-xs"
            value={name}
            placeholder="Your first name"
            onChange={(e) => {
              setName(e.target.value);
              try {
                localStorage.setItem("daybook.name", e.target.value);
              } catch {}
            }}
          />
        </Field>
        {online && session && (
          <Field label={`Signed in as ${(session.user.app_metadata?.username as string | undefined) ?? session.user.email}`}>
            <ChangePin />
          </Field>
        )}
      </Section>

      <Section title="Reminders on this device">
        {!online ? (
          <p className="text-[13.5px] text-ink-2">Phone reminders need the online version (Supabase). You are in local mode, so reminders show only inside the app.</p>
        ) : push === "unsupported" ? (
          <p className="text-[13.5px] text-ink-2">
            This browser can’t receive push reminders. On iPhone, open Daybook in Safari, tap Share → Add to Home Screen, then open it from the home screen and come back here.
          </p>
        ) : push === "denied" ? (
          <p className="text-[13.5px] text-pen">Notifications are blocked for this site. Allow them in the browser’s site settings, then reload.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {push === "on" ? (
              <>
                <span className="text-[13.5px] text-good">On for this device.</span>
                <button className="btn btn-line" onClick={() => fetch("/api/push", { method: "PUT", headers: authHeaders }).then(() => toast("Test sent"))}>
                  <Bell size={15} /> Send a test
                </button>
                <button className="btn btn-ghost" onClick={disablePush}>
                  Turn off
                </button>
              </>
            ) : (
              <button disabled={busy} className="btn btn-primary" onClick={enablePush}>
                <Bell size={15} /> Turn on reminders
              </button>
            )}
          </div>
        )}
        <div className="mt-4">
          <div className="label mb-1.5">Today’s reminders</div>
          {upcoming.length === 0 && <p className="text-[13.5px] text-muted">None today.</p>}
          <ul>
            {upcoming.map((r) => (
              <li key={r.key} className="flex gap-3 border-b border-line py-1.5 text-[13.5px]">
                <span className="num w-12 text-muted">{fmtAt(r.at)}</span>
                <span>{r.title}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">Homework reminders follow each student’s check time minus their “remind me” minutes. Change them on the Teaching page.</p>
        </div>
      </Section>

      <Section title="Data">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-line" onClick={() => downloadBackup(storeRef.current)}>
            <Download size={15} /> Download my data
          </button>
          <label className={cx("btn btn-line cursor-pointer", restoring && "pointer-events-none opacity-50")}>
            <Upload size={15} /> {restoring ? "Restoring…" : "Restore from file"}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                let parsed: Backup;
                try {
                  parsed = readBackup(JSON.parse(await f.text()));
                } catch {
                  toast("That file isn’t a Daybook backup.");
                  return;
                }
                setRestoring(true);
                try {
                  const n = await restoreBackup(parsed.data);
                  restoreSettings(parsed.settings);
                  toast(n ? `Restored ${n} ${n === 1 ? "item" : "items"} from the backup.` : "Nothing to restore: everything in that file is already here.");
                } finally {
                  setRestoring(false);
                }
              }}
            />
          </label>
          {!online && (
            <ConfirmButton className="btn btn-ghost text-pen" confirmLabel="Replace all data?" onConfirm={resetLocal}>
              Reset to starter data
            </ConfirmButton>
          )}
          {online && store.students.length === 0 && (
            <button className="btn btn-primary" onClick={loadSeed}>
              Load starter data
            </button>
          )}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          The download has everything: calendar, classes, students, tasks, money, food, habits, music and your preferences. Restoring only adds back what’s missing; it never
          changes or deletes anything you have now.
        </p>
        <p className="mt-1 text-[12px] text-muted">
          {online ? "Synced through Supabase. Changes appear on your other devices within a second." : "Local mode: everything is saved in this browser only."}
        </p>
      </Section>

      <Section title="Google Calendar">
        <p className="text-[13.5px] text-ink-2">
          Daybook keeps its own calendar, built from your class schedule and routines. Two-way Google Calendar sync is planned for a later version, once you decide whether to keep Google Calendar at all.
        </p>
      </Section>
    </Page>
  );
}
