import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { serviceClient } from "./server";

/**
 * Username + 4-digit PIN sign-in, built on Supabase's normal email/password accounts.
 *
 * The browser never learns the real password. The server turns the PIN into a long password
 * with a secret only it knows (PIN_PEPPER), so nobody can guess PINs against Supabase directly:
 * every guess has to come through this server, which locks the account after repeated misses.
 */

export const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;
export const PIN_RE = /^\d{4}$/;

const FREE_TRIES = 5; // wrong PINs before the first lock
const BASE_LOCK_MIN = 15; // first lock; doubles with each further miss, up to a day

export function normUsername(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const v = u.trim().toLowerCase();
  return USERNAME_RE.test(v) ? v : null;
}

export function pinPassword(userId: string, pin: string): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper || pepper.length < 16) throw new Error("PIN_PEPPER is missing or too short on the server.");
  return "dbk_" + createHmac("sha256", pepper).update(`${userId}:${pin}`).digest("hex");
}

export function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function admin() {
  const sb = serviceClient();
  if (!sb) throw new Error("Supabase server keys are missing.");
  return sb;
}

export function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** All accounts (a personal app has one or two, so one page is plenty). */
export async function allUsers(): Promise<User[]> {
  const { data, error } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users;
}

export const usernameOf = (u: User) => (u.app_metadata?.username as string | undefined) ?? null;

export async function findByUsername(username: string): Promise<User | null> {
  return (await allUsers()).find((u) => usernameOf(u) === username) ?? null;
}

type LockState = { pin_fails?: number; pin_locked_until?: string | null };

/** Minutes left on a lock, or 0. */
export function lockedFor(u: User): number {
  const until = (u.app_metadata as LockState)?.pin_locked_until;
  if (!until) return 0;
  const ms = new Date(until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/** Records a wrong PIN and returns how many tries are left before a lock (0 means it just locked). */
export async function recordMiss(u: User): Promise<{ left: number; lockedMin: number }> {
  const fails = ((u.app_metadata as LockState)?.pin_fails ?? 0) + 1;
  let lockedMin = 0;
  let until: string | null = null;
  if (fails >= FREE_TRIES) {
    lockedMin = Math.min(BASE_LOCK_MIN * 2 ** (fails - FREE_TRIES), 24 * 60);
    until = new Date(Date.now() + lockedMin * 60000).toISOString();
  }
  await admin().auth.admin.updateUserById(u.id, {
    app_metadata: { ...u.app_metadata, pin_fails: fails, pin_locked_until: until },
  });
  return { left: Math.max(0, FREE_TRIES - fails), lockedMin };
}

export async function clearMisses(u: User) {
  const m = u.app_metadata as LockState;
  if (!m?.pin_fails && !m?.pin_locked_until) return;
  await admin().auth.admin.updateUserById(u.id, {
    app_metadata: { ...u.app_metadata, pin_fails: 0, pin_locked_until: null },
  });
}

/** Signs in with the derived password and returns the session for the browser to keep. */
export async function sessionFor(email: string, password: string) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

export const lockMessage = (min: number) =>
  `Too many wrong PINs. Try again in ${min >= 60 ? `${Math.ceil(min / 60)} hour${min >= 120 ? "s" : ""}` : `${min} minute${min === 1 ? "" : "s"}`}.`;
