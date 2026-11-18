import { createHmac, timingSafeEqual } from "crypto";

/**
 * A long-lived key the Android app keeps so it can refresh reminders in the background
 * without a sign-in session: "<user id>.<signature>". Derived from PIN_PEPPER, so it needs no table.
 */
function sign(uid: string): string | null {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) return null;
  return createHmac("sha256", pepper).update(`device-reminders:${uid}`).digest("base64url");
}

export function deviceToken(uid: string): string | null {
  const sig = sign(uid);
  return sig ? `${uid}.${sig}` : null;
}

export function userFromDeviceToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const uid = token.slice(0, dot);
  const want = sign(uid);
  const given = token.slice(dot + 1);
  if (!want || want.length !== given.length) return null;
  return timingSafeEqual(Buffer.from(want), Buffer.from(given)) ? uid : null;
}
