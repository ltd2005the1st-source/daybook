"use client";
import { useEffect } from "react";
import { useData } from "./data";
import { vnNow } from "@/lib/dates";
import { native } from "@/lib/native";
import { upcomingReminders } from "@/lib/reminders";

/**
 * Inside the Android app: links the phone to your account once (so it can refresh reminders in the
 * background), and hands it the next two days of reminders whenever anything changes.
 */
export function NativeSync() {
  const { store, session, online, ready } = useData();

  useEffect(() => {
    const app = native();
    if (!app || !online || !session || app.hasDeviceToken()) return;
    fetch("/api/device", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { token?: string } | null) => j?.token && app.setDeviceToken(j.token))
      .catch(() => {});
  }, [online, session]);

  useEffect(() => {
    const app = native();
    if (!app || !ready || (online && !session)) return;
    const t = window.setTimeout(() => {
      try {
        app.schedule(JSON.stringify(upcomingReminders(store, vnNow().date)));
      } catch {}
    }, 1500);
    return () => window.clearTimeout(t);
  }, [store, ready, online, session]);

  return null;
}
