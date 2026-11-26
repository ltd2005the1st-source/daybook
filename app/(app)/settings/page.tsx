"use client";
import { useEffect, useState } from "react";
import { Bell, Download, Upload } from "lucide-react";
import { ChangePin } from "@/components/change-pin";
import { Showcase } from "@/components/showcase";
import { useData } from "@/components/data";
import { SoundSettings } from "@/components/sound-settings";
import { ConfirmButton, Field, Page, PageHeader, Section } from "@/components/ui";
import { remindersFor, fmtAt } from "@/lib/reminders";
import { today } from "@/lib/dates";
import { cx } from "@/lib/format";
import { native } from "@/lib/native";
import { notebookSnapshot, restoreNotes } from "@/components/notebook-store";
import { TABLES, type Store } from "@/lib/types";

/* ---------- Backups ---------- */

type Backup = { data: Partial<Store>; settings: Record<string, string>; notes?: unknown };
// Preferences kept in this browser (theme, name, calendar view…). The local data store itself is in `data`.
const isSetting = (k: string) => /^daybook[.:]/.test(k) && k !== "daybook.store.v1" && k !== "daybook.notebook.v1";

function downloadBackup(store: Store): boolean | void {
  const settings: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (isSetting(k)) settings[k] = localStorage.getItem(k) ?? "";
    }
  } catch {}
  const counts = Object.fromEntries(TABLES.map((t) => [t, store[t].length]));
  const notes = notebookSnapshot();
  const file = { app: "daybook", version: 1, exported_at: new Date().toISOString(), counts: { ...counts, notes: notes.length }, settings, data: store, notes };
  const text = JSON.stringify(file, null, 2);
  const app = native();
  // The Android app has no browser downloads, so it writes the file to Downloads itself.
  if (app) return app.saveFile(`daybook-backup-${today()}.json`, "application/json", text);
  const blob = new Blob([text], { type: "application/json" });
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
  return { data, settings, notes: r.app === "daybook" ? r.notes : undefined };
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
  // What happened the last time you turned reminders on or sent a test, kept on screen (a pop-up is too easy to miss).
  const [pushNote, setPushNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Inside the Android app, reminders are scheduled by the app itself (no web push there).
  const [inApp, setInApp] = useState(false);
  const [appAllowed, setAppAllowed] = useState(true);

  useEffect(() => {
    try {
      setName(localStorage.getItem("daybook.name") ?? "");
    } catch {}
    const app = native();
    if (app) {
      setInApp(true);
      setAppAllowed(app.notificationsAllowed());
      const onVis = () => document.visibilityState === "visible" && setAppAllowed(app.notificationsAllowed());
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPush("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPush("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => s && Notification.permission === "granted" && setPush("on"))
      .catch(() => {});
  }, []);

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };

  /** The service worker that shows notifications. Gives up after a few seconds instead of waiting forever. */
  async function worker() {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 6000)),
    ]);
    if (!reg) throw new Error("The background helper that shows notifications didn’t start. Close Daybook completely, open it again and retry.");
    return reg;
  }

  /** Subscribes this device (with the server's current key) and saves it on the server. */
  async function subscribe() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) throw new Error("The app is missing its push key (NEXT_PUBLIC_VAPID_PUBLIC_KEY) on Netlify.");
    const reg = await worker();
    const want = b64ToUint8(key);
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with an older key can never receive anything, so replace it.
    const have = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (sub && (!have || have.length !== want.length || have.some((v, i) => v !== want[i]))) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
    const res = await fetch("/api/push", { method: "POST", headers: authHeaders, body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `The server said ${res.status}.`);
    return sub;
  }

  async function enablePush() {
    setBusy(true);
    setPushNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPush("denied");
        return;
      }
      await subscribe();
      setPush("on");
      setPushNote({ ok: true, text: "Reminders are on for this device. Send a test to check." });
    } catch (e) {
      setPushNote({ ok: false, text: `Couldn’t turn on reminders: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setPushNote(null);
    try {
      if (Notification.permission !== "granted") {
        setPush("denied");
        return;
      }
      // Make sure this exact device is saved on the server (and re-save it if it went missing), then send to it.
      const sub = await subscribe();
      const res = await fetch("/api/push", { method: "PUT", headers: authHeaders, body: JSON.stringify({ endpoint: sub.endpoint }) });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        registered?: boolean;
        results?: { ok: boolean; status?: number; error?: string }[];
      };
      if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}.`);
      if (out.registered === false) throw new Error("This device isn’t saved on the server. Turn reminders off and on again.");
      const r = out.results?.[0];
      if (!out.ok) {
        const why =
          r?.status === 403 || r?.status === 401
            ? "the push service rejected the server’s keys (VAPID). The keys on Netlify don’t match each other."
            : r?.status === 404 || r?.status === 410
              ? "this device’s registration expired. Tap Turn on reminders again."
              : `${r?.status ? `error ${r.status}: ` : ""}${r?.error ?? "unknown error"}`;
        throw new Error(`The test couldn’t be delivered: ${why}`);
      }
      setPushNote({
        ok: true,
        text: "Test sent. It should appear within a few seconds. If it doesn’t, notifications for Daybook are switched off in your phone’s settings (see below).",
      });
    } catch (e) {
      setPushNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setPushNote(null);
    const reg = await worker().catch(() => null);
    if (!reg) return setPush("off");
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
            {session.user.app_metadata?.showcase ? (
              <p className="text-[13px] text-muted-foreground">This is the public showcase account. Its PIN stays 0000.</p>
            ) : (
              <ChangePin />
            )}
          </Field>
        )}
        {online && session && !session.user.app_metadata?.showcase && <Showcase />}
      </Section>

      <Section title="Sounds">
        <SoundSettings />
      </Section>

      <Section title="Reminders on this device">
        {inApp ? (
          appAllowed ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] text-success-foreground">On. The Daybook app schedules them on this phone.</span>
              <button className="btn btn-line" onClick={() => native()?.testNotification()}>
                <Bell size={15} /> Send a test
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] text-destructive-foreground">Notifications are off for Daybook on this phone.</span>
              <button className="btn btn-primary" onClick={() => native()?.requestNotifications()}>
                <Bell size={15} /> Allow notifications
              </button>
            </div>
          )
        ) : !online ? (
          <p className="text-[13.5px] text-foreground/80">Phone reminders need the online version (Supabase). You are in local mode, so reminders show only inside the app.</p>
        ) : push === "unsupported" ? (
          <p className="text-[13.5px] text-foreground/80">
            This browser can’t receive push reminders. On iPhone, open Daybook in Safari, tap Share → Add to Home Screen, then open it from the home screen and come back here.
          </p>
        ) : push === "denied" ? (
          <p className="text-[13.5px] text-destructive-foreground">
            Notifications are blocked. In the Android app: phone Settings → Apps → Daybook → Notifications → allow. In a browser: the site’s settings →
            Notifications → Allow. Then close and reopen Daybook.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {push === "on" ? (
              <>
                <span className="text-[13.5px] text-success-foreground">On for this device.</span>
                <button className="btn btn-line" disabled={busy} onClick={sendTest}>
                  <Bell size={15} /> {busy ? "Sending…" : "Send a test"}
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
        {pushNote && (
          <p role="status" className={cx("mt-2 rounded-xl px-2.5 py-1.5 text-[13px]", pushNote.ok ? "bg-accent text-foreground/80" : "bg-destructive/10 text-destructive-foreground")}>
            {pushNote.text}
          </p>
        )}
        {!inApp && online && push !== "unsupported" && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Nothing arriving on Android? Open your phone’s Settings → Apps → Daybook → Notifications and make sure they’re allowed (in the browser, it’s the
            site’s notification setting).
          </p>
        )}
        <div className="mt-4">
          <div className="label mb-1.5">Today’s reminders</div>
          {upcoming.length === 0 && <p className="text-[13.5px] text-muted-foreground">None today.</p>}
          <ul>
            {upcoming.map((r) => (
              <li key={r.key} className="flex gap-3 border-b border-border py-1.5 text-[13.5px]">
                <span className="num w-12 text-muted-foreground">{fmtAt(r.at)}</span>
                <span>{r.title}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted-foreground">Homework reminders follow each student’s check time minus their “remind me” minutes. Change them on the Teaching page.</p>
        </div>
      </Section>

      <Section title="Data">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-line" onClick={() => {
              const saved = downloadBackup(storeRef.current);
              if (saved === true) toast("Saved to your Downloads folder");
              if (saved === false) toast("Couldn’t save the file");
            }}>
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
                  const n = (await restoreBackup(parsed.data)) + restoreNotes(parsed.notes);
                  restoreSettings(parsed.settings);
                  toast(n ? `Restored ${n} ${n === 1 ? "item" : "items"} from the backup.` : "Nothing to restore: everything in that file is already here.");
                } finally {
                  setRestoring(false);
                }
              }}
            />
          </label>
          {!online && (
            <ConfirmButton className="btn btn-ghost text-destructive-foreground" confirmLabel="Replace all data?" onConfirm={resetLocal}>
              Reset to starter data
            </ConfirmButton>
          )}
          {online && store.students.length === 0 && (
            <button className="btn btn-primary" onClick={loadSeed}>
              Load starter data
            </button>
          )}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          The download has everything: calendar, classes, students, tasks, money, food, habits, music, your notebook and your preferences. Restoring only adds back what’s missing; it never
          changes or deletes anything you have now.
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {online ? "Synced through Supabase. Changes appear on your other devices within a second." : "Local mode: everything is saved in this browser only."}
        </p>
      </Section>

      <Section title="Google Calendar">
        <p className="text-[13.5px] text-foreground/80">
          Daybook keeps its own calendar, built from your class schedule and routines. Two-way Google Calendar sync is planned for a later version, once you decide whether to keep Google Calendar at all.
        </p>
      </Section>
    </Page>
  );
}
