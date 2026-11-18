import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  admin,
  allUsers,
  clearMisses,
  findByUsername,
  lockedFor,
  lockMessage,
  normUsername,
  PIN_RE,
  pinPassword,
  recordMiss,
  sessionFor,
  usernameOf,
} from "@/lib/pin-auth";
import { userFromRequest } from "@/lib/server";
import { isShowcase, ownerOf, refreshShowcase, SHOWCASE_VERSION } from "@/lib/showcase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => NextResponse.json({ error }, { status });
const slow = () => new Promise((r) => setTimeout(r, 600)); // takes the edge off rapid guessing

/** Which screen to show: create the first account, switch an email account over, or sign in. */
export async function GET() {
  try {
    const users = await allUsers();
    const state = users.length === 0 ? "setup" : users.some((u) => usernameOf(u)) ? "signin" : "convert";
    return NextResponse.json({ state });
  } catch (e) {
    return no((e as Error).message, 500);
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return no("Bad request.");
  }
  try {
    switch (body.action) {
      case "signin":
        return await signIn(body);
      case "create":
        return await create(body);
      case "convert":
        return await convert(body);
      case "change":
        return await change(req, body);
      case "showcase":
        return await showcase(req, body);
      default:
        return no("Unknown action.");
    }
  } catch (e) {
    console.error("pin auth", e);
    return no((e as Error).message || "Something went wrong.", 500);
  }
}

async function signIn(body: Record<string, unknown>) {
  const username = normUsername(body.username);
  const pin = String(body.pin ?? "");
  if (!username || !PIN_RE.test(pin)) return no("Enter your username and 4-digit PIN.");
  const user = await findByUsername(username);
  if (!user?.email) {
    await slow();
    return no("Wrong username or PIN.", 401);
  }
  const demo = isShowcase(user); // the public "tester" account: PIN is no secret, so no lockout
  const locked = demo ? 0 : lockedFor(user);
  if (locked) return no(lockMessage(locked), 429);
  const session = await sessionFor(user.email, pinPassword(user.id, pin));
  if (!session) {
    await slow();
    if (demo) return no("Wrong username or PIN.", 401);
    const { left, lockedMin } = await recordMiss(user);
    if (lockedMin) return no(lockMessage(lockedMin), 429);
    return no(left <= 2 ? `Wrong username or PIN. ${left} ${left === 1 ? "try" : "tries"} left before a short lock.` : "Wrong username or PIN.", 401);
  }
  await clearMisses(user);
  return NextResponse.json({ session });
}

/** The very first account on a fresh project. After that, new accounts can't be made from the sign-in page. */
async function create(body: Record<string, unknown>) {
  const username = normUsername(body.username);
  const pin = String(body.pin ?? "");
  if (!username) return no("Usernames are 3–24 letters, numbers, dots, dashes or underscores.");
  if (!PIN_RE.test(pin)) return no("Your PIN is 4 digits.");
  if ((await allUsers()).length > 0) return no("This Daybook already has an account. Sign in instead.", 403);
  const sb = admin();
  const email = `${username}@daybook.invalid`; // never emailed; just Supabase's account key
  const { data, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomBytes(24).toString("hex"),
    app_metadata: { username },
  });
  if (error || !data.user) return no(error?.message ?? "Could not create the account.", 500);
  const password = pinPassword(data.user.id, pin);
  const upd = await sb.auth.admin.updateUserById(data.user.id, { password });
  if (upd.error) return no(upd.error.message, 500);
  const session = await sessionFor(email, password);
  return session ? NextResponse.json({ session }) : no("Account made, but signing in failed. Try signing in.", 500);
}

/** Moves an account made with email + password over to username + PIN. Needs the old password once. */
async function convert(body: Record<string, unknown>) {
  const username = normUsername(body.username);
  const pin = String(body.pin ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const oldPassword = String(body.password ?? "");
  if (!email || !oldPassword) return no("Enter the email and password you signed up with.");
  if (!username) return no("Usernames are 3–24 letters, numbers, dots, dashes or underscores.");
  if (!PIN_RE.test(pin)) return no("Your PIN is 4 digits.");
  const users = await allUsers();
  if (users.some((u) => usernameOf(u) === username)) return no("That username is taken.", 409);
  const proof = await sessionFor(email, oldPassword);
  if (!proof) {
    await slow();
    return no("That email and password don’t match.", 401);
  }
  const user = users.find((u) => u.email?.toLowerCase() === email);
  if (!user) return no("Account not found.", 404);
  const password = pinPassword(user.id, pin);
  const { error } = await admin().auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, username, pin_fails: 0, pin_locked_until: null },
  });
  if (error) return no(error.message, 500);
  const session = await sessionFor(user.email!, password);
  return session ? NextResponse.json({ session }) : no("Switched, but signing in failed. Try signing in.", 500);
}

/** Change the PIN while signed in. Wrong current PINs count toward the lock like at sign-in. */
async function change(req: Request, body: Record<string, unknown>) {
  const auth = await userFromRequest(req);
  if (!auth) return no("Sign in first.", 401);
  const current = String(body.current ?? "");
  const next = String(body.pin ?? "");
  if (!PIN_RE.test(current) || !PIN_RE.test(next)) return no("PINs are 4 digits.");
  const { data } = await admin().auth.admin.getUserById(auth.user.id);
  const user = data.user;
  if (!user?.email) return no("Account not found.", 404);
  if (isShowcase(user)) return no("The tester account’s PIN stays 0000 so anyone can open it.", 403);
  const locked = lockedFor(user);
  if (locked) return no(lockMessage(locked), 429);
  if (!(await sessionFor(user.email, pinPassword(user.id, current)))) {
    await slow();
    const { lockedMin } = await recordMiss(user);
    return no(lockedMin ? lockMessage(lockedMin) : "Your current PIN is wrong.", lockedMin ? 429 : 401);
  }
  const { error } = await admin().auth.admin.updateUserById(user.id, {
    password: pinPassword(user.id, next),
    app_metadata: { ...user.app_metadata, pin_fails: 0, pin_locked_until: null },
  });
  if (error) return no(error.message, 500);
  return NextResponse.json({ ok: true });
}

/**
 * The owner makes (or refreshes) the public "tester" account with a copy of their data.
 * mode "ensure" only makes it when it doesn't exist yet (or is from an older version); "refresh" always replaces its copy.
 */
async function showcase(req: Request, body: Record<string, unknown>) {
  const auth = await userFromRequest(req);
  if (!auth) return no("Sign in first.", 401);
  const users = await allUsers();
  const owner = await ownerOf(users);
  if (!owner || owner.id !== auth.user.id) return no("Only the owner can do this.", 403);
  const current = users.find(isShowcase);
  if (body.mode === "ensure" && current && Number(current.app_metadata?.showcase_version ?? 1) >= SHOWCASE_VERSION) return NextResponse.json({ ok: true, made: false });
  const counts = await refreshShowcase(owner.id);
  return NextResponse.json({ ok: true, made: true, counts });
}
